/**
 * 卦象心音 · 播放适配层
 * ---------------------------------------------------------------
 * 平台无关的播放引擎。上层只管调用 play/stop/seek，
 * 底层按运行环境自动选择输出方式。
 *
 * 渲染统一走 core/render.js（纯 JS 生成 PCM），
 * 保证网页版与小程序版听到的波形完全一致。
 *
 * 输出方式：
 *   浏览器     —— Web Audio API，把 PCM 灌进 AudioBuffer 播放
 *   微信小程序 —— 两级策略：
 *                  ① InnerAudioContext 播放写盘的 WAV（可后台、可分享、进度精确）
 *                  ② 降级 wx.createWebAudioContext() 实时合成
 *   Node       —— 仅渲染与导出，不播放
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
const audioFingerprint = bootstrap.loadRender().audioFingerprint;

/** 探测运行环境 */
const IS_NODE = (typeof process !== 'undefined' &&
  process.versions && process.versions.node &&
  typeof window === 'undefined');
const IS_MINIPROGRAM = !IS_NODE &&
  typeof wx !== 'undefined' &&
  typeof wx.getSystemInfoSync === 'function';

/**
 * 是否可以走「实时音层总线」
 * ---------------------------------------------------------------
 * 浏览器：音层不烘进 PCM，改由常驻的 Web Audio 节点实时合成。
 *   原因 —— 烘进 PCM 的音层要等下一段即兴（新编一轮，约一两分钟）
 *   才听得到，用户会以为「开了没反应」。实时总线的开关与音量
 *   在 300ms 内即可闻。
 * 小程序 / Node：InnerAudioContext 只能播文件、Node 不能出声，
 *   仍按原样把音层烘进 PCM（保证导出 WAV 与小程序端听感一致）。
 *
 * 判断依据是「当前实例是否已建成真实 Web Audio 音频图」，
 * 而非加载期常量 —— 这样同一份代码在浏览器与 Node 下都可用，
 * 也便于用替身上下文做回归测试。
 */
function liveAmbientAvailable(player) {
  return !!(player && player._ctx && player._ambBus);
}

/**
 * 生成一段可循环的白噪缓冲（实时自然音层的声音来源）
 * 用 xorshift 确定性填充，同长度下内容一致，便于复现。
 */
function makeNoiseBuffer(ctx, seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 0x2545F491 >>> 0;
  for (let i = 0; i < len; i++) {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    d[i] = (s / 2147483648) - 1;
  }
  return buf;
}

