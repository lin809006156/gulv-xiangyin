/**
 * 古律象音 · 纯 JS 数字音频渲染器
 * ---------------------------------------------------------------
 * 不依赖 Web Audio API —— 浏览器 / 微信小程序 / Node 三端通用。
 *
 * 之所以不用 Web Audio：
 *   微信小程序 wx.createWebAudioContext()（基础库 2.19.0+）不支持
 *   createConvolver（混响）与 createStereoPanner（声像），
 *   也没有 OfflineAudioContext，无法离线导出。
 *
 * 本模块用纯数学生成 PCM：
 *   加法合成 —— 钟磬的非谐泛音、弦乐的谐波列
 *   减法合成 —— 竹木吹管的锯齿波经时变低通、埙的闭口共鸣
 *   瞬态噪声 —— 鼓与石磬的击打感
 *   恒定功率声像 —— 替代 StereoPannerNode
 *   Schroeder 混响 —— 4 并联梳状 + 2 串联全通，替代 ConvolverNode
 *
 * 音色（voice）共八种，依《白虎通·礼乐》引《乐记》八音配八卦：
 *   柷敔（乾·木） 钟（兑·金） 弦（离·丝） 鼓（震·皮）
 *   箫（巽·竹）   埙（坎·土） 管（艮·竹） 磬（坤·石）
 * 清人陈立《白虎通疏证》补足二处：箫属巽、磬属坤。
 *
 * 每种乐器另有其物理特征（见 VOICE_SPECS）：
 *   钟 —— 非谐泛音丰富、衰减极长、基音不纯
 *   磬 —— 非谐泛音但高频更亮、衰减短促、干硬
 *   鼓 —— 膜面基频下坠、冲击噪声强烈
 *   箫 —— 闭孔吹奏、基频弱、气声多、泛音柔和
 *   埙 —— 陶质闭管、低频共鸣突出、偶次泛音明显
 *   管 —— 开孔吹奏、音量充实、泛音明亮
 *   柷敔 —— 木质敲击、瞬态极短、几乎没有延音
 *   弦 —— 拨弦、谐波列丰富、衰减中带轻微音高漂移
 *
 * 另有五音音色修饰（timbre），依《礼记·乐记》疏的清浊次第：
 *   宫（至浊）→ 商 → 角（清浊相半）→ 徵（次清）→ 羽（最清）
 * 体现为 brightness（频谱明亮度）、attack（起音）、
 * release（余韵）、noise（气声占比）、harmonic（泛音浓度）五项。
 *
 * 全部随机源使用确定性 PRNG，同一音符表永远渲染出同一段波形。
 */

'use strict';

/* __IC_IIFE__ */
(function () {


const DEFAULT_SR = 44100;

/**
 * 默认五音音色修饰
 * 取《礼记·乐记》清浊次第之"角"（清浊相半）为中值，
 * 使无 timbre 标注的音符也有合理的音色。
 */
const DEFAULT_TIMBRE = {
  clarity: 0.55,
  brightness: 0.64,
  attack: 0.058,
  release: 0.90,
  noise: 0.18,
  harmonic: 0.68
};

/* ===============================================================
 * 一、基础工具
 * =============================================================== */

/** 确定性 PRNG（mulberry32）：同种子必得同序列 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** MIDI 音高 → 频率（Hz） */
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 恒定功率声像：pan ∈ [-1, 1] */
function panGains(pan) {
  const ang = (Math.max(-1, Math.min(1, pan)) + 1) * (Math.PI / 4);
  return { gl: Math.cos(ang), gr: Math.sin(ang) };
}

/* ===============================================================
 * 一之二、正弦查表
 * ---------------------------------------------------------------
 * 合成器的振荡器是纯粹的「相位递推 + 取正弦」，
 * 而 Math.sin 是热点中最贵的一环。改用 2048 点查表 + 线性插值：
 *   精度：插值误差 < 1e-5，远低于 16 位量化噪声；
 *   速度：约快 3~5 倍，是渲染提速的主要来源。
 * 表为全局共享，构造时预计算一次。
 * =============================================================== */
const SIN_TABLE_SIZE = 2048;
const SIN_TABLE = (function () {
  const t = new Float64Array(SIN_TABLE_SIZE + 1);
  for (let i = 0; i <= SIN_TABLE_SIZE; i++) {
    t[i] = Math.sin((i / SIN_TABLE_SIZE) * Math.PI * 2);
  }
  return t;
})();

/**
 * 相位（弧度，0..2π）→ 正弦值（查表 + 线性插值）
 * @param {number} phase
 */
function fastSin(phase) {
  // 相位归一到 [0, 1)
  let x = phase * (1 / (Math.PI * 2));
  x = x - Math.floor(x);
  const idx = x * SIN_TABLE_SIZE;
  const i0 = idx | 0;
  const frac = idx - i0;
  const a = SIN_TABLE[i0];
  const b = SIN_TABLE[i0 + 1];
  return a + (b - a) * frac;
}

/* ===============================================================
 * 二、滤波器
 * =============================================================== */

/**
 * TPT 状态变量滤波器（Zavalishin）
 * 全频段稳定，同时给出 low / band / high 三路输出。
 * 用于低通（笙）、带通（气息）、高通（鼓的噪声瞬态）。
 */
class SVF {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.ic1 = 0;
    this.ic2 = 0;
    this.g = 0;
    this.k = 1;
    this.a1 = 0;
    this.a2 = 0;
    this.a3 = 0;
  }

  /** 设置截止频率与 Q */
  set(freq, q) {
    const fc = Math.max(20, Math.min(this.sr * 0.45, freq));
    this.g = Math.tan(Math.PI * fc / this.sr);
    this.k = 1 / Math.max(0.5, q);
    this.a1 = 1 / (1 + this.g * (this.g + this.k));
    this.a2 = this.g * this.a1;
    this.a3 = this.g * this.a2;
  }

  /**
   * 处理一个样本
   * @param {number} x 输入
   * @param {string} out 'low' | 'band' | 'high'
   */
  process(x, out) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    if (out === 'low') return v2;
    if (out === 'high') return x - this.k * v1 - v2;
    return v1;
  }
}

/** 梳状滤波器（带阻尼），混响的基本单元 */
class Comb {
  constructor(delaySamples, feedback, damp) {
    this.buf = new Float32Array(Math.max(1, Math.round(delaySamples)));
    this.idx = 0;
    this.fb = feedback;
    this.damp = damp;
    this.store = 0;
  }

  process(x) {
    const y = this.buf[this.idx];
    this.store = y * (1 - this.damp) + this.store * this.damp;
    this.buf[this.idx] = x + this.store * this.fb;
    this.idx = (this.idx + 1) % this.buf.length;
    return y;
  }
}

/** 全通滤波器，用于打散梳状滤波的规则性 */
class AllPass {
  constructor(delaySamples, g) {
    this.buf = new Float32Array(Math.max(1, Math.round(delaySamples)));
    this.idx = 0;
    this.g = g;
  }

  process(x) {
    const y = this.buf[this.idx];
    this.buf[this.idx] = x + y * this.g;
    this.idx = (this.idx + 1) % this.buf.length;
    return -x + y;
  }
}

/* ===============================================================
 * 二之二、八音音色规格
 * ---------------------------------------------------------------
 * 依《白虎通·礼乐》引《乐记》「土曰埙，竹曰管，皮曰鼓，匏曰笙，
 * 丝曰弦，石曰磬，金曰钟，木曰柷敔」定八音之材，
 * 各材质的物理特性决定其音色特征。
 * =============================================================== */

