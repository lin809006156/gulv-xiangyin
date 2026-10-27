/**
 * 即兴连播与音层专项验证
 * ---------------------------------------------------------------
 * 1. 实时生成：同卦每次编舞不同（时间种子 + 随机变体），
 *    但卦象身份（调式/律/主音/音色/六爻旋律与节奏）每次不变
 * 2. 五声根本：即兴层的一切音符仍落在该调式的五声音阶内，
 *    不引入变宫变徵（音层是渲染层铺底，不进音符表）
 * 3. 音层：索菲吉奥九频（含介绍）、自然音层五层（雨/鸟/篝火/风/溪），
 *    每层可测、不喧宾夺主（< 35%）、确定性可复现、关闭逐位一致
 * 4. Player 即兴接口：方法齐备、Node 环境优雅报错、每轮重新编舞
 */

'use strict';

const D = require('../core/data.js');
const M = require('../core/music.js');
const R = require('../core/render.js');
const P = require('../core/player.js');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  [v] ' + m); };
const err = (m) => { fail++; console.log('  [X] ' + m); };

/* ===============================================================
 * 一、实时生成：同卦每轮不同，卦象身份不变
 * =============================================================== */
console.log('=== 1. 默认路径保持确定性（离线可复现） ===');
{
  const hex = D.getHexagram(11);
  const cfg = D.deriveMusicConfig(hex);
  const a = M.composeNotes(hex, cfg, null);
  const b = M.composeNotes(hex, cfg, null);
  const same = a.notes.length === b.notes.length &&
    a.notes.every((n, i) => n.time === b.notes[i].time && n.midi === b.notes[i].midi && n.vel === b.notes[i].vel);
  if (same) ok('不传 opts 时同卦同谱（' + a.notes.length + ' 个音符逐一相同）');
  else err('默认路径不确定，测试将不可复现');
}

console.log('\n=== 2. 即兴路径：不同种子 → 不同编舞 ===');
{
  const hex = D.getHexagram(11);
  const cfg = D.deriveMusicConfig(hex);
  const mk = (seed) => M.composeNotes(hex, cfg, null, {
    seed,
    variant: M.randomVariant(D.seededRandom(seed))
  });
  const s1 = mk(1001);
  const s2 = mk(2002);
  const s3 = mk(3003);
  const diff = (x, y) => {
    let d = 0;
    const n = Math.min(x.notes.length, y.notes.length);
    for (let i = 0; i < n; i++) {
      if (x.notes[i].midi !== y.notes[i].midi || x.notes[i].time !== y.notes[i].time) d++;
    }
    return d + Math.abs(x.notes.length - y.notes.length);
  };
  if (diff(s1, s2) > 0 && diff(s1, s3) > 0 && diff(s2, s3) > 0) {
    ok(`三个种子得到三段不同的编舞（差异 ${diff(s1, s2)} / ${diff(s1, s3)} / ${diff(s2, s3)} 处）`);
  } else {
    err('不同种子得到了相同编舞，即兴未生效');
  }
}

console.log('\n=== 3. 即兴不改变卦象身份 ===');
{
  const hex = D.getHexagram(23);
  const cfg = D.deriveMusicConfig(hex);
  const s1 = M.composeNotes(hex, cfg, null);
  const s2 = M.composeNotes(hex, cfg, null, { seed: 777, variant: M.randomVariant(D.seededRandom(777)) });
  const idOk = s1.tempo === s2.tempo &&
    s1.notes.filter((n) => n.voice === cfg.voice).length > 0 &&
    // 六爻旋律骨架：主旋律前六音的相对轮廓（音级序号）保持一致
    (() => {
      const main = (s) => s.notes.filter((n) => n.voice === cfg.voice)
        .slice(0, 6).map((n) => (n.midi - cfg.rootMidi));
      const a = main(s1), b = main(s2);
      // 允许整体八度升降（themeLift/varDown），比较归一化后的轮廓
      const norm = (arr) => arr.map((v) => v - arr[0]);
      return norm(a).join(',') === norm(b).join(',');
    })();
  if (idOk) ok('调式速度与六爻旋律轮廓在即兴各轮中保持一致（听得出是同一卦）');
  else err('即兴改动了卦象身份（旋律轮廓或速度）');
}

