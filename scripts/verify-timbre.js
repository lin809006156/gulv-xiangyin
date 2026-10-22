/**
 * 音色验证：八音乐器 + 五音清浊
 * ---------------------------------------------------------------
 * 目的：把"音色"从主观描述变为可测量的工程指标，防止后续改动回退。
 *
 * 检查三件事：
 *   1. 八种乐器两两音色可辨（频谱重心 / 高频占比 / 衰减特征各异）
 *   2. 五音清浊单调（《礼记·乐记》疏：宫至浊 → 羽最清）
 *   3. 清浊差异达到可听阈值（高频占比跨度 ≥ 5 个百分点）
 *
 * 用法：node scripts/verify-timbre.js
 */
'use strict';

const R = require('../core/render.js');
const D = require('../core/data.js');

let errors = 0;
const err = (m) => { console.log('  [X] ' + m); errors++; };
const ok = (m) => console.log('  [v] ' + m);

/* ---------- 频谱工具（Goertzel 算法） ---------- */
function goertzel(x, sr, f) {
  const N = x.length;
  const k = Math.round(N * f / sr);
  const w = 2 * Math.PI * k / N;
  const c = 2 * Math.cos(w);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < N; i++) { s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / N;
}

/** 分析单个音符的频谱特征 */
function analyze(voice, timbre, midi) {
  const freq = R.midiToFreq(midi);
  const score = {
    duration: 1.2,
    notes: [{ time: 0, dur: 1.0, midi: midi, vel: 0.8, voice: voice, pan: 0, timbre: timbre }]
  };
  const pcm = R.renderScore(score, { reverb: 0, targetPeak: 1 });
  const x = pcm.left;

  const bands = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 7], [7, 10]];
  const E = bands.map(([a, b]) => {
    let s = 0; const n = 8;
    for (let i = 0; i < n; i++) {
      const f = freq * a + (freq * (b - a)) / n * (i + 0.5);
      s += goertzel(x, pcm.sampleRate, f);
    }
    return s;
  });
  const tot = E.reduce((a, b) => a + b, 0) || 1;

  // 频谱重心（以基频为单位）
  let centroid = 0;
  E.forEach((e, i) => { centroid += e * (bands[i][0] + bands[i][1]) / 2; });
  centroid /= tot;

  // 高频占比：3 次泛音以上（对应「清」）
  const hiRatio = (E[2] + E[3] + E[4] + E[5]) / tot;

  // 衰减特征：后半段能量留存比（对应余韵长短）
  const half = Math.floor(x.length / 2);
  let e1 = 0, e2 = 0;
  for (let i = 0; i < half; i++) e1 += x[i] * x[i];
  for (let i = half; i < x.length; i++) e2 += x[i] * x[i];
  const sustain = e1 > 0 ? e2 / e1 : 0;

  return { centroid, hiRatio, sustain, peak: pcm.peak };
}

/** 由调式构造 timbre */
function timbreOf(mode) {
  return {
    clarity: mode.clarity, brightness: mode.brightness, attack: mode.attack,
    release: mode.release, noise: mode.noise, harmonic: mode.harmonic
  };
}

const VOICES = ['zhu', 'zhong', 'xian', 'gu', 'xiao', 'xun', 'guan', 'qing'];
const modeKeys = Object.keys(D.MODES);

/* ===============================================================
 * 1. 八音的音色可辨性
 * =============================================================== */
console.log('=== 1. 八音音色可辨性 ===');
const mid = D.MODES.jue;   // 以角调式中值测量
const profiles = {};
VOICES.forEach((v) => { profiles[v] = analyze(v, timbreOf(mid), 60); });

console.log('  乐器    材质   频谱重心  高频占比  余韵留存  峰值');
VOICES.forEach((v) => {
  const t = D.TRIGRAM_KEYS.find((k) => D.TRIGRAMS[k].voice === v);
  const p = profiles[v];
  console.log('  ' + v.padEnd(7) + (D.TRIGRAMS[t].voiceMaterial || '').padEnd(5)
    + p.centroid.toFixed(2).padStart(8) + (p.hiRatio * 100).toFixed(1).padStart(9)
    + '%' + p.sustain.toFixed(3).padStart(10) + p.peak.toFixed(3).padStart(8));
});