/** 音色物理规格（纯数值，供合成器读取） */
const VOICE_SPECS = {
  zhu: {           // 柷敔：木，方木相击，瞬态锐利、极高频、极短促
    partials: [1.0, 2.9, 4.7],
    partialAmp: [1.0, 0.30, 0.12],
    partialDecay: [0.09, 0.06, 0.04],
    inharmonic: 0.26,
    attack: 0.0008,
    decayScale: 0.065,
    noiseAmt: 0.55,
    noiseHP: 9000,
    noiseDecay: 0.005,
    gain: 1.9, tone: 0.34,
    sub: 0.0
  },
  zhong: {        // 钟：金属合瓦形，非谐泛音丰富，余韵极长
    partials: [1.0, 2.0, 2.76, 5.40, 8.93],
    partialAmp: [1.0, 0.52, 0.40, 0.22, 0.10],
    partialDecay: [1.0, 0.72, 0.58, 0.36, 0.20],
    inharmonic: 0.92,
    attack: 0.0035,
    decayScale: 0.62,
    noiseAmt: 0.06,
    noiseHP: 4200,
    noiseDecay: 0.010,
    gain: 1, tone: 0.40,
    sub: 0.30
  },
  xian: {         // 弦：拨弦，谐波列丰富，衰减中带音高漂移
    partials: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
    partialAmp: [1.0, 0.62, 0.44, 0.31, 0.22, 0.15, 0.10, 0.06],
    partialDecay: [1.0, 0.80, 0.68, 0.56, 0.46, 0.38, 0.30, 0.24],
    inharmonic: 0.04,
    attack: 0.0042,
    decayScale: 0.50,
    noiseAmt: 0.05,
    noiseHP: 3400,
    noiseDecay: 0.012,
    gain: 0.85, tone: 0.50,
    sub: 0.10,
    vibrato: 0.10,
    drift: 0.0012
  },
  gu: {           // 鼓：皮膜，基频下坠，冲击噪声强烈
    pitchDrop: 2.30,
    pitchEnd: 0.62,
    attack: 0.0040,
    decayScale: 0.40,
    noiseAmt: 0.46,
    noiseHP: 620,
    noiseDecay: 0.055,
    gain: 1.05, tone: 0.20,
    sub: 0.62
  },
  xiao: {         // 箫：竖吹闭孔，基频弱，气声多，余韵悠长
    partials: [1.0, 2.0, 3.0, 4.0],
    partialAmp: [1.0, 0.30, 0.15, 0.07],
    partialDecay: [1.0, 0.70, 0.50, 0.34],
    inharmonic: 0.02,
    attack: 0.105,
    decayScale: 0.52,
    noiseAmt: 0.26,
    noiseHP: 2400,
    noiseDecay: 0.34,
    gain: 2.6, tone: 0.58,
    sub: 0.0,
    sawMix: 0.30
  },
  xun: {          // 埙：陶质闭管，偶次泛音突出，低频共鸣厚
    partials: [1.0, 2.0, 3.0, 4.0],
    partialAmp: [1.0, 0.52, 0.14, 0.05],
    partialDecay: [1.0, 0.64, 0.34, 0.20],
    inharmonic: 0.10,
    attack: 0.062,
    decayScale: 0.40,
    noiseAmt: 0.22,
    noiseHP: 1200,
    noiseDecay: 0.20,
    gain: 2.8, tone: 0.20,
    sub: 0.52,
    sawMix: 0.30
  },
  guan: {         // 管：横吹开孔，音量充实，泛音明亮
    partials: [1.0, 2.0, 3.0, 4.0, 5.0],
    partialAmp: [1.0, 0.52, 0.34, 0.20, 0.11],
    partialDecay: [1.0, 0.72, 0.56, 0.40, 0.28],
    inharmonic: 0.03,
    attack: 0.045,
    decayScale: 0.46,
    noiseAmt: 0.19,
    noiseHP: 3000,
    noiseDecay: 0.22,
    gain: 2.4, tone: 0.62,
    sub: 0.12,
    sawMix: 0.40
  },
  qing: {         // 磬：玉石片击，清亮干硬，余韵悠长
    partials: [1.0, 2.6, 4.2, 6.1, 8.4],
    partialAmp: [1.0, 0.58, 0.44, 0.26, 0.13],
    partialDecay: [0.92, 0.76, 0.58, 0.40, 0.26],
    inharmonic: 0.92,
    attack: 0.0016,
    decayScale: 0.46,
    noiseAmt: 0.46,
    noiseHP: 4200,
    noiseDecay: 0.013,
    gain: 1.55, tone: 0.86,
    sub: 0.0
  }
};

/** 装饰性音色（不属八音，用于点缀与低频支撑） */
const AUX_SPECS = {
  click: {        // 质点：木质打击点缀
    noiseAmt: 0.55, noiseHP: 2600, noiseDecay: 0.030, attack: 0.0015, decayScale: 0.14
  },
  pad: {          // 垫底长音：三音微失谐
    detune: 0.005, attack: 0.28, decayScale: 0.42
  }
};

/* ===============================================================
 * 三、混音器与音色合成
 * =============================================================== */

class Mixer {
  /**
   * @param {Float32Array} left 左声道
   * @param {Float32Array} right 右声道
   * @param {number} sampleRate
   * @param {number} seed 随机种子
   */
  constructor(left, right, sampleRate, seed) {
    this.L = left;
    this.R = right;
    this.sr = sampleRate;
    this.n = left.length;
    this.rnd = mulberry32(seed || 12345);

    // 预生成噪声缓冲（2 秒），循环取用，保证确定性
    const nlen = Math.floor(sampleRate * 2);
    this.noise = new Float32Array(nlen);
    for (let i = 0; i < nlen; i++) this.noise[i] = this.rnd() * 2 - 1;
    this.noiseIdx = 0;

    // 单音符临时缓冲（供清浊倾斜滤波使用）
    this.scratch = null;

    // 写入基准：渲染单音到 scratch 时置为该音起始样本号，写入时减去
    this.wBase = 0;

    // pad 音色可一次发出多个音（伴奏的「宫音踏板 + 和声垫」合并渲染）
    this._padTones = [];
  }

  /** 取一个噪声样本（循环） */
  nz() {
    const v = this.noise[this.noiseIdx];
    this.noiseIdx = (this.noiseIdx + 1) % this.noise.length;
    return v;
  }

  /** 写入一个样本（带边界保护）
   *
   * 写入基准 wBase：
   *   渲染单个音符到 scratch 缓冲时，缓冲下标从 0 起算，
   *   故须把 wBase 置为该音符的起始样本号，写入时统一减去。
   *   混回主缓冲时 wBase 复位为 0。
   */
  w(i, l, r) {
    const j = i - this.wBase;
    if (j < 0 || j >= this.L.length) return;
    this.L[j] += l;
    this.R[j] += r;
  }