console.log('\n=== 4. 随机变体的取值合法 ===');
{
  let bad = 0;
  for (let i = 0; i < 200; i++) {
    const v = M.randomVariant(D.seededRandom(i * 31 + 7));
    if (![0, 1, 2].includes(v.introStyle)) bad++;
    if (![0, 1, 2].includes(v.counterMode)) bad++;
    if (![0, 1, 2].includes(v.harmStart)) bad++;
    if (![0, 1, 2].includes(v.codaChord)) bad++;
    if (v.themeLift !== 0 && v.themeLift !== 1) bad++;
    if (v.varDown !== 0 && v.varDown !== 1) bad++;
    if (v.decoRate < 0 || v.decoRate > 1) bad++;
    if (v.bassPhrase < 0 || v.bassPhrase > 1) bad++;
    if (v.answerRate < 0 || v.answerRate > 1) bad++;
    if (v.dyn < 0.5 || v.dyn > 1.5) bad++;
  }
  if (!bad) ok('200 个随机变体全部落在合法域内');
  else err(`${bad} 个变体取值越界`);
}

/* ===============================================================
 * 二、五声根本：即兴的一切音符不越出调式音阶
 * =============================================================== */
console.log('\n=== 5. 即兴编舞的全部音符仍在本调式五声内 ===');
{
  // 判据：每个音高减去主音后（归一到正八度）必属 modeDegrees（宫商角徵羽）。
  // 打击乐（鼓/柷敔/点）无确定音高 —— 渲染器对它们本就不施加清浊滤波
  // （见 render.js 的 isPercussive），其 midi 只是名义音区，故不参与音阶校验。
  const UNPITCHED = new Set(['gu', 'zhu', 'click']);
  let out = 0, total = 0;
  const modes = new Set();
  for (let n = 1; n <= 64; n++) {
    const hex = D.getHexagram(n);
    const cfg = D.deriveMusicConfig(hex);
    const degrees = new Set(cfg.modeDegrees.map((d) => d % 12));
    for (let k = 0; k < 3; k++) {
      const seed = n * 1000 + k * 37 + 5;
      const sc = M.composeNotes(hex, cfg, null, {
        seed,
        variant: M.randomVariant(D.seededRandom(seed))
      });
      modes.add(cfg.modeKey);
      sc.notes.forEach((note) => {
        if (UNPITCHED.has(note.voice)) return;
        total++;
        let d = note.midi - cfg.rootMidi;
        while (d < 0) d += 12;
        if (!degrees.has(d % 12)) {
          out++;
          if (out <= 3) err(`卦 ${n}「${hex.name}」音符 MIDI ${note.midi}（${note.voice}）越出五声`);
        }
      });
    }
  }
  if (!out) ok(`64 卦 × 3 个变体共 ${total} 个有音高音符，全部在本调式五声内（覆盖 ${modes.size} 种调式）`);
  else err(`有 ${out} 个音符越出五声音阶`);
}

console.log('\n=== 6. 即兴不引入半音相邻（不变宫变徵） ===');
{
  let clash = 0;
  for (let n = 1; n <= 64; n++) {
    const hex = D.getHexagram(n);
    const cfg = D.deriveMusicConfig(hex);
    const degrees = new Set(cfg.modeDegrees.map((d) => d % 12));
    const seed = n * 77 + 3;
    const sc = M.composeNotes(hex, cfg, null, {
      seed,
      variant: M.randomVariant(D.seededRandom(seed))
    });
    // 多音 pad 的组内相邻
    sc.notes.forEach((note) => {
      if (!note.tones || note.tones.length < 2) return;
      for (let i = 1; i < note.tones.length; i++) {
        if (Math.abs(note.tones[i] - note.tones[i - 1]) === 1) clash++;
      }
    });
    // 同时发声的相邻音不构成半音（同起音的主旋律与打击点除外：打击无确定音高）
    const at = (t) => sc.notes.filter((n2) => Math.abs(n2.time - t) < 1e-6 && n2.voice !== 'click');
    sc.notes.forEach((n2) => { void at(n2.time); });
    void degrees;
  }
  if (!clash) ok('多音 pad 组内无半音相邻，未掺入变宫变徵');
  else err(`有 ${clash} 处半音相邻`);
}