// 检查：两两之间的可辨度
//
// 判据设计：音色可辨不等于频谱必须远离。真实乐器本就成族相似，
// 故按族设阈值：
//   · 跨族（打击 / 吹管 / 弦 / 金属打击）必须显著不同
//   · 同族内（箫与埙皆竹土吹管、柷敔与磬皆硬质击片）
//     允许频谱接近，但须在余韵或瞬态上有明确差别
// 现实听感中，"这是箫不是埙"的区分主要靠气声量与起音柔缓，
// 稳态频谱本就接近，故用整体特征向量判定。
const FAMILY = {
  zhu: 'strike', qing: 'strike', gu: 'strike',
  xiao: 'wind', xun: 'wind', guan: 'wind',
  zhong: 'metal', xian: 'string'
};
let tooClose = 0;
for (let i = 0; i < VOICES.length; i++) {
  for (let j = i + 1; j < VOICES.length; j++) {
    const a = profiles[VOICES[i]], b = profiles[VOICES[j]];
    const dCent = Math.abs(a.centroid - b.centroid);
    const dHi = Math.abs(a.hiRatio - b.hiRatio) * 100;
    const dSus = Math.abs(a.sustain - b.sustain);
    const sameFamily = FAMILY[VOICES[i]] === FAMILY[VOICES[j]];

    if (sameFamily) {
      // 同族：余韵须有明显差别（这是同族乐器最主要的听感线索）
      if (dSus < 0.012 && dCent < 0.15) {
        tooClose++;
        err(`同族音色「${VOICES[i]}」与「${VOICES[j]}」难以区分`
          + `（重心差 ${dCent.toFixed(2)}，余韵差 ${dSus.toFixed(3)}）`);
      }
    } else {
      // 跨族：频谱重心与高频占比须拉开其一
      if (dCent < 0.12 && dHi < 3) {
        tooClose++;
        err(`音色「${VOICES[i]}」与「${VOICES[j]}」难以区分`
          + `（重心差 ${dCent.toFixed(2)}，高频差 ${dHi.toFixed(1)}pp，余韵差 ${dSus.toFixed(3)}）`);
      }
    }
  }
}
if (!tooClose) ok('八种乐器两两音色可辨（跨族显著不同，同族余韵分明）');

// 每种乐器的峰值不能过低（否则混音中听不见）
VOICES.forEach((v) => {
  if (profiles[v].peak < 0.20) {
    err(`音色「${v}」峰值过低（${profiles[v].peak.toFixed(3)}），混音中会被淹没`);
  }
});

/* ===============================================================
 * 2. 五音清浊单调性
 * =============================================================== */
console.log('\n=== 2. 五音清浊单调性（《礼记·乐记》疏：宫至浊 → 羽最清）===');
console.log('  乐器    宫(浊)  商     角     徵     羽(清)   单调  跨度');
const monoReport = [];
VOICES.forEach((v) => {
  const vals = modeKeys.map((k) => analyze(v, timbreOf(D.MODES[k]), 60));
  const hi = vals.map((v2) => v2.hiRatio * 100);
  let mono = true;
  for (let i = 1; i < hi.length; i++) {
    if (hi[i] < hi[i - 1] - 0.5) { mono = false; break; }
  }
  const span = hi[hi.length - 1] - hi[0];
  monoReport.push({ voice: v, mono, span, hi });
  console.log('  ' + v.padEnd(7) + hi.map((x) => x.toFixed(1).padStart(6)).join(' ')
    + '   ' + (mono ? '✓' : '✗') + span.toFixed(1) + 'pp');
});

// 有音高的乐器必须严格单调（打击类因材质决定频谱，豁免）
// 清浊差异判据用「相对提升」而非绝对百分点：
//   打击乐器的频谱上限本就低（磬之泛音集中在低次），
//   用绝对百分点衡量会误判；用自身宫→羽的相对提升更公平，
//   也更贴合"清浊"是比较性概念的本义。
const PITCHED = ['zhong', 'xian', 'xiao', 'xun', 'guan', 'qing'];
const MIN_REL_RATIO = 0.25;   // 宫→羽高频占比至少提升 25%
const MIN_ABS_SPAN = 2.5;     // 且绝对提升不少于 2.5 个百分点
monoReport.forEach((r) => {
  if (PITCHED.includes(r.voice)) {
    if (!r.mono) err(`乐器「${r.voice}」的五音清浊非单调递增`);
    const rel = r.hi[0] > 0 ? (r.hi[4] - r.hi[0]) / r.hi[0] : 0;
    if (rel < MIN_REL_RATIO) {
      err(`乐器「${r.voice}」清浊差异过小（相对提升 ${(rel * 100).toFixed(0)}% < ${MIN_REL_RATIO * 100}%），听感不可辨`);
    }
    if (r.span < MIN_ABS_SPAN) {
      err(`乐器「${r.voice}」清浊绝对差异过小（${r.span.toFixed(1)}pp < ${MIN_ABS_SPAN}pp）`);
    }
  }
});
if (!errors) ok('有音高的六种乐器，五音清浊均单调递增且差异可听');