  /**
   * 渲染单个音符
   * @param {object} note { time, dur, midi, vel, voice, pan }
   */
  renderNote(note) {
    const start = Math.round(note.time * this.sr);
    const freq = midiToFreq(note.midi);
    const dur = Math.max(0.01, note.dur);
    const vel = note.vel;
    const { gl, gr } = panGains(note.pan || 0);

    // 五音音色修饰（《礼记·乐记》清浊次第）
    const tb = note.timbre || DEFAULT_TIMBRE;

    // 打击类乐器（柷敔、鼓、点）的"清浊"体现在起音与余韵，
    // 其频谱由材质决定、不随调式而变，故不施加清浊倾斜滤波。
    const isPercussive = note.voice === 'gu' || note.voice === 'zhu' || note.voice === 'click';

    // 渲染到临时缓冲，以便对有音高的乐器施加统一的清浊倾斜
    const len = Math.min(Math.ceil(dur * this.sr) + 2, this.n - start);
    if (len <= 0) return;
    if (!this.scratch || this.scratch.length < len) this.scratch = new Float32Array(len);
    const tmp = this.scratch.subarray(0, len);
    tmp.fill(0);

    // 暂存主缓冲，切换到临时缓冲渲染
    const mainL = this.L, mainR = this.R;
    this.L = tmp; this.R = tmp;
    // 写入基准：voice 函数按绝对样本号写入，减去此基准后落在 scratch 的相对下标上
    this.wBase = start;

    switch (note.voice) {
      case 'zhu': this.vWoodClap(start, freq, dur, vel, 1, 1, tb); break;
      case 'zhong': this.vBell(start, freq, dur, vel, 1, 1, tb); break;
      case 'xian': this.vString(start, freq, dur, vel, 1, 1, tb); break;
      case 'gu': this.vDrum(start, freq, dur, vel, 1, 1, tb); break;
      case 'xiao': this.vBlow(start, freq, dur, vel, 1, 1, tb, 'xiao'); break;
      case 'xun': this.vBlow(start, freq, dur, vel, 1, 1, tb, 'xun'); break;
      case 'guan': this.vBlow(start, freq, dur, vel, 1, 1, tb, 'guan'); break;
      case 'qing': this.vStone(start, freq, dur, vel, 1, 1, tb); break;
      case 'click': this.vClick(start, freq, dur, vel, 1, 1, tb); break;
      case 'pad': {
        // pad 支持一次发出多个音（tones），用于合并「宫音踏板 + 和声垫」
        this._padTones = (note.tones && note.tones.length)
          ? note.tones.map(midiToFreq)
          : [freq];
        this.vPad(start, freq, dur, vel, 1, 1, tb);
        this._padTones = [];
        break;
      }
      default: this.vBlow(start, freq, dur, vel, 1, 1, tb, 'guan'); break;
    }

    this.L = mainL; this.R = mainR;
    this.wBase = 0;

    // 清浊倾斜：浊（宫）多滤高频，羽清则少滤。此为五音音色之枢轴
    if (!isPercussive) {
      this._tilt(tmp, len, freq, tb);
    }

    // 混入主缓冲并施加声像
    for (let i = 0; i < len; i++) {
      const s = tmp[i];
      this.w(start + i, s * gl, s * gr);
    }
  }