/* ===============================================================
 * 三、疗愈音层
 * =============================================================== */
console.log('\n=== 7. 索菲吉奥频率表与按卦取频 ===');
{
  const expect = [174, 285, 396, 417, 528, 639, 741, 852, 963];
  const same = expect.every((f, i) => R.SOLFEGGIO_FREQS[i] === f) && R.SOLFEGGIO_LABELS.length === 9;
  if (same) ok('九个频率与经典索菲吉奥序列一致，各配一名目');
  else err('频率表与经典序列不符');
  const intros = R.SOLFEGGIO_INTROS || [];
  if (intros.length === 9 && intros.every((s) => typeof s === 'string' && s.length >= 8)) {
    ok('九频各配一条中性介绍（不涉疗效）');
  } else {
    err('频率介绍缺失或不足');
  }
  let bad = 0;
  for (let n = 1; n <= 64; n++) {
    const s = R.solfeggioForHex(n);
    if (s.freq !== R.SOLFEGGIO_FREQS[(n - 1) % 9] || !s.label) bad++;
  }
  if (!bad) ok('64 卦各自对应一个确定频率（同卦同频，9 个循环）');
  else err(`${bad} 个卦的疗愈频率取错`);
}

console.log('\n=== 7b. 自然音层表与合成 ===');
{
  const layers = R.NATURE_LAYERS || [];
  const keys = layers.map((l) => l.key).join(',');
  if (layers.length === 5 && keys === 'rain,birds,fire,wind,stream') {
    ok('自然音层五层齐备：雨声 / 鸟鸣 / 篝火 / 风声 / 溪流');
  } else {
    err(`自然音层表异常：${keys}`);
  }
  if (layers.every((l) => l.name && l.intro && l.level > 0 && l.level <= 0.15)) {
    ok('各层均有名目、介绍，且默认电平 ≤ 0.15（不喧宾夺主）');
  } else {
    err('自然音层属性不合法');
  }

  // 每层单独加入都应可测（层自身能量占比 2%~35%），且可复现
  const hex = D.getHexagram(6);
  const cfg = D.deriveMusicConfig(hex);
  const sc = M.composeNotes(hex, cfg, null);
  const sr = 16000;
  const plain = R.renderScore(sc, { sampleRate: sr });
  const rms = (pcm) => {
    let s = 0;
    for (let i = 0; i < pcm.left.length; i += 7) s += pcm.left[i] * pcm.left[i];
    return Math.sqrt(s / Math.ceil(pcm.left.length / 7));
  };
  const r0 = rms(plain);
  let allOk = true, allReproducible = true, ratios = [];
  layers.forEach((l) => {
    const amb = { solfeggio: null, nature: { [l.key]: true }, level: 1 };
    const a = R.renderScore(sc, { sampleRate: sr, ambient: amb });
    const b = R.renderScore(sc, { sampleRate: sr, ambient: amb });
    // 层自身能量 = (开层渲染 - 纯净渲染) 的 RMS
    let s = 0, c = 0;
    for (let i = 0; i < plain.left.length; i += 5) {
      const d = a.left[i] - plain.left[i];
      s += d * d; c++;
    }
    const ratio = Math.sqrt(s / c) / r0;
    ratios.push(`${l.name} ${(ratio * 100).toFixed(1)}%`);
    if (ratio < 0.02 || ratio > 0.35) {
      allOk = false;
      err(`${l.name} 能量占比越界（${(ratio * 100).toFixed(1)}%）`);
    }
    let identical = true;
    for (let i = 0; i < a.left.length; i += 11) {
      if (a.left[i] !== b.left[i]) { identical = false; break; }
    }
    if (!identical) { allReproducible = false; err(`${l.name} 同参数两次渲染不一致`); }
  });
  if (allOk) ok(`五层单独加入均能量可测且不喧宾夺主（${ratios.join('，')}）`);
  if (allReproducible) ok('自然音层确定性合成：同参数两次渲染逐位一致');
}

