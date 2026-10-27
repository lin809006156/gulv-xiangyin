/**
 * 古律象音 · 播放引擎（平台无关）
 * ---------------------------------------------------------------
 * 本模块只做「业务编排」：
 *   起卦结果 → 作曲 → 渲染 PCM → 交给后端出声 → 回报状态与进度。
 *
 * 「怎么出声」是平台专属的事，由各端注入的后端实现（契约见 core/backend.js）：
 *   web/js/audio-backend-web.js          —— Web Audio（网页版 + Capacitor APP）
 *   miniprogram/utils/audio-backend-mini.js —— InnerAudioContext（微信小程序）
 *
 * 如此拆分之后：
 *   · 改小程序播放逻辑 → 只动 miniprogram/，网页端一行不受影响；
 *   · 改网页播放逻辑   → 只动 web/，小程序一行不受影响；
 *   · 改共享逻辑（编曲、循环、导出）→ 动本文件，两端同时生效（应有之义）。
 *
 * 渲染统一走 core/render.js（纯 JS 生成 PCM），
 * 保证网页版与小程序版听到的波形完全一致。
 *
 * 播放模式：
 *   play(score)          —— 播一段既定乐谱（乐器试听、导出用）
 *   playGenerative(...)  —— 即兴连播：每轮全新编曲、叠尾相接、无终点
 *                           （卦象之音的默认听法，见下方「即兴连播」节）
 */

'use strict';