  /**
   * 清浊倾斜滤波（一阶低通与原信号混合）
   * 混合量与截止频率皆随清浊度单调变化：
   *   宫（浊）→ 低通重、频谱重心低
   *   羽（清）→ 低通轻、频谱重心高
   * 由此，五音的"声之清浊"在所有有音高的乐器上皆可测、可听。
   */
  _tilt(buf, len, freq, tb) {
    const bright = Math.max(0.05, Math.min(1, tb.brightness));
    // 低通混合量：越浊越多
    const mix = Math.pow(1 - bright, 1.25) * 0.88;
    if (mix < 0.02) return;
    // 截止频率随基频与明亮度上移
    const fc = Math.min(this.sr * 0.45, freq * (1.1 + bright * 7.5));
    const a = 1 - Math.exp(-2 * Math.PI * fc / this.sr);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const x = buf[i];
      y += a * (x - y);
      buf[i] = x * (1 - mix) + y * mix;
    }
  }

  /* ---------- 通用：音色修饰后的包络与滤波参数 ---------- */

  /**
   * 按五音清浊计算本次渲染的频谱明亮度与起音时长
   * 浊（宫）→ 暗、缓起；清（羽）→ 亮、促起
   *
   * 映射刻意做得陡：清浊之别在听感上必须可辨，
   * 故明亮度以近指数方式拉开，而非线性微调。
   *
   * 注意：bright 先按清浊求得"目标亮度"，再与乐器本色 tone 相乘。
   * 但相乘会把区间压窄（tone 大的乐器调制空间小），
   * 故此处用几何平均而非直接相乘，保证任何乐器的清浊跨度都足够。
   */
  _modulate(spec, tb) {
    // 目标亮度：清浊轴上的绝对位置
    const target = 0.06 + Math.pow(tb.brightness, 1.30) * 0.94;
    // 与乐器本色做几何平均：保留乐器识别度，又不压扁调制空间
    const geo = Math.sqrt(target * Math.min(1.0, spec.tone));
    const bright = Math.max(0.04, Math.min(1.0, geo));
    const atk = Math.max(0.0008, spec.attack * (1.95 - tb.attack * 1.9));
    return { bright, atk };
  }

  /**
   * 泛音加法合成（钟、磬、弦共用骨架，差异在 partials/decay）
   */
  _additive(start, freq, dur, vel, gl, gr, tb, spec, opts) {
    const o = opts || {};
    const { bright, atk } = this._modulate(spec, tb);
    const partials = spec.partials;
    const total = Math.min(Math.ceil(dur * this.sr), this.n - start);
    if (total <= 0) return;

    const atkN = Math.max(1, Math.round(atk * this.sr));
    const baseTau = dur * spec.decayScale * tb.release;
    const g = spec.gain !== undefined ? spec.gain : 1;

    for (let p = 0; p < partials.length; p++) {
      // 非谐泛音：真实钟磬的泛音不成整数倍
      const inh = 1 + (spec.inharmonic * 0.06 * (p % 2 === 0 ? 1 : -1) * (p + 1));
      const ratio = partials[p] * inh;
      // 明亮度控制高次泛音的保留量：
      //   bright  —— 频谱明暗（清则亮，浊则暗）
      //   harmonic —— 泛音浓度（《乐记》清浊次第：宫厚而羽薄）
      //   宫音（harmonic 高、bright 低）应基频饱满、高次泛音少；
      //   羽音（harmonic 低、bright 高）应基音轻、泛音纤薄而清亮。
      // 明暗项：越亮，高次泛音保留越多。
      // 须与下面的「浓度项」同向（皆随清浊上升），
      // 否则两项互相抵消，明亮的乐器反而清不出差别。
      const rel = p / Math.max(1, partials.length - 1);
      const brightKeep = Math.max(0.04, 1 + (bright - 0.45) * 1.85 * rel);
      // 浓度项：越厚（宫），高次泛音越少、基音越饱满
      const densityKeep = Math.max(0.10, (1.55 - tb.harmonic * 1.25) - rel * tb.harmonic * 0.75);
      const amp = vel * spec.partialAmp[p] * g * 0.42
        * (p === 0 ? 1 : brightKeep * densityKeep);
      if (amp < 0.0006) continue;

      const w = 2 * Math.PI * freq * ratio / this.sr;
      const tau = Math.max(0.004, baseTau * spec.partialDecay[p]);
      // 递推包络：衰减自起音结束处起算（先起后衰，不应两段相乘）
      // 每采样乘以 decay 系数即得 exp(-td/tau)，避免逐点调用 Math.exp
      const decay = Math.exp(-1 / (tau * this.sr));
      let phase = 0;
      let env = 1;
      const twoPi = Math.PI * 2;
      for (let i = 0; i < total; i++) {
        const ramp = i < atkN ? i / atkN : 1;
        if (i >= atkN) {
          env *= decay;
          if (env < 1e-4) break;         // 已听不见，提前退出
        }
        const s = fastSin(phase) * env * ramp * amp;
        phase += w;
        if (phase > twoPi) phase -= twoPi;
        this.w(start + i, s * gl, s * gr);
      }
    }

    // 弦乐器：衰减中的音高漂移与揉弦
    if (spec.vibrato) {
      const vibTotal = Math.min(Math.ceil(dur * this.sr), this.n - start);
      const vibDepth = spec.vibrato * (0.6 + tb.brightness * 0.8);
      const vibRate = 5.2;
      const atkSec = atk;
      for (let i = 0; i < vibTotal; i++) {
        const t = i / this.sr;
        const td = Math.max(0, t - atkSec);
        const env = (i < atkN ? i / atkN : 1) * Math.exp(-td / (baseTau * 0.9));
        if (env < 0.002) break;
        const vib = 1 + fastSin(2 * Math.PI * vibRate * t) * vibDepth * 0.012;
        const drift = 1 + spec.drift * td;
        const s = fastSin(2 * Math.PI * freq * vib * drift * td) * env * vel * g * 0.12 * tb.harmonic;
        this.w(start + i, s * gl, s * gr);
      }
    }

    // 击打瞬态：竹、石、木打击类都有
    if (spec.noiseAmt > 0.2) {
      const hp = new SVF(this.sr);
      hp.set(Math.min(this.sr * 0.45, spec.noiseHP), 0.7);
      const nTotal = Math.min(Math.ceil(Math.min(0.12, dur) * this.sr), this.n - start);
      for (let i = 0; i < nTotal; i++) {
        const t = i / this.sr;
        const env = Math.exp(-t / spec.noiseDecay);
        const s = hp.process(this.nz(), 'high') * env * vel * spec.noiseAmt * 0.34;
        this.w(start + i, s * gl, s * gr);
      }
    }
  }

  /* ---------- 柷敔（乾·木）：方木相击，干硬短促 ---------- */
  vWoodClap(start, freq, dur, vel, gl, gr, tb) {
    this._additive(start, freq, dur, vel, gl, gr, tb, VOICE_SPECS.zhu);
  }

  /* ---------- 钟（兑·金）：非谐泛音，余韵不绝 ---------- */
  vBell(start, freq, dur, vel, gl, gr, tb) {
    const spec = VOICE_SPECS.zhong;
    this._additive(start, freq, dur, vel, gl, gr, tb, spec);
    // 钟的"拍频"：两片合瓦略有偏差，产生缓慢的强弱波动
    const total = Math.min(Math.ceil(dur * this.sr), this.n - start);
    if (total <= 0) return;
    const beat = 0.9;
    const w = 2 * Math.PI * freq * 1.0028 / this.sr;
    let phase = 0;
    const tau = dur * spec.decayScale * tb.release * 1.05;
    for (let i = 0; i < total; i++) {
      const t = i / this.sr;
      const env = Math.exp(-t / tau);
      if (env < 0.003) break;
      const s = fastSin(phase) * env * vel * 0.16;
      phase += w;
      if (phase > Math.PI * 2) phase -= Math.PI * 2;
      this.w(start + i, s * gl, s * gr);
    }
  }

  /* ---------- 弦（离·丝）：拨弦，谐波列丰富 ---------- */
  vString(start, freq, dur, vel, gl, gr, tb) {
    this._additive(start, freq, dur, vel, gl, gr, tb, VOICE_SPECS.xian);
  }

  /* ---------- 磬（坤·石）：玉石相击，干硬清亮 ---------- */
  vStone(start, freq, dur, vel, gl, gr, tb) {
    this._additive(start, freq, dur, vel, gl, gr, tb, VOICE_SPECS.qing);
  }

  /* ---------- 鼓（震·皮）：膜面下坠，冲击强烈 ---------- */
  vDrum(start, freq, dur, vel, gl, gr, tb) {
    const spec = VOICE_SPECS.gu;
    const total = Math.min(Math.ceil(dur * this.sr), this.n - start);
    if (total <= 0) return;
    const atk = Math.max(1, Math.round(spec.attack * this.sr));
    const tau = dur * spec.decayScale * tb.release;
    const g = spec.gain !== undefined ? spec.gain : 1;
    // 鼓的明暗：清则冲击更亮、噪声更多；浊则更闷、噪声更钝
    const bright = Math.max(0.05, Math.min(1, 0.30 + tb.brightness * 0.80));
    const fStart = freq * spec.pitchDrop;
    const fEnd = freq * spec.pitchEnd;
    let phase = 0;
    for (let i = 0; i < total; i++) {
      const t = i / this.sr;
      const td = Math.max(0, t - spec.attack);
      const env = (i < atk ? i / atk : 1) * Math.exp(-td / tau);
      const f = fStart * Math.pow(fEnd / fStart, Math.min(1, t / Math.max(0.01, dur * 0.6)));
      phase += 2 * Math.PI * f / this.sr;
      if (phase > Math.PI * 2) phase -= Math.PI * 2;
      const s = fastSin(phase) * env * vel * g * 0.74;
      this.w(start + i, s * gl, s * gr);
    }

    // 鼓皮击打噪声：明暗决定其截止频率与浓度
    const hp = new SVF(this.sr);
    hp.set(Math.min(this.sr * 0.45, spec.noiseHP * (0.45 + bright * 1.5)), 0.7);
    const nTotal = Math.min(Math.ceil(dur * 0.25 * this.sr), this.n - start);
    for (let i = 0; i < nTotal; i++) {
      const t = i / this.sr;
      const env = Math.exp(-t / spec.noiseDecay);
      const s = hp.process(this.nz(), 'high') * env * vel * g * spec.noiseAmt * (0.20 + tb.noise * 0.75) * 0.42;
      this.w(start + i, s * gl, s * gr);
    }

    // 膜面谐振层：鼓的筒腔共鸣，明者清、薄而高，浊者厚、闷而低
    // 这是鼓在五音之间产生明暗之别的关键
    const resTotal = Math.min(Math.ceil(dur * this.sr), this.n - start);
    const resRatios = [1.0, 1.58, 2.14];
    const resAmps = [1.0, 0.46, 0.26];
    for (let k = 0; k < resRatios.length; k++) {
      // 谐振频率随清浊上移：宫音低沉闷，羽音高明亮
      const ratio = resRatios[k] * (0.82 + bright * 0.42);
      const amp = vel * g * resAmps[k] * 0.13 * (0.45 + tb.harmonic * 0.35) * (0.55 + bright * 0.7);
      if (amp < 0.0006) continue;
      const w = 2 * Math.PI * freq * ratio / this.sr;
      const rTau = dur * spec.decayScale * tb.release * (0.55 - k * 0.14);
      let phase = 0;
      for (let i = 0; i < resTotal; i++) {
        const t = i / this.sr;
        const td = Math.max(0, t - spec.attack);
        const env = (i < atk ? i / atk : 1) * Math.exp(-td / rTau);
        if (env < 0.002) break;
        const s = fastSin(phase) * env * amp;
        phase += w;
        if (phase > Math.PI * 2) phase -= Math.PI * 2;
        this.w(start + i, s * gl, s * gr);
      }
    }
  }

  /* ---------- 吹管（箫/埙/管）：气声 + 锯齿波经时变低通 ---------- */
  vBlow(start, freq, dur, vel, gl, gr, tb, kind) {
    const spec = VOICE_SPECS[kind];
    const total = Math.min(Math.ceil(dur * this.sr), this.n - start);
    if (total <= 0) return;
    const w = 2 * Math.PI * freq / this.sr;
    const lp = new SVF(this.sr);
    const { bright, atk } = this._modulate(spec, tb);
    const atkN = Math.max(1, Math.round(atk * this.sr));
    const atkSec = atk;
    const tau = dur * spec.decayScale * tb.release;
    const g = spec.gain !== undefined ? spec.gain : 1;
    // 明亮度决定滤波起始截止频率 —— 清浊之别在此最易听见
    const fHi = Math.min(this.sr * 0.45, freq * (1.5 + bright * 14));
    const fLo = Math.max(55, freq * (1.05 + bright * 3.4));
    let phase = 0;

    for (let i = 0; i < total; i++) {
      const t = i / this.sr;
      // 衰减自起音结束处起算（真实乐器包络先起后衰，不应两段相乘）
      const td = Math.max(0, t - atkSec);
      const env = (i < atkN ? i / atkN : 1) * Math.exp(-td / tau);
      const fc = fHi * Math.pow(fLo / fHi, Math.min(1, t / Math.max(0.01, dur)));
      lp.set(fc, 0.85);
      // polyBLEP 抗混叠锯齿波
      const frac = phase / (Math.PI * 2);
      let saw = 2 * frac - 1;
      const dt = freq / this.sr;
      if (frac < dt) { const x = frac / dt; saw -= x + x - x * x - 1; }
      else if (frac > 1 - dt) { const x = (frac - 1) / dt; saw -= x * x + x + x + 1; }
      // 叠加正弦基音：吹管基频强，锯齿提供泛音
      // 基频权重亦随清浊而变：浊则基音更实（宫之厚），清则基音更薄（羽之清）
      const fundamental = fastSin(phase) * spec.tone * (0.55 + tb.harmonic * 0.75);
      const mix = fundamental * (1 - spec.sawMix) + lp.process(saw, 'low') * spec.sawMix;
      const s = mix * env * vel * g * 0.66;      phase += w;
      if (phase > Math.PI * 2) phase -= Math.PI * 2;
      this.w(start + i, s * gl, s * gr);
    }

    // 低八度支撑：埙最明显
    if (spec.sub > 0) {
      const subTotal = Math.min(Math.ceil(dur * this.sr), this.n - start);
      const w2 = 2 * Math.PI * freq * 0.5 / this.sr;
      const subTau = dur * spec.decayScale * tb.release * 1.15;
      let p2 = 0;
      for (let i = 0; i < subTotal; i++) {
        const t = i / this.sr;
        const td = Math.max(0, t - atkSec);
        const env = (i < atkN ? i / atkN : 1) * Math.exp(-td / subTau);
        if (env < 0.002) break;
        const s = fastSin(p2) * env * vel * g * spec.sub * 0.36;
        p2 += w2;
        if (p2 > Math.PI * 2) p2 -= Math.PI * 2;
        this.w(start + i, s * gl, s * gr);
      }
    }

    // 气声：吹管类必备。
    // 气声量以清浊为主导（清则气多而亮，浊则气少而闷），
    // 避免与 brightness 轴相冲突。
    const bp = new SVF(this.sr);
    bp.set(Math.min(this.sr * 0.4, freq * (1.4 + bright * 2.2)), 0.9);
    const gAtk = Math.max(1, Math.round(atk * 0.6 * this.sr));
    const gTotal = Math.min(Math.ceil(dur * 0.9 * this.sr), this.n - start);
    const airAmt = spec.noiseAmt * (0.30 + tb.clarity * 0.95) * (0.75 + tb.noise * 0.45);
    for (let i = 0; i < gTotal; i++) {
      const t = i / this.sr;
      const env = (i < gAtk ? i / gAtk : 1) * Math.exp(-t / (dur * 0.30 * tb.release));
      const s = bp.process(this.nz(), 'band') * env * vel * g * airAmt * 0.55;
      this.w(start + i, s * gl, s * gr);
    }
  }

  /* ---------- 点：木质打击点缀 ---------- */
  vClick(start, freq, dur, vel, gl, gr, tb) {
    const spec = AUX_SPECS.click;
    const bp = new SVF(this.sr);
    bp.set(Math.min(this.sr * 0.4, freq * 4), 2.5);
    const total = Math.min(Math.ceil(dur * this.sr), this.n - start);
    for (let i = 0; i < total; i++) {
      const t = i / this.sr;
      const env = Math.exp(-t / (dur * spec.decayScale));
      const s = bp.process(this.nz(), 'band') * env * vel * spec.noiseAmt * 0.42;
      this.w(start + i, s * gl, s * gr);
    }
  }

  /* ---------- 垫底长音：多音微失谐叠加 ----------
   * 性能说明：pad 音符时长很长（伴奏踏板可贯串全曲），
   * 采样量占全曲大头。此处避免逐点调用 Math.exp，
   * 改用「每采样乘以固定衰减系数」的递推包络；
   * 并且一次渲染可同时发出多个音（tones 数组），
   * 使「宫音踏板 + 和声垫」可合并为一个 pad 音符，
   * 大幅削减总采样量。
   */
  vPad(start, freq, dur, vel, gl, gr, tb) {
    const spec = AUX_SPECS.pad;
    const total = Math.min(Math.ceil(dur * this.sr), this.n - start);
    if (total <= 0) return;
    const atk = Math.max(1, Math.round(spec.attack * this.sr));
    const tau = dur * spec.decayScale * tb.release;
    // 递推衰减系数：exp(-1/(tau*sr))，每采样乘一次即得 exp(-t/tau)
    const decay = Math.exp(-1 / Math.max(1e-6, tau * this.sr));
    let env = 1;                          // 衰减包络（与原始 exp(-t/tau) 等价）
    let ramp = 0;                         // 起音爬升系数

    const det = spec.detune;
    // 整数相位累加：相位以 2^16 为一周期的整数表示，
    // 查表时只需一次掩码取下标，省去浮点归一化与 Math.floor。
    const nTones = this._padTones.length;
    const pw = new Int32Array(nTones * 3);
    const ph = new Int32Array(nTones * 3);
    for (let k = 0; k < nTones; k++) {
      const f = this._padTones[k];
      pw[k * 3] = Math.round(2 * Math.PI * f / this.sr * SIN_TABLE_SIZE);
      pw[k * 3 + 1] = Math.round(2 * Math.PI * f * (1 + det) / this.sr * SIN_TABLE_SIZE);
      pw[k * 3 + 2] = Math.round(2 * Math.PI * f * (1 - det) / this.sr * SIN_TABLE_SIZE);
    }
    const MASK = SIN_TABLE_SIZE - 1;
    const invTable = 1 / SIN_TABLE_SIZE;

    for (let i = 0; i < total; i++) {
      // 起音：线性爬升；起音结束后不再爬升，保持满值
      if (i < atk) ramp = i / atk;
      // 衰减：自始即衰减，与原始 exp(-t/tau) 一致
      env *= decay;
      if (env < 1e-4) break;              // 已听不见，提前退出
      let s = 0;
      for (let k = 0; k < nTones; k++) {
        const b = k * 3;
        // 整数相位 → 查表（线性插值）
        let q0 = ph[b] & MASK;
        let q1 = ph[b + 1] & MASK;
        let q2 = ph[b + 2] & MASK;
        const f0 = (ph[b] - q0) * invTable;
        const f1 = (ph[b + 1] - q1) * invTable;
        const f2 = (ph[b + 2] - q2) * invTable;
        s += (SIN_TABLE[q0] + (SIN_TABLE[q0 + 1] - SIN_TABLE[q0]) * f0) * 0.6
          + (SIN_TABLE[q1] + (SIN_TABLE[q1 + 1] - SIN_TABLE[q1]) * f1) * 0.25
          + (SIN_TABLE[q2] + (SIN_TABLE[q2 + 1] - SIN_TABLE[q2]) * f2) * 0.25;
        ph[b] += pw[b]; ph[b + 1] += pw[b + 1]; ph[b + 2] += pw[b + 2];
      }
      const out = s * env * ramp * vel * 0.40 / Math.max(1, nTones * 0.55);
      this.w(start + i, out * gl, out * gr);
    }
  }
}