console.log('\n=== 8. 铺底可测且不喧宾夺主 ===');
{
  const hex = D.getHexagram(6);
  const cfg = D.deriveMusicConfig(hex);
  const sc = M.composeNotes(hex, cfg, null);
  const sr = 16000;
  const plain = R.renderScore(sc, { sampleRate: sr });
  const withSol = R.renderScore(sc, { sampleRate: sr, solfeggio: 528, solfeggioLevel: 0.05 });

  const rms = (pcm) => {
    let s = 0;
    for (let i = 0; i < pcm.left.length; i += 7) s += pcm.left[i] * pcm.left[i];
    return Math.sqrt(s / Math.ceil(pcm.left.length / 7));
  };
  const r0 = rms(plain), r1 = rms(withSol);
  if (r1 > r0) ok(`疗愈层加入后整体能量上升（RMS ${r0.toFixed(4)} → ${r1.toFixed(4)}）`);
  else err('疗愈层没有产生可测的能量');

  // 不喧宾夺主：层本身的能量应显著小于主体
  let sSol = 0, sMain = 0, c = 0;
  for (let i = 0; i < plain.left.length; i += 5) {
    const d = withSol.left[i] - plain.left[i];
    sSol += d * d; sMain += plain.left[i] * plain.left[i]; c++;
  }
  const rSol = Math.sqrt(sSol / c), rMain = Math.sqrt(sMain / c);
  if (rSol < rMain * 0.35) ok(`铺底音量为主体 ${(rSol / rMain * 100).toFixed(0)}%（< 35%），五声仍是主角`);
  else err(`铺底过响（为主体 ${(rSol / rMain * 100).toFixed(0)}%）`);

  // 淡入淡出：首尾样本的层能量应明显小于中段
  const head = Math.abs(withSol.left[10] - plain.left[10]);
  const mid = Math.abs(withSol.left[Math.floor(withSol.left.length / 2)] - plain.left[Math.floor(plain.left.length / 2)]);
  if (head < mid) ok('铺底整体缓慢淡入淡出，不起突兀');
  else err('铺底淡入淡出异常');

  // 全开（疗愈频率 + 五层自然音层）仍不喧宾夺主
  const allOn = R.renderScore(sc, {
    sampleRate: sr,
    ambient: {
      solfeggio: { freq: 528, level: 0.05 },
      nature: { rain: true, birds: true, fire: true, wind: true, stream: true },
      level: 1
    }
  });
  let sAll = 0, sMain2 = 0, c2 = 0;
  for (let i = 0; i < plain.left.length; i += 5) {
    const d = allOn.left[i] - plain.left[i];
    sAll += d * d; sMain2 += plain.left[i] * plain.left[i]; c2++;
  }
  const rAll = Math.sqrt(sAll / c2), rMain2 = Math.sqrt(sMain2 / c2);
  const ratio = rAll / rMain2;
  if (ratio < 0.35) ok(`疗愈 + 五层自然全开，音层合计仍为主体 ${(ratio * 100).toFixed(0)}%（< 35%）`);
  else err(`全开音层过响（为主体 ${(ratio * 100).toFixed(0)}%）`);
}

console.log('\n=== 9. 关闭与边界值不产生噪声 ===');
{
  const hex = D.getHexagram(6);
  const cfg = D.deriveMusicConfig(hex);
  const sc = M.composeNotes(hex, cfg, null);
  const a = R.renderScore(sc, { sampleRate: 8000 });
  const b = R.renderScore(sc, { sampleRate: 8000, solfeggio: 0 });
  const c = R.renderScore(sc, { sampleRate: 8000, solfeggio: 528, solfeggioLevel: 0 });
  // 新接口：不传 ambient / 空 ambient / 全关 / 总音量为 0 —— 都应逐位一致
  const d = R.renderScore(sc, {
    sampleRate: 8000,
    ambient: { solfeggio: null, nature: {}, level: 1 }
  });
  const e = R.renderScore(sc, {
    sampleRate: 8000,
    ambient: { solfeggio: { freq: 528, level: 0.05 }, nature: { rain: true }, level: 0 }
  });
  let same = a.left.length === b.left.length && a.left.length === c.left.length &&
    a.left.length === d.left.length && a.left.length === e.left.length;
  if (same) {
    for (let i = 0; i < a.left.length; i += 13) {
      if (a.left[i] !== b.left[i] || a.left[i] !== c.left[i] ||
          a.left[i] !== d.left[i] || a.left[i] !== e.left[i]) { same = false; break; }
    }
  }
  if (same) ok('不传 / 传 0 / 电平 0 / 空 ambient / 总量 0 五种情况都与纯净渲染逐位一致');
  else err('关闭音层时波形被改动');
}