/** 各自然层的实时合成配方：噪声 → 滤波 → 增益（对应离线合成的听感特征） */
const LIVE_NATURE_RECIPES = {
  // 雨：高频雨幕 + 中低频的厚实感
  rain: { filters: [['highpass', 900, 0.7], ['peaking', 3800, 1.0, 5]], gain: 0.85, lfo: null },
  // 鸟鸣：窄带啾声，间歇性开合
  birds: { filters: [['bandpass', 2650, 7], ['highpass', 1600, 0.7]], gain: 1.35, lfo: { hz: 0.33, depth: 0.85 } },
  // 篝火：低频柴火轰鸣，缓慢起伏
  fire: { filters: [['lowpass', 430, 0.9]], gain: 1.5, lfo: { hz: 0.47, depth: 0.35 } },
  // 风声：低中频气流，深缓呼吸
  wind: { filters: [['bandpass', 300, 1.1]], gain: 1.6, lfo: { hz: 0.09, depth: 0.75 } },
  // 溪流：中高频水石相激的连续细响
  stream: { filters: [['bandpass', 1750, 1.3], ['highpass', 780, 0.7]], gain: 1.0, lfo: null }
};

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
  constructor(opts) {
    const o = opts || {};
    this.onProgress = o.onProgress || null;   // (elapsedSec, durationSec)
    this.onEnd = o.onEnd || null;
    this.onError = o.onError || null;
    this.onStateChange = o.onStateChange || null;

    this.current = null;      // { score, pcm, duration, source }
    this.isPlaying = false;
    this.startedAt = 0;
    this.offset = 0;

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

    // 浏览器 Web Audio
    this._ctx = null;
    this._master = null;
    this._analyser = null;
    // 实时音层总线（仅浏览器）：与五声并行，开关即时生效
    this._ambBus = null;
    this._ambNoise = null;
    this._ambNodes = null;    // { solOsc:[], solGain, nature:{key:{src,filters,gain,lfoGain}} }
    this._ambient = { solfeggio: null, nature: {}, level: 1 };

    // 小程序
    this._inner = null;
    this._fileCache = new Map();   // 卦序 → 本地文件路径
    this._useInner = IS_MINIPROGRAM;

    this._timer = null;
  }

  /* =============================================================
   * 平台检测
   * ============================================================= */

  /** 当前环境的能力描述 */
  get capability() {
    if (IS_MINIPROGRAM) {
      return { platform: 'miniprogram', canRender: true, canPlay: true, canExport: true };
    }
    if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      return { platform: 'web', canRender: true, canPlay: true, canExport: true };
    }
    return { platform: 'unknown', canRender: true, canPlay: false, canExport: true };
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

    if (IS_MINIPROGRAM) {
      this._playMini(score, pcm, o.offset || 0);
    } else if (!IS_NODE) {
      this._playWeb(score, pcm, o.offset || 0);
    } else {
      if (this.onError) this.onError('Node 环境不支持播放');
    }
  }

  /**
   * 播放结束的统一处理
   * ---------------------------------------------------------------
   * 开启循环时，从头重播同一份乐谱；否则通知上层结束。
   * 三种输出方式（Web Audio / InnerAudioContext / 实时合成）都走这里，
   * 保证循环行为三端一致。
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
   * 浏览器用 Web Audio 精确调度实现叠尾；小程序端 InnerAudioContext
   * 无法交叉淡入，降级为「轮次顺序相接」（仍是每轮新编）。
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

    if (IS_NODE) {
      if (this.onError) this.onError('Node 环境不支持即兴播放');
      return;
    }

    try {
      this._ensureCtx();
    } catch (e) {
      if (this.onError) this.onError(e.message);
      return;
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();

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

    // 浏览器端：音层走实时总线，PCM 不烘音层 —— 开关即时可闻。
    // 小程序 / Node：仍烘进 PCM，保证导出 WAV 与小程序端听感一致。
    const liveAmbient = liveAmbientAvailable(this);
    if (liveAmbient) this._applyLiveAmbient(ambient, 0.8);

    const g = {
      hex, cfg, changedCfg,
      ambient,
      // 渲染时是否把音层烘进 PCM：浏览器为 false（改由总线提供）
      bakeAmbient: !liveAmbient,
      solfeggio: (ambient.solfeggio && ambient.solfeggio.freq) || 0,
      solfeggioLevel: (ambient.solfeggio && ambient.solfeggio.level !== undefined)
        ? ambient.solfeggio.level : 0.05,
      sampleRate: o.sampleRate || 44100,
      onChange: o.onChange || null,
      round: 0,          // 已排期的最大轮号
      rounds: [],        // 已加入播放队列的轮次
      pending: null,     // 已渲染、等待排期的下一轮
      playing: true,
      fails: 0,
      _lastKey: null,
      _lastRound: -1
    };
    this._gen = g;
    if (this.onStateChange) this.onStateChange('rendering');

    let first;
    try {
      first = this._genComposeRound(g, 0);
    } catch (e) {
      this._gen = null;
      if (this.onError) this.onError('生成失败：' + e.message);
      return;
    }

    this.current = { score: first.score, pcm: first.pcm, duration: first.pcm.duration, generative: true };
    this.isPlaying = true;

    if (IS_MINIPROGRAM) {
      this._playMiniGenRound(g, first);
    } else {
      this._playGenRoundWeb(first, this._ctx.currentTime + 0.06, 1.6);
      g.rounds.push(first);
      if (this.onStateChange) this.onStateChange('playing');
      this._genStartTick(g);
    }
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
      // 浏览器端音层由实时总线提供，PCM 不烘；其余环境仍烘进 PCM
      ambient: g.bakeAmbient === false ? null : g.ambient
    });
    return { round: roundNo, score, pcm, form, arcName: score.arcName || null };
  }

  /** 预渲染下一轮；成功后立即排期叠尾 */
  _genPreload(g) {
    const gg = g || this._gen;
    if (!gg || !gg.playing || gg.pending) return;
    if (this.onStateChange) this.onStateChange('composing');
    try {
      if (this.loop) {
        // 循环模式：重播刚放完的这一段，不再另编新段
        const last = gg.rounds[gg.rounds.length - 1];
        if (!last) { this.stopGenerative(); return; }
        gg.pending = {
          round: last.round,
          score: last.score,
          pcm: last.pcm,
          form: last.form,
          arcName: last.arcName
        };
      } else {
        gg.pending = this._genComposeRound(gg, gg.round + 1);
        gg.round = gg.pending.round;
      }
      gg.fails = 0;
      if (IS_MINIPROGRAM) {
        // 小程序：轮次顺序相接（无叠尾），由 onEnded 触发
        return;
      }
      this._genScheduleNext(gg);
    } catch (e) {
      gg.fails++;
      if (this.onError) this.onError('续编失败：' + e.message);
      if (gg.fails >= 5 || !gg.playing) {
        this.stopGenerative();
      } else {
        setTimeout(() => { if (this._gen === gg) this._genPreload(gg); }, 2000);
      }
    }
  }

  /** 把预渲染好的下一轮排进 Web Audio 时间轴，与上一轮叠尾 */
  _genScheduleNext(gg) {
    const prev = gg.rounds[gg.rounds.length - 1];
    const next = gg.pending;
    if (!prev || !next || !gg.playing) return;
    const ctx = this._ctx;
    if (!ctx) return;

    const now = ctx.currentTime;
    const overlap = Math.min(2.0, prev.pcm.duration * 0.10);
    let startAt = prev.endAt - overlap;
    if (startAt < now + 0.05) startAt = now + 0.05;   // 保险：不得排在过去

    // 上一轮：从现在的位置淡出到结束
    try {
      prev.gain.gain.cancelScheduledValues(now);
      prev.gain.gain.setValueAtTime(Math.max(0.0001, prev.gain.gain.value), now);
      prev.gain.gain.linearRampToValueAtTime(0.0001, prev.endAt);
    } catch (e) { /* 参数自动化不可用则直接淡出到停止 */ }

    this._playGenRoundWeb(next, startAt, 1.6);
    gg.rounds.push(next);
    gg.pending = null;
    prev.done = true;
    // 只保留最近两轮，旧轮次交给垃圾回收
    while (gg.rounds.length > 2) {
      const old = gg.rounds.shift();
      if (old.src) { try { old.src.onended = null; } catch (e) { /* noop */ } }
    }
  }

  /** Web Audio：把一轮 PCM 排到时间轴上（淡入） */
  _playGenRoundWeb(round, startAt, fadeInSec) {
    const ctx = this._ctx;
    const buf = ctx.createBuffer(2, round.pcm.length, round.pcm.sampleRate);
    buf.copyToChannel(round.pcm.left, 0);
    buf.copyToChannel(round.pcm.right, 1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(1, startAt + fadeInSec);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    gain.connect(this._master);
    src.start(startAt);

    round.src = src;
    round.gain = gain;
    round.startAt = startAt;
    round.endAt = startAt + round.pcm.duration;
    return round;
  }

  /** 小程序：一轮一写盘一播，播完接下一轮（仍是每轮新编） */
  _playMiniGenRound(g, round) {
    if (this.onStateChange) this.onStateChange('rendering');
    let wav;
    try {
      wav = encodeWav(round.pcm);
    } catch (e) {
      if (this.onError) this.onError('编码失败：' + e.message);
      return;
    }
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/gxgen_${g.hex.n}_${round.round}.wav`;
    fs.writeFile({
      filePath,
      data: wav,
      success: () => {
        const inner = wx.createInnerAudioContext();
        this._inner = inner;
        inner.obeyMuteSwitch = false;
        inner.onEnded(() => {
          if (g.playing && this._gen === g) {
            let next;
            try { next = this._genComposeRound(g, round.round + 1); }
            catch (e) { if (this.onError) this.onError('续编失败：' + e.message); return; }
            this._playMiniGenRound(g, next);
          }
        });
        inner.onError((err) => {
          if (this.onError) this.onError('播放失败：' + (err.errMsg || '未知错误'));
        });
        inner.src = filePath;
        inner.play();
        this.isPlaying = true;
        if (this.onStateChange) this.onStateChange('playing');
      },
      fail: (err) => {
        if (this.onError) this.onError('写盘失败：' + (err.errMsg || '未知错误'));
      }
    });
  }

  /** 停止即兴连播 */
  stopGenerative() {
    const g = this._gen;
    this._gen = null;
    this._genStopTick();
    if (!g) return;
    g.playing = false;
    // 音层随音乐一起淡出（与「渐弱」的听感一致）
    if (liveAmbientAvailable(this)) this._silenceAmbient(1.2);
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
      if (liveAmbientAvailable(this)) this._applyLiveAmbient(this._gen.ambient, 0.3);
    }
    this._solfeggio = f;
    if (!this._gen && this._ambient) {
      this._ambient.solfeggio = f > 0
        ? { freq: f, level: level !== undefined ? level : 0.09 } : null;
      if (liveAmbientAvailable(this)) this._applyLiveAmbient(this._ambient, 0.3);
    }
  }

  /**
   * 切换整套音层（疗愈频率 + 自然音层）。
   * 浏览器端立即生效（实时总线）；小程序 / Node 对下一段生效。
   * @param {object} amb { solfeggio:{freq,level}|null, nature:{...}, level }
   */
  setAmbient(amb) {
    if (!amb) return;
    if (this._gen) {
      this._gen.ambient = amb;
      this._gen.solfeggio = (amb.solfeggio && amb.solfeggio.freq) || 0;
      if (liveAmbientAvailable(this)) this._applyLiveAmbient(amb, 0.3);
    }
    this._ambient = amb;
    // 未在即兴时（例如正在试听乐器）也照样生效
    if (!this._gen && liveAmbientAvailable(this)) this._applyLiveAmbient(amb, 0.3);
  }

  /** 导出当前（或最近）一轮的 WAV；即兴连播时导出正在听的这一轮 */
  exportLastWav() {
    const g = this._gen;
    if (g && g.rounds.length) {
      const round = g.rounds[g.rounds.length - 1];
      // 浏览器端音层由实时总线提供（未烘进 PCM），
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
      const ctx = this._ctx;
      if (ctx) {
        const now = ctx.currentTime;
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
    if (this.current && this.current.source) {
      try { this.current.source.stop(0); } catch (e) { /* 已停止 */ }
      try { this.current.source.onended = null; } catch (e) { /* noop */ }
      this.current.source = null;
    }
    if (this._inner) {
      try { this._inner.stop(); } catch (e) { /* noop */ }
      try { this._inner.destroy(); } catch (e) { /* noop */ }
      this._inner = null;
    }
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

  /**
   * 浏览器播放：把 PCM 灌进 AudioBuffer
   */
  _playWeb(score, pcm, offset) {
    try {
      this._ensureCtx();
    } catch (e) {
      if (this.onError) this.onError(e.message);
      return;
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();

    const ctx = this._ctx;
    const buf = ctx.createBuffer(2, pcm.length, pcm.sampleRate);
    buf.copyToChannel(pcm.left, 0);
    buf.copyToChannel(pcm.right, 1);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this._master);
    src.onended = () => {
      if (this.current && this.current.source === src) {
        this._handleEnd();
      }
    };
    src.start(0, offset);

    this.current.source = src;
    this.isPlaying = true;
    this.startedAt = ctx.currentTime - offset;
    if (this.onStateChange) this.onStateChange('playing');
    this._startTick();
  }

  /**
   * 小程序播放：优先写 WAV 落盘后用 InnerAudioContext 播放
   * 该方式支持后台播放、精确进度、分享文件
   */
  _playMini(score, pcm, offset) {
    const key = this._cacheKey(score);
    const cached = this._fileCache.get(key);

    const start = (filePath) => {
      this._playInner(filePath, offset);
    };

    if (cached) {
      start(cached);
      return;
    }

    // 落盘需要时间，用 loading 反馈
    if (this.onStateChange) this.onStateChange('rendering');

    let wav;
    try {
      wav = encodeWav(pcm);
    } catch (e) {
      if (this.onError) this.onError('编码失败：' + e.message);
      return;
    }

    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/gx_${key}.wav`;

    const writeTask = fs.writeFile({
      filePath,
      data: wav,
      success: () => {
        this._fileCache.set(key, filePath);
        start(filePath);
      },
      fail: (err) => {
        // 落盘失败则降级为实时合成
        this._playMiniRealtime(score, pcm, offset, err);
      }
    });
    if (writeTask && writeTask.onProgressUpdate) {
      writeTask.onProgressUpdate((res) => {
        if (this.onStateChange) this.onStateChange('rendering', res.progress);
      });
    }
  }

  /**
   * 小程序降级方案：wx.createWebAudioContext() 实时合成
   * 注意：该 API 不支持 createConvolver / createStereoPanner，
   * 因此这里用延迟反馈网络模拟混响、用声道分离模拟声像。
   */
  _playMiniRealtime(score, pcm, offset, writeErr) {
    if (typeof wx === 'undefined' || !wx.createWebAudioContext) {
      if (this.onError) this.onError('当前环境无法播放音频' + (writeErr ? '：' + writeErr.errMsg : ''));
      return;
    }
    try {
      const ctx = wx.createWebAudioContext();
      this._wxCtx = ctx;
      if (ctx.state === 'suspended') ctx.resume();

      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);

      // 简易混响：延迟 + 反馈
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.18;
      const fb = ctx.createGain();
      fb.gain.value = 0.34;
      const wet = ctx.createGain();
      wet.gain.value = 0.26;
      master.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(master);

      // 声像：用声道分离 + 增益模拟 StereoPanner
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const gl = ctx.createGain();
      const gr = ctx.createGain();
      gl.gain.value = 0.707;
      gr.gain.value = 0.707;
      master.connect(splitter);
      splitter.connect(gl, 0);
      splitter.connect(gr, 1);
      gl.connect(merger, 0, 0);
      gr.connect(merger, 0, 1);
      merger.connect(ctx.destination);

      // 把渲染好的 PCM 灌进去
      const buf = ctx.createBuffer(2, pcm.length, pcm.sampleRate);
      buf.getChannelData(0).set(pcm.left);
      buf.getChannelData(1).set(pcm.right);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(master);
      src.onended = () => {
        if (this.current && this.current.source === src) {
          this._handleEnd();
        }
      };
      src.start(0, offset);

      this.current.source = src;
      this.isPlaying = true;
      this.startedAt = ctx.currentTime - offset;
      if (this.onStateChange) this.onStateChange('playing');
      this._startTick();
    } catch (e) {
      if (this.onError) this.onError('实时合成失败：' + e.message);
    }
  }

  /**
   * 用 InnerAudioContext 播放本地 WAV
   */
  _playInner(filePath, offset) {
    const inner = wx.createInnerAudioContext();
    this._inner = inner;

    inner.autoplay = false;
    inner.obeyMuteSwitch = false;

    inner.onTimeUpdate(() => {
      if (!this.current) return;
      const elapsed = inner.currentTime;
      if (this.onProgress) this.onProgress(elapsed, this.current.duration);
    });
    inner.onEnded(() => {
      this._handleEnd();
    });
    inner.onError((err) => {
      if (this.onError) this.onError('播放失败：' + (err.errMsg || '未知错误'));
    });

    inner.src = filePath;
    if (offset > 0) inner.seek(offset);
    inner.play();
    this.isPlaying = true;
    if (this.onStateChange) this.onStateChange('playing');
  }

  /* =============================================================
   * 控制
   * ============================================================= */

  /** 懒初始化浏览器音频上下文 */
  _ensureCtx() {
    if (this._ctx) return this._ctx;
    const AC = (typeof window !== 'undefined') &&
      (window.AudioContext || window.webkitAudioContext);
    if (!AC) throw new Error('当前环境不支持 Web Audio API');

    this._ctx = new AC();
    this._master = this._ctx.createGain();
    this._master.gain.value = 0.85;

    this._analyser = this._ctx.createAnalyser();
    this._analyser.fftSize = 512;
    this._analyser.smoothingTimeConstant = 0.8;

    const comp = this._ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;

    this._master.connect(comp);
    comp.connect(this._analyser);
    this._analyser.connect(this._ctx.destination);

    // 音层总线：挂在压缩器之后 —— 音层不与五声抢动态，
    // 但仍进分析器，故波形可视化能看到音层带来的能量变化
    this._ambBus = this._ctx.createGain();
    this._ambBus.gain.value = 1;
    this._ambBus.connect(this._analyser);
    this._ambNoise = makeNoiseBuffer(this._ctx, 4);

    return this._ctx;
  }

  /* =============================================================
   * 实时音层总线（仅浏览器）
   * ---------------------------------------------------------------
   * 疗愈频率 = 两个失谐极小的正弦（基频 + 低八度）；
   * 自然层  = 一段循环白噪经该层专属滤波链，再乘该层的慢速 LFO 包络。
   * 全部为程序化合成，无采样素材；音层只在混响后单独叠加，
   * 不进入音符表，故五声（旋律与和声）完全不受影响。
   * ============================================================= */

  /** 建立（或复用）音层节点组；幂等，可反复调用 */
  _ensureAmbientNodes() {
    if (this._ambNodes) return this._ambNodes;
    const ctx = this._ctx;
    if (!ctx || !this._ambBus) return null;
    const N = { solOsc: [], solGain: null, nature: {} };
    const now = ctx.currentTime;

    // 疗愈频率：基频 + 低八度，两者各给一个极短的淡入
    N.solGain = ctx.createGain();
    N.solGain.gain.value = 0;
    N.solGain.connect(this._ambBus);
    [1, 0.5].forEach((mult, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 528 * mult;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.8 : 0.34;
      osc.connect(g); g.connect(N.solGain);
      osc.start(now);
      N.solOsc.push({ osc, g, mult });
    });

    // 自然层：每层一份「噪声源 + 滤波链 + 基增益 + VCA」
    Object.keys(LIVE_NATURE_RECIPES).forEach((key) => {
      const r = LIVE_NATURE_RECIPES[key];
      const src = ctx.createBufferSource();
      src.buffer = this._ambNoise;
      src.loop = true;
      let node = src;
      const filters = r.filters.map(([type, freq, q, gain]) => {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        if (q !== undefined) f.Q.value = q;
        if (gain !== undefined) f.gain.value = gain;
        node.connect(f);
        node = f;
        return f;
      });
      // 基增益：音层的「开关与音量」，由 _applyLiveAmbient 平滑过渡
      const base = ctx.createGain();
      base.gain.value = 0;
      node.connect(base);
      // VCA：增益基准恒为 1，LFO 只在其上叠加起伏（1 + lfo×depth，depth ≤ 1）。
      // 基增益归零时输出必为零 —— 关闭即真静音，总量滑杆也才能真正管用。
      const vca = ctx.createGain();
      vca.gain.value = 1;
      base.connect(vca);
      vca.connect(this._ambBus);

      // 慢速 LFO：给该层自然的起伏（鸟鸣的间歇、风声的呼吸）
      let lfoGain = null;
      if (r.lfo) {
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = r.lfo.hz;
        lfoGain = ctx.createGain();
        lfoGain.gain.value = r.lfo.depth;
        lfo.connect(lfoGain);
        lfoGain.connect(vca.gain);
        lfo.start(now);
      }
      src.start(now);
      N.nature[key] = { src, filters, gain: base, vca, lfoGain, recipe: r };
    });

    this._ambNodes = N;
    return N;
  }

  /** 音量做平滑过渡（避免咔哒声）；sec=0 时立即到位 */
  _rampParam(param, to, sec) {
    const ctx = this._ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    try {
      param.cancelScheduledValues(now);
      if (sec > 0) {
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(to, now + sec);
      } else {
        param.value = to;
      }
    } catch (e) { param.value = to; }
  }

  /**
   * 应用整套音层配置（浏览器端即时生效）
   * @param {object} amb { solfeggio:{freq,level}|null, nature:{...}, level }
   * @param {number} fade 过渡秒数，默认 0.35
   */
  _applyLiveAmbient(amb, fade) {
    if (!liveAmbientAvailable(this)) return;
    const N = this._ensureAmbientNodes();
    if (!N) return;
    const sec = fade === undefined ? 0.35 : fade;
    const a = amb || {};
    const master = a.level === undefined ? 1 : a.level;

    // 疗愈频率
    const sol = a.solfeggio;
    const solOn = sol && sol.freq > 0;
    if (solOn) {
      const lv = (sol.level === undefined ? 0.09 : sol.level) * master * 0.85;
      N.solOsc.forEach((n) => {
        n.osc.frequency.setTargetAtTime(sol.freq * n.mult, this._ctx.currentTime, 0.05);
      });
      this._rampParam(N.solGain.gain, lv, sec);
    } else {
      this._rampParam(N.solGain.gain, 0, sec);
    }

    // 自然层
    const nat = a.nature || {};
    Object.keys(N.nature).forEach((key) => {
      const node = N.nature[key];
      const on = nat[key];
      const layer = bootstrap.loadRender().NATURE_LAYERS
        .filter((l) => l.key === key)[0];
      const base = layer ? layer.level : 0.1;
      const scale = (typeof on === 'number' ? on : (on ? 1 : 0));
      const lv = scale * base * master * 2.6 * node.recipe.gain;
      this._rampParam(node.gain.gain, lv, sec);
    });
  }

  /** 停止音层总线（淡出后静音，不拆节点，以便再次开启无缝） */
  _silenceAmbient(fadeSec) {
    if (!liveAmbientAvailable(this) || !this._ambNodes) return;
    const N = this._ambNodes;
    this._rampParam(N.solGain.gain, 0, fadeSec === undefined ? 0.5 : fadeSec);
    Object.keys(N.nature).forEach((key) => {
      this._rampParam(N.nature[key].gain.gain, 0, fadeSec === undefined ? 0.5 : fadeSec);
    });
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

  /** 频谱分析器（供可视化） */
  get analyser() {
    if (IS_MINIPROGRAM) return null;
    return this._analyser;
  }

  /** 停止 */
  stop() {
    this._teardownSources();
    this.current = null;
    this.isPlaying = false;
    if (liveAmbientAvailable(this)) this._silenceAmbient(1.0);
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
    if (this._master) this._master.gain.value = vol;
    if (this._inner) this._inner.volume = vol;
  }

  /* =============================================================
   * 进度轮询（浏览器与实时合成降级路径用）
   * ============================================================= */

  _startTick() {
    this._stopTick();
    const tick = () => {
      if (!this.current || !this.isPlaying) return;
      const ctx = this._wxCtx || this._ctx;
      if (ctx) {
        const elapsed = ctx.currentTime - this.startedAt;
        if (this.onProgress) this.onProgress(elapsed, this.current.duration);
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

  /* =============================================================
   * 工具
   * ============================================================= */

  /** 缓存键：按卦序与起始偏移区分 */
  _cacheKey(score) {
    const first = score.notes[0];
    const h = first ? (first.midi * 1000 + Math.round(first.time * 10)) : 0;
    return `${h}_${score.notes.length}`;
  }
}

/* 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Player, fmtTime, IS_NODE, IS_MINIPROGRAM,
    liveAmbientAvailable, LIVE_NATURE_RECIPES, makeNoiseBuffer
  };
} else {
  window.ICPlayer = { Player, fmtTime };
}

})();