/* ===============================================================
 * 四、后期处理
 * =============================================================== */

/**
 * 疗愈音层（可选项）：索菲吉奥频率铺底
 * ---------------------------------------------------------------
 * 索菲吉奥（Solfeggio）频率是「当代音疗」流派使用的一组固定频率
 * （174/285/396/417/528/639/741/852/963 Hz），各有其名目，如
 * 528Hz 常被称「转化」、639Hz「连接」。此为当代说法，
 * **并非中国古代音律，也不属五声**，故本项目把它设计成：
 *   · 可选的后期铺底层，界面上一键开关，默认关闭由用户开启；
 *   · 卦象之音（五声）仍是绝对主体，本层只以极轻音量垫底；
 *   · 频率由卦序确定（同卦同频），不参与旋律与和声，不影响五声本体；
 *   · 不宣称任何疗效，仅作聆听氛围的现代元素。
 */
const SOLFEGGIO_FREQS = [174, 285, 396, 417, 528, 639, 741, 852, 963];

const SOLFEGGIO_LABELS = [
  '松弛', '温润', '安定', '更新',
  '澄明', '亲和', '清畅', '觉醒', '静观'
];

/** 每一频的中性介绍（只述聆听氛围的倾向，不涉疗效） */
const SOLFEGGIO_INTROS = [
  '九频中最低的一支，气息绵长，多作聆听前的放松铺垫。',
  '音区偏低而圆，听感偏暖，常作环境底色。',
  '中低音区，平稳安稳，多作静坐时的背景音。',
  '中部频率，音疗流派常将其与「重新开始」的意象相连。',
  '九频中最为人知的一支，音色明亮而笃定。',
  '中高音区，清亮舒展，多用于营造联结的氛围。',
  '音区偏高，通透利落，听感清醒。',
  '高频区，清越醒神，多作段落间的提点。',
  '最高的一支，轻而远，如余音散入空中。'
];