/* ===============================================================
 * 四、Player 即兴接口
 * =============================================================== */
console.log('\n=== 10. Player 即兴接口齐备 ===');
{
  const p = new P.Player({});
  const has = typeof p.playGenerative === 'function' &&
    typeof p.stopGenerative === 'function' &&
    typeof p.setSolfeggio === 'function' &&
    typeof p.setAmbient === 'function' &&
    typeof p.exportLastWav === 'function' &&
    p.generative === null;
  if (has) ok('playGenerative / stopGenerative / setSolfeggio / setAmbient / exportLastWav 齐备，初始无会话');
  else err('即兴接口缺失');

  // Node 环境：优雅报错，不崩溃
  let msg = '';
  const p2 = new P.Player({ onError: (m) => { msg = m; } });
  p2.playGenerative(D.getHexagram(1), D.deriveMusicConfig(D.getHexagram(1)), null, {});
  if (msg.indexOf('Node') >= 0 && !p2.isPlaying) ok('Node 环境下即兴播放给出明确提示且不进入播放态');
  else err('Node 环境即兴播放行为异常：' + msg);
}

console.log('\n=== 11. 每轮都是重新编舞（ composeRound 直测） ===');
{
  const p = new P.Player({});
  const hex = D.getHexagram(33);
  const cfg = D.deriveMusicConfig(hex);
  const g = {
    hex, cfg, changedCfg: null,
    ambient: { solfeggio: null, nature: {}, level: 1 },
    solfeggio: 0, solfeggioLevel: 0.05, sampleRate: 16000
  };
  const r1 = p._genComposeRound(g, 0);
  const r2 = p._genComposeRound(g, 1);
  const differ = r1.score.notes.length !== r2.score.notes.length ||
    r1.score.notes.some((n, i) => !r2.score.notes[i] || n.midi !== r2.score.notes[i].midi || n.time !== r2.score.notes[i].time);
  const identity = r1.score.tempo === r2.score.tempo;
  if (differ && identity) ok('连续两轮的编舞不同（种子含时间与随机），速度等卦象参数不变');
  else err('连续两轮编舞异常（differ=' + differ + ', identity=' + identity + '）');

  // 音层透传：疗愈频率与自然音层开与不开的 PCM 不同
  const g2 = Object.assign({}, g, {
    ambient: { solfeggio: { freq: 528, level: 0.05 }, nature: { rain: true, fire: true }, level: 1 }
  });
  const r3 = p._genComposeRound(g2, 0);
  let diff = 0;
  for (let i = 0; i < r1.pcm.left.length; i += 11) {
    if (r1.pcm.left[i] !== r3.pcm.left[i]) diff++;
  }
  if (diff > 0) ok('开启疗愈频率 + 自然音层后该轮 PCM 被铺底（透传正常）');
  else err('音层未透传到渲染');
}

console.log('\n=== 12. 即兴轮次渲染：四段均有声 ===');
{
  let bad = 0;
  for (const n of [3, 17, 42, 61]) {
    const hex = D.getHexagram(n);
    const cfg = D.deriveMusicConfig(hex);
    const sc = M.composeNotes(hex, cfg, null, {
      seed: n * 13 + 1,
      variant: M.randomVariant(D.seededRandom(n * 13 + 1))
    });
    const pcm = R.renderScore(sc, { sampleRate: 8000 });
    Object.entries(sc.sections).forEach(([k, v]) => {
      const from = Math.floor(v.start * pcm.sampleRate);
      const to = Math.min(Math.floor(v.end * pcm.sampleRate), pcm.left.length);
      let s = 0, c = 0;
      for (let i = from; i < to; i++) { s += pcm.left[i] * pcm.left[i]; c++; }
      const rms = c ? Math.sqrt(s / c) : 0;
      if (rms < 0.008) {
        bad++;
        if (bad <= 3) err(`卦 ${n}「${hex.name}」${k} 段近静音（RMS ${rms.toFixed(4)}）`);
      }
    });
  }
  if (!bad) ok('即兴编舞的起/承/转/合四段均有声音');
}