/* __IC_IIFE__ */
(function () {


const bootstrap = require('./bootstrap.js');
const renderScore = bootstrap.loadRender().renderScore;
const encodeWav = bootstrap.loadRender().encodeWav;

/** 探测运行环境
 *  ---------------------------------------------------------------
 * 判定顺序：**先看 wx**（小程序），再看 Node。
 * 理由 —— 小程序运行时虽无 process，但有些宿主（开发者工具的自动化测试、
 * 某些 uni-app 转译产物）会注入 process；若先判 Node 就会误判成 Node
 * 而走错分支（如去建 Web Audio 上下文，于是小程序端直接报
 * 「当前环境不支持 Web Audio API」）。故只要能认到 wx，就一律按小程序处理。 */
const HAS_WX = (typeof wx !== 'undefined' &&
  typeof wx.getSystemInfoSync === 'function');
const IS_MINIPROGRAM = HAS_WX;
const IS_NODE = !HAS_WX &&
  (typeof process !== 'undefined' &&
   process.versions && process.versions.node &&
   typeof window === 'undefined');

/** 格式化成 mm:ss */
function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 播放引擎
 */
class Player {
  /**
   * @param {object} opts
   *   backend —— 平台后端（见 core/backend.js 的契约）。缺省则用空后端
   *              （Node 环境只渲染不播放）。
   *   onProgress / onEnd / onError / onStateChange —— 状态回调
   */
  constructor(opts) {
    const o = opts || {};
    this.onProgress = o.onProgress || null;   // (elapsedSec, durationSec)
    this.onEnd = o.onEnd || null;
    this.onError = o.onError || null;
    this.onStateChange = o.onStateChange || null;

    // 平台后端：各端注入。缺省时用空后端（Node / 测试环境）
    this.backend = o.backend || bootstrap.createNullBackend();

    this.current = null;      // { score, pcm, duration }
    this.isPlaying = false;
    this.offset = 0;

    // 暂停/继续：挂起音频上下文，时间轴随之冻结，
    // 恢复后从原处接上（无缝），不必重新编曲渲染
    this._paused = false;

    // 循环播放：单曲循环（同一卦的音乐反复播放）
    this.loop = false;
    // 正在因循环而重播（用于避免重播时误触发 stopped 状态）
    this._replaying = false;
    // 已渲染的 PCM 缓存（循环重播时复用，免去重复渲染）
    this._lastPcm = null;
    this._lastScore = null;

    // 即兴连播会话（实时生成播放）；null 表示未在即兴
    this._gen = null;
    this._genTimer = null;

    // 渲染 Worker（浏览器）：编曲渲染搬离主线程
    this._worker = null;
    this._workerJobs = {};
    this._workerSeq = 0;
    this._workerFailed = false;

    // 预热池：提前编好放着，按下播放即刻出声
    this._readyPool = [];
    this._readyLoading = false;
    this._readyPromise = null;   // 在途的那一轮（预热中）
    this._readyNext = 0;
    this._readyKey = '';

    // 音层配置（疗愈频率 + 自然音层）
    this._ambient = { solfeggio: null, nature: {}, level: 1 };

    this._timer = null;
  }

  /* =============================================================
   * 平台检测
   * ============================================================= */

  /** 当前环境的能力描述 */
  get capability() {
    const b = this.backend;
    return {
      platform: b.name,
      canRender: true,
      canPlay: b.name !== 'Node',
      canExport: true
    };
  }

  /* =============================================================
   * 后端回调（本引擎提供给后端的 hooks）
   * ============================================================= */

  /** 组装给后端的回调集合 */
  _hooks() {
    const self = this;
    return {
      onProgress: (elapsed, duration) => {
        if (self.onProgress) self.onProgress(elapsed, duration);
      },
      onEnded: () => {
        self._handleEnd();
      },
      onRoundEnded: (g, round) => {
        self._onRoundEnded(g, round);
      },
      onStateChange: (state, progress) => {
        if (self.onStateChange) self.onStateChange(state, progress);
      },
      onError: (msg) => {
        if (self.onError) self.onError(msg);
      },
      /** 当前播放时长（进度上报用） */
      currentDuration: () => (self.current ? self.current.duration : 0),
      /** 引擎代为编曲渲染（后端在续播时调用） */
      composeRound: (g, roundNo) => self._genComposeRound(g, roundNo),
      /** 引擎当前的循环开关 */
      isLoop: () => self.loop
    };
  }

  /* =============================================================
   * 渲染
   * ============================================================= */

  /**
   * 渲染音符表（不播放）
   * @param {object} score
   * @param {object} opts { sampleRate, reverb, targetPeak }
   * @returns {object} pcm
   */
  render(score, opts) {
    return renderScore(score, opts || {});
  }

  /**
   * 渲染并导出 WAV
   * @returns {ArrayBuffer}
   */
  exportWav(score, opts) {
    return encodeWav(this.render(score, opts));
  }

  /* =============================================================
   * 播放
   * ============================================================= */

  /**
   * 播放
   * @param {object} score composeNotes 的输出
   * @param {object} opts { offset, sampleRate }
   */
  play(score, opts) {
    const o = opts || {};
    const replaying = this._replaying;
    if (!replaying) this.stop();

    let pcm;
    try {
      // 循环重播时复用已渲染的 PCM，免去重复渲染的开销
      if (replaying && this._lastPcm && this._lastScore === score) {
        pcm = this._lastPcm;
      } else {
        pcm = this.render(score, { sampleRate: o.sampleRate || 44100 });
        this._lastPcm = pcm;
        this._lastScore = score;
      }
    } catch (e) {
      if (this.onError) this.onError('渲染失败：' + e.message);
      return;
    }

    this.current = {
      score,
      pcm,
      duration: score.duration,
      offset: o.offset || 0
    };
    this.offset = o.offset || 0;

    this.backend.playScore(score, pcm, this.offset, this._hooks());
    this.isPlaying = true;
    this._startTick();
  }

  /**
   * 播放结束的统一处理
   * ---------------------------------------------------------------
   * 开启循环时，从头重播同一份乐谱；否则通知上层结束。
   * 各后端都走这里，保证循环行为三端一致。
   */
  _handleEnd() {
    if (this.loop && this.current && this.current.score) {
      const score = this.current.score;
      // 释放当前播放资源（不触发 stopped 状态），再从头播放
      this._teardownSources();
      this.current = null;
      this.isPlaying = false;
      this._replaying = true;
      try {
        this.play(score, { offset: 0 });
      } finally {
        this._replaying = false;
      }
      return;
    }
    this.isPlaying = false;
    this.current = null;
    if (this.onEnd) this.onEnd();
  }

  /* =============================================================
   * 即兴连播（实时生成播放）
   * ---------------------------------------------------------------
   * 与「一段音频反复播」有本质区别：
   *   ① 每一「轮」都是一次全新编曲 —— 卦象逻辑（调式、律、音色、
   *      六爻旋律与节奏）不变，但种子取「当前时间 + 随机数」，
   *      即兴变体每轮都新，故循环听下去每轮都有新意；
   *   ② 轮次之间以「叠尾」相接 —— 下一轮在上一轮尾音将尽时淡入，
   *      上一轮同时淡出，听上去绵延不绝（丝竹乐句接句之意）；
   *   ③ 播放中持续预渲染下一轮 —— 没有总时长，故不需要进度条。
   *
   * 网页端用 Web Audio 精确调度实现叠尾；
   * 小程序端 InnerAudioContext 无法交叉淡入，降级为「轮次顺序相接」
   * （仍是每轮新编，由后端的 onRoundEnded 回调续接）。
   * ============================================================= */

  /**
   * 开始即兴连播
   * @param {object} hex        卦对象
   * @param {object} cfg        deriveMusicConfig 的输出
   * @param {object} changedCfg 变卦配置（可选，尾声音色）
   * @param {object} opts { ambient, solfeggio, solfeggioLevel, sampleRate, onChange }
   *   ambient  —— 完整音层配置 { solfeggio:{freq,level}, nature:{...}, level }，
   *               传入后优先于旧的 solfeggio/solfeggioLevel 两参；
   *   onChange —— (info) => void；info = { round, section, elapsed, duration }
   */
  playGenerative(hex, cfg, changedCfg, opts) {
    const o = opts || {};
    this.stop();

    if (IS_NODE && this.backend.name === 'Node') {
      if (this.onError) this.onError('Node 环境不支持即兴播放');
      return;
    }

    // 音层配置：新接口 ambient 优先；旧接口（solfeggio 数字）折算进来，
    // 保证既有调用方（测试、小程序）行为不变。
    let ambient = o.ambient || null;
    if (!ambient && o.solfeggio) {
      ambient = {
        solfeggio: { freq: o.solfeggio, level: o.solfeggioLevel !== undefined ? o.solfeggioLevel : 0.05 },
        nature: {}, level: 1
      };
    }
    ambient = ambient || { solfeggio: null, nature: {}, level: 1 };

    // 有实时音层总线的后端（网页端）：音层走总线，PCM 不烘 —— 开关即时可闻。
    // 其余（小程序 / Node）：仍烘进 PCM，保证导出 WAV 与小程序端听感一致。
    const liveAmbient = this.backend.liveAmbient;
    if (liveAmbient) this.backend.applyLiveAmbient(ambient, 0.8);

    const g = {
      hex, cfg, changedCfg,
      ambient,
      // 渲染时是否把音层烘进 PCM：网页端为 false（改由总线提供）
      bakeAmbient: !liveAmbient,
      solfeggio: (ambient.solfeggio && ambient.solfeggio.freq) || 0,
      solfeggioLevel: (ambient.solfeggio && ambient.solfeggio.level !== undefined)
        ? ambient.solfeggio.level : 0.05,
      sampleRate: o.sampleRate || 44100,
      onChange: o.onChange || null,
      round: 0,          // 已排期的最大轮号
      rounds: [],        // 已加入播放队列的轮次
      pending: null,     // 已渲染、等待排期的下一轮
      loading: false,    // 正在编下一段（Worker 异步）
      playing: true,
      fails: 0,
      _lastKey: null,
      _lastRound: -1
    };
    this._gen = g;
    if (this.onStateChange) this.onStateChange('rendering');

    /* 取第一段：预热池里有现成的就即刻出声；没有则后台编好（主线程不卡）再接上 */
    const sameKey = this._readyKey === this._warmKey(hex, cfg, changedCfg);
    const ready = sameKey ? this._takeReady() : null;
    if (ready) {
      this._readyNext = Math.max(this._readyNext, ready.round + 1);
      this._startGenRound(g, ready);
      return;
    }
    // 池里没有现成的：若正有同一卦的一轮在编（预热中），等它即可，不排第二轮
    const inflight = sameKey ? this._readyPromise : null;
    const p = inflight || this._composeRoundAsync(g, 0);
    p.then((first) => {
      if (this._gen !== g || !g.playing) return;   // 期间被停止
      this._readyNext = Math.max(this._readyNext, first.round + 1);
      this._startGenRound(g, first);
    }).catch((e) => {
      this._gen = null;
      if (this.onError) this.onError('生成失败：' + e.message);
    });
  }

  /** 排入一段并开始播放（即兴连播的第一段与后续段共用） */
  _startGenRound(g, first) {
    g.round = first.round;
    this.current = { score: first.score, pcm: first.pcm, duration: first.pcm.duration, generative: true };
    this.isPlaying = true;

    this.backend.playRound(first, g, this._hooks());
    if (g.rounds) g.rounds.push(first);
    if (this.onStateChange) this.onStateChange('playing');
    this._genStartTick(g);
    this._fillReady(g);       // 趁这一段在响，把下一段备好
  }

  /**
   * 一轮自然结束（串行型后端 —— 小程序端 —— 由此续下一轮）
   * ---------------------------------------------------------------
   * 网页端是「调度型」：下一轮早已排到时间轴上，不经此路径。
   */
  _onRoundEnded(g, round) {
    if (!g || this._gen !== g || !g.playing) return;
    /* 循环开关：即兴连播本身是「八段一循环」的无限续播，
       但用户显式关掉循环时，一轮结束即止（与网页端一致）。 */
    if (!this.loop) {
      this.stopGenerative();
      if (this.onEnd) this.onEnd();
      return;
    }
    let next;
    try {
      next = this._genComposeRound(g, round.round + 1);
    } catch (e) {
      if (this.onError) this.onError('续编失败：' + e.message);
      return;
    }
    g.round = next.round;
    this.backend.playRound(next, g, this._hooks());
    if (g.rounds) g.rounds.push(next);
    if (g.rounds && g.rounds.length > 4) g.rounds.shift();
  }

  /** 编曲 + 渲染一轮（纯计算，约一秒；主线程阻塞不影响已在播放的声音） */
  _genComposeRound(g, roundNo) {
    const music = bootstrap.loadMusic();
    const D = bootstrap.loadData();
    // 种子 = 当前时间 × 常数 + 随机数 + 轮次：
    // 时间是主因（不同时刻听到不同的它），随机数保证同一毫秒内也多变。
    const seed = (((Date.now() * 7919) + Math.floor(Math.random() * 0x7fffffff) + roundNo * 104729) >>> 0) || 1;
    const variant = music.randomVariant(D.seededRandom(seed));
    // 跨轮宏曲式：八轮一循环（呈示·应和·加花·隔凡·分裂·压上·换头·再现）。
    // 轮号决定本轮所处的阶段，故越听越有整体推进，而非同一小段反复。
    const form = typeof music.arcAt === 'function' ? music.arcAt(roundNo) : null;
    const score = music.composeNotes(g.hex, g.cfg, g.changedCfg, { seed, variant, form });
    const pcm = renderScore(score, {
      sampleRate: g.sampleRate,
      reverb: 0.32, // 即兴连播用略大的混响，掩盖轮次接缝、托住空间感
      // 有实时总线的后端音层由总线提供，PCM 不烘；其余环境仍烘进 PCM
      ambient: g.bakeAmbient === false ? null : g.ambient
    });
    return { round: roundNo, score, pcm, form, arcName: score.arcName || null };
  }

  /** 续编失败的处理：重试几次，仍不行就停止连播 */
  _genFail(gg, e) {
    gg.fails++;
    if (this.onError) this.onError('续编失败：' + e.message);
    if (gg.fails >= 5 || !gg.playing) {
      this.stopGenerative();
    } else {
      setTimeout(() => { if (this._gen === gg) this._genPreload(gg); }, 2000);
    }
  }

  /** 预渲染下一轮；成功后立即排期叠尾 */
  _genPreload(g) {
    const gg = g || this._gen;
    if (!gg || !gg.playing || gg.pending || gg.loading) return;
    if (this.onStateChange) this.onStateChange('composing');

    /* 循环模式：重播刚放完的这一段，不再另编新段 */
    if (this.loop) {
      try {
        const last = gg.rounds[gg.rounds.length - 1];
        if (!last) { this.stopGenerative(); return; }
        gg.pending = {
          round: last.round,
          score: last.score,
          pcm: last.pcm,
          form: last.form,
          arcName: last.arcName
        };
        gg.fails = 0;
        this._scheduleNext(gg);
      } catch (e) {
        this._genFail(gg, e);
      }
      return;
    }

    /* 非循环：从预热池取下一段（Worker 已在后台编好，取用即接上） */
    gg.loading = true;
    const take = () => {
      const r = this._takeReady();
      if (!r) return false;
      gg.loading = false;
      gg.pending = r;
      gg.round = r.round;
      gg.fails = 0;
      this._scheduleNext(gg);
      return true;
    };
    if (take()) return;

    /* 池里空着（Worker 还在编）：等它编好 —— 主线程不卡，只是这一段衔接要等它 */
    this._composeRoundAsync(gg, gg.round + 1).then((r) => {
      gg.loading = false;
      if (this._gen !== gg || !gg.playing) return;
      gg.pending = r;
      gg.round = r.round;
      gg.fails = 0;
      this._scheduleNext(gg);
    }).catch((e) => {
      gg.loading = false;
      this._genFail(gg, e);
    });
  }

  /**
   * 把预渲染好的下一轮排上时间轴，与上一轮叠尾
   * 调度型后端（网页端）自己做叠尾；串行型后端（小程序端）由 onRoundEnded 续接。
   */
  _scheduleNext(gg) {
    if (!gg.pending) return;
    const prev = gg.rounds[gg.rounds.length - 1];
    if (!prev) return;
    if (this.backend.scheduleRound) {
      this.backend.scheduleRound(prev, gg.pending, gg);
    }
    gg.pending = null;
  }

  /* =============================================================
   * 渲染 Worker（仅支持的后端 —— 网页端）
   * ---------------------------------------------------------------
   * 一轮 67 秒的音频渲染要 1.1–1.3 秒，放在主线程上：
   *   · 按下播放要先等这一秒多（听起来像「卡住」）
   *   · 连播过程中每隔一分多钟也会顿一下
   * 故把编曲+渲染搬进 Worker，主线程只收结果（PCM 以 Transferable 零拷贝交回）。
   * Worker 不可用时自动回退到主线程同步渲染。
   * ============================================================= */

  _ensureRenderWorker() {
    if (this._worker) return true;
    if (!this.backend.worker) return false;
    if (typeof Worker === 'undefined') return false;
    if (this._workerFailed) return false;
    try {
      this._worker = new Worker('js/render-worker.js');
      this._worker.onmessage = (e) => this._onWorkerMessage(e.data);
      this._worker.onerror = (e) => {
        // Worker 起不来：把在途的请求全部退回，让调用方回退到主线程渲染
        this._workerFailed = true;
        const jobs = this._workerJobs;
        this._workerJobs = {};
        Object.keys(jobs).forEach((id) => {
          jobs[id].reject(new Error('渲染 Worker 出错：' + ((e && e.message) || '未知')));
        });
        try { this._worker.terminate(); } catch (err) { /* noop */ }
        this._worker = null;
      };
      return true;
    } catch (e) {
      this._worker = null;
      this._workerFailed = true;
      return false;
    }
  }

  _onWorkerMessage(msg) {
    const job = this._workerJobs[msg.id];
    if (!job) return;
    delete this._workerJobs[msg.id];
    if (!msg.ok) { job.reject(new Error(msg.error || '渲染失败')); return; }
    job.resolve(msg);
  }

  /** 向 Worker 发一次渲染请求，等它回话 */
  _workerCompose(payload) {
    if (!this._ensureRenderWorker()) return Promise.reject(new Error('渲染 Worker 不可用'));
    const id = ++this._workerSeq;
    return new Promise((resolve, reject) => {
      this._workerJobs[id] = { resolve, reject };
      try {
        this._worker.postMessage(Object.assign({ id, type: 'compose' }, payload));
      } catch (e) {
        delete this._workerJobs[id];
        reject(e);
      }
    });
  }

  /** 请求 Worker 渲染一轮；不可用则回退到主线程同步渲染 */
  _composeRoundAsync(g, roundNo) {
    const music = bootstrap.loadMusic();
    const D = bootstrap.loadData();
    const seed = (((Date.now() * 7919) + Math.floor(Math.random() * 0x7fffffff) + roundNo * 104729) >>> 0) || 1;
    const variant = music.randomVariant(D.seededRandom(seed));
    const form = typeof music.arcAt === 'function' ? music.arcAt(roundNo) : null;

    if (!this._ensureRenderWorker()) {
      return Promise.resolve(this._genComposeRound(g, roundNo));
    }
    return this._workerCompose({
      hex: g.hex, cfg: g.cfg, changedCfg: g.changedCfg,
      seed, variant, form,
      sampleRate: g.sampleRate, reverb: 0.32,
      bakeAmbient: g.bakeAmbient, ambient: g.ambient
    }).catch((e) => {
      // Worker 起不来（或中途出错）：回退到主线程同步渲染，保证总能出声
      this._workerFailed = true;
      try { if (this._worker) this._worker.terminate(); } catch (err) { /* noop */ }
      this._worker = null;
      return this._genComposeRound(g, roundNo);
    }).then((r) => ({
      round: roundNo,
      score: r.score,
      // 与同步渲染同构：createBuffer 需要 length 与 sampleRate
      pcm: {
        left: r.left,
        right: r.right,
        sampleRate: r.sampleRate,
        duration: r.duration,
        length: r.length !== undefined ? r.length : r.left.length
      },
      form,
      arcName: (r.score && r.score.arcName) || null
    }));
  }

  /**
   * 预热：提前把第一轮编好放着
   * ---------------------------------------------------------------
   * 用户起卦后即调用，故按下播放时通常已有现成的一段 → 即刻出声。
   */
  warmup(hex, cfg, changedCfg, ambient) {
    if (!this._ensureRenderWorker()) return;
    const g = {
      hex, cfg, changedCfg,
      ambient: ambient || { solfeggio: null, nature: {}, level: 1 },
      bakeAmbient: false,
      sampleRate: 44100
    };
    this._readyKey = this._warmKey(hex, cfg, changedCfg);
    this._readyNext = 0;
    this._readyPool = [];
    this._fillReady(g);
  }

  _warmKey(hex, cfg, changedCfg) {
    return [hex && hex.n, cfg && cfg.rootMidi, changedCfg && changedCfg.rootMidi].join('-');
  }

  /** 预热池：保持 N 轮现成的（编曲在后台悄悄进行，主线程不卡） */
  _fillReady(g) {
    if (!this._ensureRenderWorker()) return;
    if (this._readyLoading) return;
    const target = g && g.playing ? 2 : 1;
    if (this._readyPool.length >= target) return;
    this._readyLoading = true;
    const roundNo = this._readyNext++;
    // 记住在途的这一轮：若此时按下播放，直接用它，不必再排一轮（省一倍等待）
    const p = this._composeRoundAsync(g, roundNo);
    this._readyPromise = p;
    p.then((r) => {
      this._readyLoading = false;
      this._readyPromise = null;
      this._readyPool.push(r);
      this._fillReady(g);
    }).catch(() => {
      this._readyLoading = false;
      this._readyPromise = null;   // 失败则回退到主线程渲染
    });
  }

  /** 从预热池取一段现成的（轮号须连续） */
  _takeReady() {
    if (!this._readyPool.length) return null;
    const r = this._readyPool.shift();
    return r;
  }

  /** 停止即兴连播 */
  stopGenerative() {
    const g = this._gen;
    this._gen = null;
    this._genStopTick();
    if (!g) return;
    g.playing = false;
    // 音层随音乐一起淡出（与「渐弱」的听感一致）
    if (this.backend.liveAmbient) this.backend.silenceLiveAmbient(1.2);
    g.rounds.forEach((r) => {
      if (r.src) {
        try { r.src.onended = null; } catch (e) { /* noop */ }
        try { r.src.stop(0); } catch (e) { /* 已停止 */ }
      }
      if (r.gain) { try { r.gain.disconnect(); } catch (e) { /* noop */ } }
    });
    g.rounds = [];
    g.pending = null;
  }

  /** 切换疗愈音层（对后续轮次生效；当前轮保持原样直到叠尾换轮） */
  setSolfeggio(freq, level) {
    const f = freq || 0;
    if (this._gen) {
      this._gen.solfeggio = f;
      if (level !== undefined) this._gen.solfeggioLevel = level;
      if (this._gen.ambient) {
        this._gen.ambient.solfeggio = f > 0 ? { freq: f, level: level !== undefined ? level : 0.05 } : null;
      }
      if (this.backend.liveAmbient) this.backend.applyLiveAmbient(this._gen.ambient, 0.3);
    }
    this._solfeggio = f;
    if (!this._gen && this._ambient) {
      this._ambient.solfeggio = f > 0
        ? { freq: f, level: level !== undefined ? level : 0.09 } : null;
      if (this.backend.liveAmbient) this.backend.applyLiveAmbient(this._ambient, 0.3);
    }
  }

  /**
   * 切换整套音层（疗愈频率 + 自然音层）。
   * 有实时总线的后端立即生效；其余对下一段生效。
   * @param {object} amb { solfeggio:{freq,level}|null, nature:{...}, level }
   */
  setAmbient(amb) {
    if (!amb) return;
    if (this._gen) {
      this._gen.ambient = amb;
      this._gen.solfeggio = (amb.solfeggio && amb.solfeggio.freq) || 0;
      if (this.backend.liveAmbient) this.backend.applyLiveAmbient(amb, 0.3);
    }
    this._ambient = amb;
    // 未在即兴时（例如正在试听乐器）也照样生效
    if (!this._gen && this.backend.liveAmbient) this.backend.applyLiveAmbient(amb, 0.3);
  }

  /** 导出当前（或最近）一轮的 WAV；即兴连播时导出正在听的这一轮 */
  exportLastWav() {
    const g = this._gen;
    if (g && g.rounds.length) {
      const round = g.rounds[g.rounds.length - 1];
      // 有实时总线的后端音层由总线提供（未烘进 PCM），
      // 导出时按当前音层配置补渲染一遍，保证导出的文件里也有音层
      if (g.bakeAmbient === false && g.ambient) {
        try {
          const pcm = renderScore(round.score, {
            sampleRate: round.pcm.sampleRate,
            reverb: 0.32,
            ambient: g.ambient
          });
          return encodeWav(pcm);
        } catch (e) { /* 渲染失败则退回未含音层的版本 */ }
      }
      return encodeWav(round.pcm);
    }
    return null;
  }

  /** 即兴连播的状态（供界面显示） */
  get generative() {
    const g = this._gen;
    if (!g) return null;
    return {
      round: g.rounds.length ? g.rounds[g.rounds.length - 1].round : 0,
      pending: !!g.pending,
      solfeggio: g.solfeggio,
      ambient: g.ambient
    };
  }

  /* ---------- 即兴连播的界面节拍 ---------- */
  _genStartTick(g) {
    this._genStopTick();
    const gg = g || this._gen;
    const tick = () => {
      const cur = this._gen;
      if (!cur || !cur.playing) return;
      const now = this.backend.now ? this.backend.now() : 0;
      if (now > 0) {
        const last = cur.rounds[cur.rounds.length - 1];
        // 当前轮一开播，就预渲染下一轮（约需一秒，远早于它被需要）
        if (last && now >= last.startAt && !cur.pending) {
          this._genPreload(cur);
        }
        // 计算当前段落，供界面显示（不显示进度，只显示「奏到哪一段」）
        const playing = cur.rounds.find((r) => now >= r.startAt && now < r.endAt);
        const r = playing || last;
        if (r && cur.onChange) {
          const el = Math.max(0, Math.min(r.pcm.duration, now - r.startAt));
          const sec = r.score.sections;
          let key = 'intro';
          if (el >= sec.coda.start) key = 'coda';
          else if (el >= sec.variation.start) key = 'variation';
          else if (el >= sec.theme.start) key = 'theme';
          if (key !== cur._lastKey || r.round !== cur._lastRound) {
            cur._lastKey = key;
            cur._lastRound = r.round;
            cur.onChange({
              round: r.round,
              section: key,
              elapsed: el,
              duration: r.pcm.duration,
              form: r.form || null,
              arcName: r.arcName || null
            });
          }
        }
      }
      this._genTimer = setTimeout(tick, 250);
    };
    this._genTimer = setTimeout(tick, 250);
  }

  _genStopTick() {
    if (this._genTimer) {
      clearTimeout(this._genTimer);
      this._genTimer = null;
    }
  }

  /** 释放当前播放资源（不改变 loop 等设置） */
  _teardownSources() {
    this._stopTick();
    this._genStopTick();
    if (this._gen) this.stopGenerative();
    if (this.backend.teardown) this.backend.teardown();
  }

  /**
   * 设置循环播放
   * @param {boolean} on
   */
  setLoop(on) {
    this.loop = !!on;
    if (this.onStateChange) this.onStateChange(this.loop ? 'loop' : 'noloop');
  }

  /** 切换循环并返回新状态 */
  toggleLoop() {
    this.setLoop(!this.loop);
    return this.loop;
  }

  /* =============================================================
   * 控制
   * ============================================================= */

  /**
   * 暂停：挂起音频输出
   * ---------------------------------------------------------------
   * 挂起后音频时间轴随之冻结，已排期的声源停在原地；
   * 恢复（resume）时从**同一处**继续，故为无缝衔接，
   * 不必重新编曲、也不必重渲染（那一秒多的停顿正源于此）。
   */
  pause() {
    if (!this.isPlaying) return false;
    const ok = this.backend.pause ? this.backend.pause() : false;
    if (!ok) return false;
    this._paused = true;
    if (this.onStateChange) this.onStateChange('paused');
    return true;
  }

  /**
   * 继续：从挂起处接着放（无缝）
   * ---------------------------------------------------------------
   * 两种「停住」要分清：
   *   · 用户主动暂停（_paused）—— 恢复时从这里继续；
   *   · 系统挂起了音频上下文（切后台、浏览器策略）—— 由 contextSuspended 报告。
   */
  resume() {
    if (!this._paused) return false;
    const ok = this.backend.resume ? this.backend.resume() : false;
    if (!ok) return false;
    this._paused = false;
    if (this.onStateChange) this.onStateChange('playing');
    return true;
  }

  /** 用户是否主动按下了暂停 */
  get paused() {
    return !!this._paused;
  }

  /** 音频上下文是否被系统挂起（切后台 / 浏览器自动播放策略） */
  get contextSuspended() {
    return this.backend.contextSuspended ? this.backend.contextSuspended() : false;
  }

  /** 停止 */
  stop() {
    this._teardownSources();
    this.current = null;
    this.isPlaying = false;
    this._paused = false;
    if (this.backend.liveAmbient) this.backend.silenceLiveAmbient(1.0);
    if (this.onStateChange) this.onStateChange('stopped');
  }

  /** 跳转到指定时间点 */
  seek(sec) {
    if (!this.current) return;
    const score = this.current.score;
    this.stop();
    this.play(score, { offset: Math.max(0, Math.min(sec, score.duration - 0.1)) });
  }

  /** 设置音量 0..1 */
  setVolume(v) {
    const vol = Math.max(0, Math.min(1, v));
    this._volume = vol;                 // 记住，供新建的音频源继承
    if (this.backend.setVolume) this.backend.setVolume(vol);
  }

  /* =============================================================
   * 频谱与位置
   * ============================================================= */

  /** 频谱分析器（供可视化）；小程序无，返回 null */
  get analyser() {
    return this.backend.analyser || null;
  }

  /**
   * 当前即兴轮的播放位置与乐谱
   * ---------------------------------------------------------------
   * 供可视化取用：小程序端没有 AnalyserNode，频谱与波形改由
   * 乐谱（score.notes）按当前播放位置推算 —— 既确定又不失真。
   */
  get genPos() {
    const g = this._gen;
    if (!g || !g.rounds || !g.rounds.length) return null;
    const now = this.backend.now ? this.backend.now() : 0;
    const r = g.rounds.find((x) => now >= x.startAt && now < x.endAt)
      || g.rounds[g.rounds.length - 1];
    if (!r) return null;
    const startAt = (typeof r.startAt === 'number') ? r.startAt : 0;
    const elapsed = startAt ? Math.max(0, Math.min(r.pcm.duration, now - startAt))
      : Math.max(0, Math.min(r.pcm.duration, now));
    return {
      round: r.round,
      elapsed,
      duration: r.pcm.duration,
      score: r.score,
      arcName: r.arcName || null
    };
  }

  /** 音层是否正在发声（供界面提示） */
  get ambientState() {
    const a = this._ambient;
    const nature = Object.keys(a.nature || {}).filter((k) => a.nature[k]);
    return {
      solfeggio: a.solfeggio ? a.solfeggio.freq : 0,
      nature,
      level: a.level
    };
  }

  /* =============================================================
   * 进度轮询
   * ============================================================= */

  _startTick() {
    this._stopTick();
    const tick = () => {
      if (!this.current || !this.isPlaying) return;
      const now = this.backend.now ? this.backend.now() : 0;
      if (now > 0 && this.onProgress) {
        this.onProgress(now, this.current.duration);
      }
      this._timer = setTimeout(tick, 60);
    };
    this._timer = setTimeout(tick, 60);
  }

  _stopTick() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}

/* 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Player, fmtTime, IS_NODE, IS_MINIPROGRAM,
    createNullBackend: bootstrap.createNullBackend
  };
} else {
  window.ICPlayer = { Player, fmtTime };
}

})();