/**
 * 取某一卦对应的疗愈音层参数
 * @param {number} hexNo 卦序 1..64
 * @returns {object} { freq, label, index }
 */
function solfeggioForHex(hexNo) {
  const idx = ((hexNo - 1) % SOLFEGGIO_FREQS.length + SOLFEGGIO_FREQS.length) % SOLFEGGIO_FREQS.length;
  return { index: idx, freq: SOLFEGGIO_FREQS[idx], label: SOLFEGGIO_LABELS[idx] };
}

/**
 * 在已渲染的 PCM 上铺一层极轻的索菲吉奥正弦（基频 + 下方八度），
 * 带整体缓慢淡入淡出，像气息一样托在五声之下。
 * @param {Float32Array} L 左声道（就地修改）
 * @param {Float32Array} R 右声道（就地修改）
 * @param {number} sr 采样率
 * @param {number} freq 频率（Hz），0 或负数表示关闭
 * @param {number} level 音量（相对），默认 0.05
 */
function applySolfeggio(L, R, sr, freq, level) {
  if (!freq || freq <= 0 || !level || level <= 0) return;
  const n = L.length;
  if (!n) return;
  const w = 2 * Math.PI * freq / sr;
  const wSub = 2 * Math.PI * freq * 0.5 / sr;
  const twoPi = Math.PI * 2;
  const fadeIn = Math.max(1, Math.floor(n * 0.18));
  const fadeOut = Math.max(1, Math.floor(n * 0.82));
  let ph = 0, ph2 = 0;
  for (let i = 0; i < n; i++) {
    // 整体包络：缓慢淡入、缓慢淡出（平方曲线更柔）
    let g = 1;
    if (i < fadeIn) g = i / fadeIn;
    else if (i > fadeOut) g = Math.max(0, (n - i) / (n - fadeOut));
    g *= g;
    const s = fastSin(ph) * 0.80 + fastSin(ph2) * 0.35;
    ph += w; if (ph > twoPi) ph -= twoPi;
    ph2 += wSub; if (ph2 > twoPi) ph2 -= twoPi;
    const o = s * g * level;
    L[i] += o;
    R[i] += o * 0.94;   // 轻微去相关，拓宽立体声
  }
}

/* ===============================================================
 * 自然音层（可选项）：雨声 / 鸟鸣 / 篝火 / 风声 / 溪流
 * ---------------------------------------------------------------
 * 五层皆由本模块**程序化合成**（无采样音频、无外部文件）：
 *   · 全部使用确定性 PRNG（mulberry32），同参数必得同波形；
 *   · 每层默认电平 0.06~0.13，合计远低于五声本体；
 *   · 渲染位置与疗愈音层相同——混响之后、动态处理之前，
 *     不进音符表，故五声校验（音阶归属、清浊、无半音）完全不受影响；
 *   · 可多选叠加（雨声 + 鸟鸣 + 篝火…），各层独立种子互不相关。
 * =============================================================== */

const NATURE_LAYERS = [
  { key: 'rain',   name: '雨声', level: 0.12, intro: '细雨：滤噪雨体绵绵不绝，偶有零星雨点。' },
  { key: 'birds',  name: '鸟鸣', level: 0.13, intro: '远山鸟鸣：三两短啼，时远时近，不成曲调。' },
  { key: 'fire',   name: '篝火', level: 0.11, intro: '篝火：柴火低鸣起伏，偶有爆裂噼啪。' },
  { key: 'wind',   name: '风声', level: 0.09, intro: '山风：气流缓急起伏，无一定之节。' },
  { key: 'stream', name: '溪流', level: 0.10, intro: '溪流：水石相激，潺潺不绝。' }
];

/** 雨声：一阶低通白噪成雨体 + 随机高频雨点 */
function ambientRain(L, R, sr, level, rnd) {
  const n = L.length;
  const dur = n / sr;
  let lp = 0;
  const a = 1 - Math.exp(-2 * Math.PI * 1100 / sr);
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    lp += a * (w - lp);
    const v = lp * 0.62 * level;
    L[i] += v;
    R[i] += v * 0.90;
  }
  // 雨点：短促正弦 ping（900~2600Hz，40~90ms 衰减），左右随机分布
  const drops = Math.floor(dur * 1.6);
  for (let k = 0; k < drops; k++) {
    const i0 = Math.floor(rnd() * n);
    const len = Math.floor(sr * (0.04 + rnd() * 0.05));
    const w = 2 * Math.PI * (900 + rnd() * 1700) / sr;
    const dec = Math.exp(-1 / (sr * (0.02 + rnd() * 0.03)));
    const amp = (0.25 + rnd() * 0.5) * level;
    const gains = panGains(rnd() * 0.6 - 0.3);
    let ph = rnd() * 6.283;
    let env = 1;
    for (let i = 0; i < len; i++) {
      const idx = i0 + i;
      if (idx >= n) break;
      const s = fastSin(ph) * env * amp;
      ph += w;
      env *= dec;
      L[idx] += s * gains.gl;
      R[idx] += s * gains.gr;
    }
  }
}