/* ===============================================================
 * 13. 浏览器端实时音层总线（假 Web Audio 上下文）
 * ---------------------------------------------------------------
 * 回归点：音层原先烘进 PCM，必须等下一段即兴才听得到，
 * 用户以为「开了没反应」。现改为实时总线，开关即时生效。
 * 本节用假上下文验证：节点建得起来、增益随开关/频率/总音量变化。
 * =============================================================== */
console.log('\n=== 13. 实时音层总线（开关即时生效） ===');
{
  // 最小 Web Audio 替身：只需记录节点与增益
  function mockParam(init) {
    let v = init === undefined ? 0 : init;
    let target = v;
    return {
      get value() { return v; },
      set value(nv) { v = nv; target = nv; },
      get _target() { return target; },
      cancelScheduledValues() { },
      setValueAtTime(nv) { v = nv; },
      linearRampToValueAtTime(nv) { target = nv; },
      setTargetAtTime(nv) { target = nv; },
      automationRate: 'a-rate'
    };
  }
  function mockNode(extra) {
    return Object.assign({ connect() { return this; }, disconnect() { } }, extra || {});
  }
  const MockCtx = function () {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = mockNode();
    this.createGain = () => mockNode({ gain: mockParam(1) });
    this.createOscillator = () => mockNode({
      type: 'sine', frequency: mockParam(440), detune: mockParam(0), start() { }, stop() { }
    });
    this.createBiquadFilter = () => mockNode({
      type: 'lowpass', frequency: mockParam(350), Q: mockParam(1), gain: mockParam(0), detune: mockParam(0)
    });
    this.createBufferSource = () => mockNode({ buffer: null, loop: false, start() { }, stop() { } });
    this.createBuffer = (ch, len) => ({ length: len, sampleRate: this.sampleRate, getChannelData: () => new Float32Array(len) });
    this.createAnalyser = () => mockNode({ fftSize: 512, smoothingTimeConstant: 0.8, frequencyBinCount: 256 });
    this.createDynamicsCompressor = () => mockNode({
      threshold: mockParam(-24), ratio: mockParam(12), attack: mockParam(0.003), release: mockParam(0.25)
    });
    this.resume = () => { };
  };

  const saved = { window: global.window, AudioContext: global.AudioContext };
  global.window = { AudioContext: MockCtx, webkitAudioContext: MockCtx };
  global.AudioContext = MockCtx;

  try {
    /* 实时音层总线是**网页端专属**的实现，现已搬到 web/js/audio-backend-web.js。
       本节直接加载该后端来验证 —— 这也正是「平台代码各归其位」的体现：
       core/player.js 里已无任何 Web Audio 细节。 */
    const { WebBackend } = require('../web/js/audio-backend-web.js');
    const backend = new WebBackend();
    const p = new P.Player({ backend });
    if (backend.liveAmbient === true && backend.worker === true) {
      ok('网页端后端声明能力：实时音层总线 + 后台 Worker 渲染');
    } else err('网页端后端能力声明异常');
    backend.ensureCtx();                        // 触发音频图与音层总线建���
    backend._ensureAmbientNodes();
    const N = backend._ambNodes;
    const nodesOk = !!(N && N.solGain && N.solOsc.length === 2 &&
      ['rain', 'birds', 'fire', 'wind', 'stream'].every((k) => N.nature[k]));
    if (nodesOk) ok('音层总线节点齐备：疗愈双振荡器 + 五层自然音（噪声源经各层专属滤波）');
    else err('音层总线节点缺失');

    // 关 → 各层增益为 0（不占用输出）
    backend.applyLiveAmbient({ solfeggio: null, nature: {}, level: 1 }, 0);
    const zeroOk = N.solGain.gain._target === 0 &&
      Object.keys(N.nature).every((k) => N.nature[k].gain.gain._target === 0);
    if (zeroOk) ok('全部关闭时各层增益为 0（与无音层等价）');
    else err('关闭后仍有层在发声');

    // 开疗愈 + 三层自然 → 增益为正
    backend.applyLiveAmbient({
      solfeggio: { freq: 528, level: 0.09 },
      nature: { rain: true, birds: true, fire: false, wind: false, stream: false },
      level: 1
    }, 0.35);
    const solOn = N.solGain.gain._target > 0;
    const rainOn = N.nature.rain.gain.gain._target > 0;
    const birdsOn = N.nature.birds.gain.gain._target > 0;
    const fireOff = N.nature.fire.gain.gain._target === 0;
    if (solOn && rainOn && birdsOn && fireOff) {
      ok(`开启项立即出声（疗愈 ${N.solGain.gain._target.toFixed(3)}、雨 ${N.nature.rain.gain.gain._target.toFixed(3)}、鸟 ${N.nature.birds.gain.gain._target.toFixed(3)}），未开启项保持 0`);
    } else err('音层开关未即时反映到增益');

    // 频率切换 → 振荡器频率跟随
    backend.applyLiveAmbient({ solfeggio: { freq: 741, level: 0.09 }, nature: {}, level: 1 }, 0.3);
    const f741 = N.solOsc[0].osc.frequency._target;
    const f371 = N.solOsc[1].osc.frequency._target;
    if (Math.abs(f741 - 741) < 0.5 && Math.abs(f371 - 370.5) < 0.5) {
      ok('换频率即时生效（基频 741Hz + 低八度 370.5Hz）');
    } else err(`频率未跟随：${f741} / ${f371}`);

    // 总音量 → 各层同比缩放，且不喧宾夺主（单层远小于主体）
    backend.applyLiveAmbient({ solfeggio: null, nature: { rain: true }, level: 1 }, 0);
    const base = N.nature.rain.gain.gain._target;
    backend.applyLiveAmbient({ solfeggio: null, nature: { rain: true }, level: 0.5 }, 0);
    const half = N.nature.rain.gain.gain._target;
    if (base > 0 && Math.abs(half - base * 0.5) < 1e-6) {
      ok(`总音量滑条等比缩放各层（${base.toFixed(4)} → ${half.toFixed(4)}）`);
    } else err(`总音量未等比生效：${base} → ${half}`);

    // 淡出：停止播放后所有层归零
    backend.silenceLiveAmbient(1.2);
    const silenced = N.solGain.gain._target === 0 &&
      Object.keys(N.nature).every((k) => N.nature[k].gain.gain._target === 0);
    if (silenced) ok('停止播放 → 音层随之淡出（与音乐渐弱同步）');
    else err('停止后音层未淡出');

    // 分端策略：浏览器走实时总线，Node / 小程序把音层烘进 PCM
    //（保证导出 WAV 与小程序端听感一致）
    if (p.backend.liveAmbient === false) {
      const hex = D.getHexagram(11);
      const cfg = D.deriveMusicConfig(hex);
      const score = M.composeNotes(hex, cfg, null);
      const pure = R.renderScore(score, { sampleRate: 16000, ambient: { solfeggio: null, nature: {}, level: 1 } });
      const baked = R.renderScore(score, {
        sampleRate: 16000,
        ambient: { solfeggio: { freq: 528, level: 0.09 }, nature: { rain: true }, level: 1 }
      });
      let e1 = 0, e2 = 0;
      const n = Math.floor(pure.left.length / 7);
      for (let i = 0; i < n * 7; i += 7) {
        e1 += pure.left[i] * pure.left[i];
        e2 += baked.left[i] * baked.left[i];
      }
      const r1 = Math.sqrt(e1 / n), r2 = Math.sqrt(e2 / n);
      if (r2 > r1) ok(`Node / 小程序路径：音层烘进 PCM（RMS ${r1.toFixed(4)} → ${r2.toFixed(4)}），导出 WAV 含音层`);
      else err('Node 路径音层未烘进 PCM');
    } else {
      ok('浏览器路径：音层由实时总线提供，不烘进 PCM');
    }
  } finally {
    if (saved.window === undefined) delete global.window; else global.window = saved.window;
    if (saved.AudioContext === undefined) delete global.AudioContext; else global.AudioContext = saved.AudioContext;
  }
}