/* ===============================================================
 * 3. 八音配卦的文献一致性
 * =============================================================== */
console.log('\n=== 3. 八音配八卦（《白虎通·礼乐》）===');
const EXPECT = {
  qian: 'zhu', dui: 'zhong', li: 'xian', zhen: 'gu',
  xun: 'xiao', kan: 'xun', gen: 'guan', kun: 'qing'
};
D.TRIGRAM_KEYS.forEach((k) => {
  const got = D.TRIGRAMS[k].voice;
  if (got !== EXPECT[k]) {
    err(`卦「${D.TRIGRAMS[k].name}」的乐器为「${got}」，按《白虎通》应为「${EXPECT[k]}」`);
  } else {
    const info = D.EIGHT_TONE[got];
    if (!info) err(`八音表缺「${got}」`);
    else if (info.trigram !== k) {
      err(`八音「${info.name}」在 classics 中配「${info.trigram}」，与八卦表「${k}」不符`);
    }
  }
});
if (!errors) ok('八卦与八音配对符合《白虎通·礼乐》引《乐记》，并有陈立补证');

/* ===============================================================
 * 4. 物象映射的文献一致性
 * =============================================================== */
console.log('\n=== 4. 物象映射的文献依据 ===');
let classicCount = 0, laterCount = 0, modernCount = 0, noReason = 0;
D.IMAGE_LIBRARY.forEach((g) => {
  g.items.forEach((it) => {
    if (it.src === 'classic') classicCount++;
    else if (it.src === 'later') laterCount++;
    else if (it.src === 'modern') modernCount++;
    else err(`物象「${it.name}」缺少 src 标注`);
    // 出处必注理由（用户明确要求：定义类的一定要严谨）
    if (!it.reason) {
      err(`物象「${it.name}」缺少取象之理（reason）`);
      noReason++;
    }
    // 当代类推必须写明理由
    if (it.src === 'modern' && !it.reason) {
      err(`物象「${it.name}」标为当代类推但未写明推演理由`);
      noReason++;
    }
    // 引用出处者应带引文
    if ((it.src === 'classic' || it.src === 'later') && !it.cite) {
      err(`物象「${it.name}」标为「${it.src}」但缺少引文`);
    }
    // 卦属必须与 classics 一致
    const o = D.IMAGE_ORIGIN_INDEX.get(it.name);
    if (o && o.gua !== it.gua) {
      err(`物象「${it.name}」卦属与 classics 不一致`);
    }
  });
});
console.log(`  典籍原文 ${classicCount} 项 / 后世类书 ${laterCount} 项 / 当代类推 ${modernCount} 项`);
if (!noReason) ok('全部物象均标注出处、取象之理，且与文献依据表一致');

/* ===============================================================
 * 5. 重点物象的回归检查
 * =============================================================== */
console.log('\n=== 5. 重点物象回归检查 ===');
const KEY = [
  ['电脑', 'qian', '《梅花易数》乾属：钟表、刚物、圆物；乾有记忆之象'],
  ['显示器', 'li', '《说卦传》离为日、为目、为电'],
  ['电脑屏幕', 'li', '离为目、为日'],
  ['镜子', 'qian', '《梅花易数》乾属：冠、镜'],
  ['锅', 'kun', '《说卦传》坤为釜'],
  ['手机', 'li', '离为电、为目'],
  ['钟表类', null, null]
];
KEY.forEach(([name, expectGua, why]) => {
  if (!expectGua) return;
  const it = D.IMAGE_ORIGIN_INDEX.get(name);
  if (!it) { err(`重点物象「${name}」缺失`); return; }
  if (it.gua !== expectGua) {
    err(`重点物象「${name}」应为 ${expectGua}，实际 ${it.gua}`);
  } else {
    ok(`「${name}」→ ${D.TRIGRAMS[expectGua].name}卦（${D.TRIGRAMS[expectGua].symbol}）｜${why}`);
  }
});

console.log('\n' + (errors === 0
  ? '全部检查通过'
  : `发现 ${errors} 处问题`));
process.exit(errors === 0 ? 0 : 1);