/** 鸟鸣：成群出现的短啼，每声 1~3 个滑音音节 */
function ambientBirds(L, R, sr, level, rnd) {
  const n = L.length;
  const dur = n / sr;
  let t = 0.3 + rnd() * 1.2;
  while (t < dur - 0.5) {
    const notes = 1 + Math.floor(rnd() * 3);
    let nt = t;
    for (let k = 0; k < notes; k++) {
      const syl = 1 + Math.floor(rnd() * 3);
      for (let s = 0; s < syl; s++) {
        renderChirp(L, R, sr, nt, level, rnd, n);
        nt += 0.05 + rnd() * 0.09;
      }
      nt += 0.08 + rnd() * 0.2;
    }
    t = nt + 0.8 + rnd() * 2.6;
  }
}

/** 单声鸟啼：滑音正弦 + 轻颤音 + 快起慢收包络 */
function renderChirp(L, R, sr, tStart, level, rnd, n) {
  const durS = 0.06 + rnd() * 0.1;
  const len = Math.floor(durS * sr);
  const f0 = 1700 + rnd() * 900;
  const f1 = 2400 + rnd() * 1900;
  const up = rnd() < 0.5 ? 1 : -1;          // 上行或下行滑音
  const vib = 5 + rnd() * 9;                 // 颤音频次（Hz）
  const vibDepth = 0.02 + rnd() * 0.04;
  const amp = (0.5 + rnd() * 0.5) * level;
  const gains = panGains(rnd() * 1.2 - 0.6);
  const i0 = Math.floor(tStart * sr);
  let ph = rnd() * 6.283;
  for (let i = 0; i < len; i++) {
    const idx = i0 + i;
    if (idx >= n) break;
    const p = i / len;
    const f = f0 + (f1 - f0) * p * up;
    const w = 2 * Math.PI * f * (1 + vibDepth * fastSin(2 * Math.PI * vib * p)) / sr;
    const env = Math.min(1, p * 14) * Math.pow(1 - p, 1.6);
    const s = fastSin(ph) * env * amp;
    ph += w;
    L[idx] += s * gains.gl;
    R[idx] += s * gains.gr;
  }
}

/** 篝火：白噪低鸣（低通约 800Hz）+ 随机带通噪声爆裂 */
function ambientFire(L, R, sr, level, rnd) {
  const n = L.length;
  const dur = n / sr;
  let lp = 0;
  const a = 1 - Math.exp(-2 * Math.PI * 800 / sr);
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    lp += a * (w - lp);
    const v = lp * 0.85 * level;
    L[i] += v;
    R[i] += v * 0.92;
  }
  const pops = Math.floor(dur * (2 + rnd() * 3));
  for (let k = 0; k < pops; k++) {
    const i0 = Math.floor(rnd() * n);
    const len = Math.floor(sr * (0.02 + rnd() * 0.06));
    const dec = Math.exp(-1 / (sr * (0.01 + rnd() * 0.03)));
    const amp = (0.25 + rnd() * 0.5) * level;
    const gains = panGains(rnd() * 1.4 - 0.7);
    const aLo = 1 - Math.exp(-2 * Math.PI * 300 / sr);
    const aHi = 1 - Math.exp(-2 * Math.PI * (900 + rnd() * 500) / sr);
    let lo = 0, hi = 0, env = 1;
    for (let i = 0; i < len; i++) {
      const idx = i0 + i;
      if (idx >= n) break;
      const x = rnd() * 2 - 1;
      lo += aLo * (x - lo);
      hi += aHi * (x - hi);
      const s = (hi - lo) * env * amp;
      env *= dec;
      L[idx] += s * gains.gl;
      R[idx] += s * gains.gr;
    }
  }
}

/** 风声：白噪经缓变低通，截止与音量随两个慢 LFO 起伏（风的呼吸） */
function ambientWind(L, R, sr, level, rnd) {
  const n = L.length;
  const lfo1 = 0.07 + rnd() * 0.06;
  const lfo2 = 0.11 + rnd() * 0.08;
  const p1 = rnd() * 6.283, p2 = rnd() * 6.283;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = rnd() * 2 - 1;
    const lfo = 0.5 + 0.7 * fastSin(2 * Math.PI * lfo1 * t + p1)
              + 0.3 * fastSin(2 * Math.PI * lfo2 * t + p2);
    const swell = Math.max(0.05, lfo);
    const fc = 240 + 700 * swell;
    const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
    lp += a * (w - lp);
    const v = lp * 1.3 * level * (0.35 + 0.65 * swell);
    L[i] += v;
    R[i] += v * 0.88;
  }
}

/** 溪流：白噪经双极点带通（中心约 1.4kHz），幅度轻晃成潺潺 */
function ambientStream(L, R, sr, level, rnd) {
  const n = L.length;
  const f = 2 * Math.sin(Math.PI * 1400 / sr);
  const q = 1.1;
  let lp = 0, bp = 0;
  let amp = 0.8;
  for (let i = 0; i < n; i++) {
    const x = rnd() * 2 - 1;
    const hp = x - lp - q * bp;
    bp += f * hp;
    lp += f * bp;
    amp += (rnd() - 0.5) * 0.02;             // 幅度随机慢游
    amp = Math.max(0.6, Math.min(1.15, amp));
    const v = bp * 0.5 * level * amp;
    L[i] += v;
    R[i] += v * 0.95;
  }
}

function applyNatureLayer(L, R, sr, key, level, rnd) {
  // 一阶滤波噪声的每样本能量随采样率而变（16k 比 44.1k 约响 1.7 倍），
  // 按 √(sr/44100) 归一，使各采样率下音层的相对强弱一致。
  const lv = level * Math.sqrt(sr / 44100);
  switch (key) {
    case 'rain': ambientRain(L, R, sr, lv, rnd); break;
    case 'birds': ambientBirds(L, R, sr, lv, rnd); break;
    case 'fire': ambientFire(L, R, sr, lv, rnd); break;
    case 'wind': ambientWind(L, R, sr, lv, rnd); break;
    case 'stream': ambientStream(L, R, sr, lv, rnd); break;
    default: break;
  }
}

/**
 * 音层总入口：疗愈频率（九频选一，可关）+ 自然音层（五选多，可叠加）
 * @param {Float32Array} L 左声道（就地修改）
 * @param {Float32Array} R 右声道（就地修改）
 * @param {number} sr 采样率
 * @param {object} amb {
 *   solfeggio: { freq, level } | null,     // freq ≤ 0 表示关闭
 *   nature: { rain: bool|0..1, ... },      // 各自然层开关/强度
 *   level: 0..1                            // 音层总音量（乘在所有层上）
 * }
 * 全部缺席或电平为 0 时直接返回——波形与纯净渲染逐位一致。
 */
