/**
 * 古律象音 · 网页端播放后端（Web Audio）
 * ---------------------------------------------------------------
 * 职责：把引擎（core/player.js）算好的 PCM 变成声音，并管住音频图。
 * 涵盖：
 *   · Web Audio 音频图（主增益 → 压缩器 → 分析器 → 扬声器）
 *   · 实时音层总线（疗愈频率 + 五层自然音，开关即时可闻，不烘进 PCM）
 *   · 即兴连播的「叠尾调度」（下一轮提前排到时间轴上，与本轮尾部交叉淡入）
 *   · 后台 Worker 渲染（编曲渲染搬离主线程，主线程不卡）
 *
 * 契约见 core/backend.js。引擎只管业务编排，这里只管出声。
 */

'use strict';

/* __IC_IIFE__ */
(function () {

/**
 * 各自然音层的基础音量
 * ---------------------------------------------------------------
 * 与 core/render.js 的离线合成用同一套数值（离线合成烘进 PCM，
 * 实时总线即时可闻，二者听感须一致）。
 * 此处不 require core —— 后端只依赖平台 API 与自身常量，
 * 故可脱离 core/ 单独加载与测试。
 */
const NATURE_LAYER_BASE = {
  rain: 0.12, birds: 0.13, fire: 0.11, wind: 0.09, stream: 0.10
};

/**
 * 自然音层的实时合成配方
 * ---------------------------------------------------------------
 * 噪声 → 滤波链 → 增益（对应离线合成的听感特征）。
 * 与 core/render.js 的离线合成一一对应，只是实时执行。
 * ============================================================= */
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

/**
 * 网页端后端
 */
class WebBackend {
  constructor() {
    this.name = 'web';
    this.liveAmbient = true;   // 支持实时音层总线
    this.worker = true;        // 支持后台 Worker 渲染

    this._ctx = null;
    this._master = null;
    this._analyser = null;
    this._ambBus = null;
    this._ambNoise = null;
    this._ambNodes = null;     // { solOsc:[], solGain, nature:{key:{src,filters,gain,vca,lfoGain}} }
    this._volume = 0.85;
    this._paused = false;
  }

  /* ---------- 音频图 ---------- */

  /** 懒初始化音频上下文（幂等） */
  ensureCtx() {
    if (this._ctx) return this._ctx;
    const AC = (typeof window !== 'undefined') &&
      (window.AudioContext || window.webkitAudioContext);
    if (!AC) throw new Error('当前环境不支持 Web Audio API');

    this._ctx = new AC();
    this._master = this._ctx.createGain();
    this._master.gain.value = this._volume;

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

  get analyser() { return this._analyser; }

  contextSuspended() {
    return !!(this._ctx && this._ctx.state === 'suspended');
  }

  now() {
    return this._ctx ? this._ctx.currentTime : 0;
  }

  /* ---------- 实时音层总线 ---------- */

  /** 建立（或复用）音层节点组；幂等 */
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
      // 基增益：音层的「开关与音量」，由 applyLiveAmbient 平滑过渡
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
   * 应用整套音层配置（开关即时可闻）
   * @param {object} amb { solfeggio:{freq,level}, nature:{...}, level }
   * @param {number} fade 过渡秒数
   */
  applyLiveAmbient(amb, fade) {
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
      const base = NATURE_LAYER_BASE[key] !== undefined ? NATURE_LAYER_BASE[key] : 0.1;
      const scale = (typeof on === 'number' ? on : (on ? 1 : 0));
      const lv = scale * base * master * 2.6 * node.recipe.gain;
      this._rampParam(node.gain.gain, lv, sec);
    });
  }

  /** 停止音层总线（淡出后静音，不拆节点，以便再次开启无缝） */
  silenceLiveAmbient(fadeSec) {
    if (!this._ambNodes) return;
    const N = this._ambNodes;
    const sec = fadeSec === undefined ? 0.5 : fadeSec;
    this._rampParam(N.solGain.gain, 0, sec);
    Object.keys(N.nature).forEach((key) => {
      this._rampParam(N.nature[key].gain.gain, 0, sec);
    });
  }

  /* ---------- 播放 ---------- */

  /**
   * 播放一段既定乐谱（乐器试听）
   */
  playScore(score, pcm, offset, hooks) {
    try {
      this.ensureCtx();
    } catch (e) {
      if (hooks && hooks.onError) hooks.onError(e.message);
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
      if (hooks && hooks.onEnded) hooks.onEnded();
    };
    src.start(0, offset);

    if (hooks && hooks.onSource) hooks.onSource(src);
    this._paused = false;
    if (hooks && hooks.onStateChange) hooks.onStateChange('playing');
  }

  /**
   * 播放即兴连播的一轮 —— 排到 Web Audio 时间轴上（可与其他轮叠尾）
   * @returns {object} round（带 src / gain / startAt / endAt，供调度用）
   */
  playRound(round, g, hooks) {
    const ctx = this.ensureCtx();
    const startAt = Math.max(ctx.currentTime + 0.05, (hooks && hooks.startAt) || ctx.currentTime + 0.05);
    const fadeInSec = (hooks && hooks.fadeIn) || 1.6;

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

  /**
   * 把下一轮接到本轮尾部（叠尾相接）
   * 上一轮淡出、下一轮淡入，中间有约 10%（上限 2 秒）的重叠，
   * 听上去绵延不绝（丝竹乐句接句之意）。
   */
  scheduleRound(prev, next, g) {
    if (!prev || !next || !this._ctx) return;
    const ctx = this._ctx;
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

    this.playRound(next, g, { startAt, fadeIn: 1.6 });
    if (g && g.rounds) {
      g.rounds.push(next);
      g.pending = null;
      prev.done = true;
      // 只保留最近两轮，旧轮次交给垃圾回收
      while (g.rounds.length > 2) {
        const old = g.rounds.shift();
        if (old.src) { try { old.src.onended = null; } catch (e) { /* noop */ } }
      }
    }
  }

  /* ---------- 控制 ---------- */

  pause() {
    if (!this._ctx) return false;
    if (this._ctx.state === 'suspended') { this._paused = true; return true; }
    try {
      const p = this._ctx.suspend();
      if (p && p.then) p.then(() => { this._paused = true; }, () => { this._paused = false; });
    } catch (e) {
      return false;
    }
    this._paused = true;
    return true;
  }

  resume() {
    if (!this._ctx) return false;
    try {
      const p = this._ctx.resume();
      if (p && p.then) p.then(() => { this._paused = false; }, () => { /* noop */ });
    } catch (e) {
      return false;
    }
    this._paused = false;
    return true;
  }

  stop() {
    if (this._ctx) {
      try { this._ctx.close(); } catch (e) { /* 已关闭 */ }
    }
    this._ctx = null;
    this._master = null;
    this._analyser = null;
    this._ambBus = null;
    this._ambNoise = null;
    this._ambNodes = null;
    this._paused = false;
  }

  setVolume(v) {
    const vol = Math.max(0, Math.min(1, v));
    this._volume = vol;
    if (this._master) this._master.gain.value = vol;
  }

  teardown() {
    this.stop();
  }
}

/* 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebBackend, LIVE_NATURE_RECIPES, makeNoiseBuffer };
} else {
  window.ICWebBackend = { WebBackend, LIVE_NATURE_RECIPES, makeNoiseBuffer };
}

})();