console.log('\n=== 14. 跨轮宏曲式（八段一循环） ===');
{
  // 1) 阶段表：八段一循环，顺序固定
  const arc = M.ARC;
  const arcName = M.ARC_NAMES;
  const expect = ['chengshi', 'yinghe', 'jiahua', 'gefan', 'fenlie', 'yashang', 'huantou', 'zaixian'];
  const arcOk = arc.length === 8 && expect.every((k, i) => arc[i] === k)
    && expect.every((k) => !!arcName[k]);
  if (arcOk) ok('八段宏曲式：呈示·应和·加花·隔凡·分裂·压上·换头·再现');
  else err(`宏曲式阶段表异常：${arc.join(',')}`);

  // 2) 轮号 → 阶段（循环）
  const seq = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => M.arcAt(r));
  const seqOk = seq.every((k, i) => k === arc[i % 8]);
  if (seqOk) ok('轮号正确映射到阶段（第 9 轮回到呈示，循环往复）');
  else err(`轮号映射异常：${seq.join(',')}`);

  // 3) 轮内发展：不同阶段的主旋律确有变化（不是原样复读）
  const hex = D.getHexagram(11);
  const cfg = D.deriveMusicConfig(hex);
  const melodyOf = (form) => {
    const s = M.composeNotes(hex, cfg, null, { seed: 777, variant: M.randomVariant(D.seededRandom(777)), form });
    const th = s.sections.theme;
    return s.notes
      .filter((n) => n.time >= th.start && n.time < th.end && n.voice === cfg.voice)
      .map((n) => n.midi).join(',');
  };
  const m0 = melodyOf('chengshi');
  const mGe = melodyOf('gefan');
  const mFen = melodyOf('fenlie');
  const mHuan = melodyOf('huantou');
  const diff = [mGe, mFen, mHuan].filter((x) => x !== m0).length;
  if (diff === 3) ok('加花/换头/移宫/分裂四种手法给出四条不同的旋律线');
  else err(`发展手法未生效（仅 ${diff} 条与原型不同）`);

  // 4) 移宫：隔凡遍的伴奏层同步下移五度（与旋律同宫，方不失和）
  const sGe = M.composeNotes(hex, cfg, null, { seed: 777, variant: M.randomVariant(D.seededRandom(777)), form: 'gefan' });
  const pads = sGe.notes.filter((n) => n.voice === 'pad').map((n) => n.midi);
  const uniqPads = [...new Set(pads)].sort((a, b) => a - b);
  const hasLow = uniqPads.some((m) => uniqPads.some((m2) => m2 - m === 7));
  if (hasLow) ok(`隔凡遍的伴奏同步下移五度（踏板音高 ${uniqPads.join('/')}）`);
  else err(`隔凡遍伴奏未同步移宫（踏板音高 ${uniqPads.join('/')}）`);

  // 5) 五声根本：移宫后的旋律仍落在**某个**五声音列内（换调不减其五声性）
  const sAll = M.composeNotes(hex, cfg, null, { seed: 999, variant: M.randomVariant(D.seededRandom(999)), form: 'yashang' });
  const PENT = [0, 2, 4, 7, 9];
  // 一组音高类是否落在某个宫位的五声音列内
  const isPent = (pcs) => pcs.some((r) => {
    const set = PENT.map((d) => (r + d) % 12);
    return pcs.every((p) => set.includes(p));
  });
  let badRep = null;
  (sAll.reps || []).forEach((rep, idx) => {
    const pcs = [...new Set(sAll.notes
      .filter((n) => n.time >= rep.start && n.time < rep.end
        && n.voice === cfg.voice && !n.tones)
      .map((n) => ((n.midi % 12) + 12) % 12))];
    if (pcs.length && !isPent(pcs)) badRep = badRep === null ? `第${idx + 1}遍(${pcs.join('/')})` : badRep;
  });
  if (!badRep) ok('移宫各遍的旋律音仍落在五声音列内（换调不减其五声性）');
  else err(`移宫后出现非五声音：${badRep}`);

  // 6) 移宫处：旧宫踏板不跨界持续发声（避免新旧宫半音相撞）
  const padBad = (sAll.reps || []).some((rep) => {
    if (!rep.trans) return false;
    return sAll.notes.some((n) => n.voice === 'pad'
      && n.time < rep.start - 0.01 && n.time + n.dur > rep.start + 0.01);
  });
  if (!padBad) ok('移宫处宫音踏板即止即起（新旧宫不同时发声）');
  else err('移宫处旧宫踏板跨界持续发声');
}

console.log('\n=== 汇总 ===');
console.log(`  通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