function applyAmbient(L, R, sr, amb) {
  if (!amb) return false;
  const master = amb.level === undefined ? 1 : amb.level;
  if (master <= 0) return false;
  let touched = false;

  const sol = amb.solfeggio;
  if (sol && sol.freq > 0) {
    const lv = (sol.level === undefined ? 0.05 : sol.level) * master;
    if (lv > 0) {
      applySolfeggio(L, R, sr, sol.freq, lv);
      touched = true;
    }
  }

  const nat = amb.nature;
  if (nat) {
    NATURE_LAYERS.forEach((layer) => {
      const on = nat[layer.key];
      if (!on) return;
      const lv = (typeof on === 'number' ? on : 1) * layer.level * master;
      if (lv <= 0) return;
      // 每层独立种子：层与层互不相关，而同参数整体确定可复现
      const seed = (0x9E3779B9 ^ (layer.key.length * 7919)
        ^ (layer.key.charCodeAt(0) * 104729)) >>> 0;
      applyNatureLayer(L, R, sr, layer.key, lv, mulberry32(seed));
      touched = true;
    });
  }
  return touched;
}

/**
 * Schroeder 混响：4 并联梳状 + 2 串联全通
 * 替代 Web Audio 的 ConvolverNode（小程序不支持）
 */
function applyReverb(L, R, sr, wetAmount) {
  if (wetAmount <= 0) return;
  const scale = sr / 44100;
  const combDelays = [1116, 1188, 1277, 1356].map((d) => d * scale);
  const apDelays = [556, 441].map((d) => d * scale);
  const fb = 0.85;
  const damp = 0.25;

  const combs = combDelays.map((d) => new Comb(d, fb, damp));
  const aps = apDelays.map((d) => new AllPass(d, 0.5));

  const n = L.length;
  for (let i = 0; i < n; i++) {
    const input = (L[i] + R[i]) * 0.5;
    let wet = 0;
    for (let c = 0; c < combs.length; c++) wet += combs[c].process(input);
    wet *= 0.25;
    for (let a = 0; a < aps.length; a++) wet = aps[a].process(wet);

    L[i] += wet * wetAmount;
    R[i] += wet * wetAmount * 0.92;   // 轻微去相关，拓宽立体声
  }
}

/** 前馈压缩器：抑制多声部叠加造成的过载 */
function compress(L, R, sr) {
  const thr = 0.5;
  const ratio = 3.5;
  const atk = Math.exp(-1 / (0.005 * sr));
  const rel = Math.exp(-1 / (0.15 * sr));
  let env = 0;

  for (let i = 0; i < L.length; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    env = a > env ? atk * env + (1 - atk) * a : rel * env + (1 - rel) * a;
    if (env > thr) {
      const g = Math.pow(thr / env, 1 - 1 / ratio);
      L[i] *= g;
      R[i] *= g;
    }
  }
}

/** 峰值归一化 + 软限幅 */
function normalize(L, R, targetPeak) {
  let peak = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.abs(L[i]);
    if (a > peak) peak = a;
    const b = Math.abs(R[i]);
    if (b > peak) peak = b;
  }
  if (peak > 0) {
    const g = targetPeak / peak;
    if (g < 1) {
      for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; }
      peak = targetPeak;
    }
  }
  // 软限幅：仅在接近满量程处起作用
  for (let i = 0; i < L.length; i++) {
    L[i] = Math.tanh(L[i] * 1.05) / Math.tanh(1.05);
    R[i] = Math.tanh(R[i] * 1.05) / Math.tanh(1.05);
  }
  return peak;
}

/* ===============================================================
 * 五、公开接口
 * =============================================================== */

/**
 * 渲染音符表为 PCM
 * @param {object} score composeNotes 的输出
 * @param {object} opts { sampleRate, seed, reverb, targetPeak }
 * @returns {object} { left, right, sampleRate, duration, peak, length }
 */
function renderScore(score, opts) {
  const o = opts || {};
  const sr = o.sampleRate || DEFAULT_SR;
  const duration = score.duration || 0;
  // 额外 0.1 秒给混响尾音留出空间，避免尾音被截断
  const len = Math.max(1, Math.ceil(duration * sr) + Math.floor(sr * 0.1));
  const L = new Float32Array(len);
  const R = new Float32Array(len);

  const seed = o.seed !== undefined ? o.seed : (score.seed || 20240101);
  const mix = new Mixer(L, R, sr, seed);

  for (let i = 0; i < score.notes.length; i++) {
    mix.renderNote(score.notes[i]);
  }

  applyReverb(L, R, sr, o.reverb !== undefined ? o.reverb : 0.28);
  // 音层（可选）：疗愈频率 + 自然音层，垫在混响之后、动态处理之前。
  // 默认不传即不开启，五声本体不受影响；全部关闭时与纯净渲染逐位一致。
  if (o.ambient) {
    applyAmbient(L, R, sr, o.ambient);
  } else if (o.solfeggio) {
    applySolfeggio(L, R, sr, o.solfeggio, o.solfeggioLevel !== undefined ? o.solfeggioLevel : 0.05);
  }
  compress(L, R, sr);
  const peak = normalize(L, R, o.targetPeak !== undefined ? o.targetPeak : 0.92);

  return {
    left: L,
    right: R,
    sampleRate: sr,
    // 实际渲染长度（含混响尾音的余量），与样本数严格一致
    duration: len / sr,
    length: len,
    peak
  };
}

/**
 * PCM → WAV（16-bit PCM 立体声）
 * 浏览器可用 Blob 包装，小程序可写入用户目录，Node 可直接落盘
 * @param {object} pcm renderScore 的输出
 * @returns {ArrayBuffer}
 */
function encodeWav(pcm) {
  const { left, right, sampleRate } = pcm;
  const numCh = 2;
  const len = left.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < len; i++) {
    let sl = Math.max(-1, Math.min(1, left[i]));
    let sr2 = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(off, sl < 0 ? sl * 0x8000 : sl * 0x7fff, true);
    off += 2;
    view.setInt16(off, sr2 < 0 ? sr2 * 0x8000 : sr2 * 0x7fff, true);
    off += 2;
  }
  return ab;
}

/** 一步到位：音符表 → WAV ArrayBuffer */
function scoreToWav(score, opts) {
  return encodeWav(renderScore(score, opts));
}

/**
 * 音频指纹：用于校验 64 卦生成结果的唯一性与可复现性
 * @param {object} pcm renderScore 的输出
 * @returns {string}
 */
function audioFingerprint(pcm) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const step = Math.max(1, Math.floor(pcm.length / 4096));
  for (let i = 0; i < pcm.length; i += step) {
    const v = Math.round(pcm.left[i] * 32767) | 0;
    h1 = Math.imul(h1 ^ (v & 0xff), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((v >> 8) & 0xff), 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/* 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SR, DEFAULT_TIMBRE, VOICE_SPECS, AUX_SPECS,
    mulberry32, midiToFreq, panGains, SVF, Comb, AllPass, Mixer,
    renderScore, encodeWav, scoreToWav, audioFingerprint,
    SOLFEGGIO_FREQS, SOLFEGGIO_LABELS, SOLFEGGIO_INTROS,
    solfeggioForHex, applySolfeggio,
    NATURE_LAYERS, applyNatureLayer, applyAmbient
  };
} else {
  window.ICRender = {
    DEFAULT_SR, DEFAULT_TIMBRE, VOICE_SPECS, AUX_SPECS,
    mulberry32, midiToFreq, panGains, SVF, Comb, AllPass, Mixer,
    renderScore, encodeWav, scoreToWav, audioFingerprint,
    SOLFEGGIO_FREQS, SOLFEGGIO_LABELS, SOLFEGGIO_INTROS,
    solfeggioForHex, applySolfeggio,
    NATURE_LAYERS, applyNatureLayer, applyAmbient
  };
}

})();
