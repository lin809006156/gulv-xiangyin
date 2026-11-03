/**
 * 音层校验：自然音层与疗愈频率是否「真的听得见」，且两端一致
 * ---------------------------------------------------------------
 * 用户曾反馈「音层功能好像没用」。实测证实：五层单独开启时，特征频段提升
 * 只有 −0.5 ~ +0.6dB —— 相当于点了没反应。原因是 NATURE_LAYERS.level 只表达
 * 「该层相对自身基准的强弱」，各层内部实现的输出幅度差得很远（溪流的带通
 * 状态量只有雨的三分之一），缺一层统一的响度校准。
 *
 * 本脚本按**入耳后的实际响度**验收，而不是只看增益是否非零：
 *   · 单层：层自身 RMS 应为主体音乐的 15%–35%（约 −16 ~ −9dB）
 *     —— 低于 15% 像没开，高于 35% 会盖过五声；
 *   · 层间：五层的相对响度跨度 ≤6dB，避免「有的层开跟没开一样」；
 *   · 全开：合计不超过主体的 65%；
 *   · 总量滑杆归零须彻底静音；
 *   · 网页端实时配方须与离线同源（滤波主特征一致、增益与 NATURE_TRIM 对齐），
 *     否则同名的「雨声」在网页端与小程序/导出会是两种声音。
 *
 * 用法：node scripts/verify-ambient.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const D = require(path.join(ROOT, 'core/data.js'));
const M = require(path.join(ROOT, 'core/music.js'));
const R = require(path.join(ROOT, 'core/render.js'));

let pass = 0, fail = 0;
function ok(msg) { pass++; console.log('  [v] ' + msg); }
function err(msg) { fail++; console.log('  [X] ' + msg); }
function assert(cond, msg) { cond ? ok(msg) : err(msg); }

const SR = 44100;
const LAYERS = R.NATURE_LAYERS;
const NAMES = {};
LAYERS.forEach((l) => { NAMES[l.key] = l.name; });

function rms(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}
/** 音层分量：开层与纯净渲染之差（扣除归一化对整体的缩放影响） */
function ambComponent(plain, withAmb) {
  let s = 0;
  for (let i = 0; i < plain.left.length; i++) {
    const d = withAmb.left[i] - plain.left[i];
    s += d * d;
  }
  return Math.sqrt(s / plain.left.length);
}

const hex = D.getHexagram(11);
const cfg = D.deriveMusicConfig(hex);
const score = M.composeNotes(hex, cfg, null);

/* ---------- 1. 单层可闻且不喧宾夺主 ---------- */
console.log('\n=== 1. 单层音层的实际响度 ===');
const plain = R.renderScore(score, {
  sampleRate: SR, reverb: 0,
  ambient: { solfeggio: null, nature: {}, level: 1 }
});
const mainRms = rms(plain.left);
console.log('  主体（无音层）RMS ' + mainRms.toFixed(4));

const levels = {};
LAYERS.forEach((l) => {
  const one = R.renderScore(score, {
    sampleRate: SR, reverb: 0,
    ambient: { solfeggio: null, nature: { [l.key]: true }, level: 1 }
  });
  const ratio = ambComponent(plain, one) / mainRms;
  levels[l.key] = ratio;
  const db = 20 * Math.log10(ratio);
  const flag = ratio < 0.15 ? '  ← 太轻，像没开' : (ratio > 0.35 ? '  ← 盖过五声' : '');
  console.log('  ' + l.name.padEnd(6) + (ratio * 100).toFixed(0).padStart(5) + '%   '
    + db.toFixed(1).padStart(6) + 'dB' + flag);
});
LAYERS.forEach((l) => {
  assert(levels[l.key] >= 0.15 && levels[l.key] <= 0.35,
    l.name + ' 单开占主体 ' + (levels[l.key] * 100).toFixed(0) + '%（应在 15%–35%）');
});

/* ---------- 2. 层间响度均衡 ---------- */
console.log('\n=== 2. 层间响度均衡 ===');
{
  const dbs = LAYERS.map((l) => 20 * Math.log10(levels[l.key]));
  const spread = Math.max.apply(null, dbs) - Math.min.apply(null, dbs);
  assert(spread <= 6,
    '五层响度跨度 ' + spread.toFixed(1) + 'dB（≤6dB —— 不会有的层开了像没开）');
}

/* ---------- 3. 五层全开仍不掩五声 ---------- */
console.log('\n=== 3. 五层全开 ===');
{
  const allNature = {};
  LAYERS.forEach((l) => { allNature[l.key] = true; });
  const all = R.renderScore(score, {
    sampleRate: SR, reverb: 0,
    ambient: { solfeggio: null, nature: allNature, level: 1 }
  });
  const ratio = ambComponent(plain, all) / mainRms;
  assert(ratio <= 0.65,
    '五层全开合计占主体 ' + (ratio * 100).toFixed(0) + '%（≤65%，五声仍居主导）');
}

/* ---------- 4. 总量滑杆与关闭 ---------- */
console.log('\n=== 4. 总量滑杆 ===');
{
  const allNature = {};
  LAYERS.forEach((l) => { allNature[l.key] = true; });
  const half = R.renderScore(score, {
    sampleRate: SR, reverb: 0,
    ambient: { solfeggio: null, nature: allNature, level: 0.5 }
  });
  const zero = R.renderScore(score, {
    sampleRate: SR, reverb: 0,
    ambient: { solfeggio: null, nature: allNature, level: 0 }
  });
  const rHalf = ambComponent(plain, half) / mainRms;
  const rZero = ambComponent(plain, zero) / mainRms;
  const rFull = ambComponent(plain, R.renderScore(score, {
    sampleRate: SR, reverb: 0,
    ambient: { solfeggio: null, nature: allNature, level: 1 }
  })) / mainRms;
  assert(Math.abs(rHalf / rFull - 0.5) < 0.06,
    '总量 50% 时音层能量约减半（' + (rFull * 100).toFixed(0) + '% → ' + (rHalf * 100).toFixed(0) + '%）');
  assert(rZero < 0.005,
    '总量归零即静音（残差 ' + (rZero * 100).toFixed(2) + '%）');
}

/* ---------- 5. 疗愈频率 ---------- */
console.log('\n=== 5. 疗愈频率 ===');
{
  const sol = R.renderScore(score, {
    sampleRate: SR, reverb: 0,
    ambient: { solfeggio: { freq: 528, level: 0.05 }, nature: {}, level: 1 }
  });
  const ratio = ambComponent(plain, sol) / mainRms;
  assert(ratio > 0.001, '疗愈 528Hz 可测到能量（占主体 ' + (ratio * 100).toFixed(1) + '%）');
  // 528Hz 附近应有明显谱峰
  function energyAt(x, f) {
    const c = 2 * Math.cos(2 * Math.PI * f / SR);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < x.length; i++) {
      const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0;
    }
    return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / x.length;
  }
  const at528 = energyAt(sol.left, 528) / (energyAt(plain.left, 528) + 1e-9);
  assert(at528 > 3, '528Hz 处谱峰显著（为无音层时的 ' + at528.toFixed(1) + ' 倍）');
}

/* ---------- 6. 网页端实时配方与离线同源 ---------- */
console.log('\n=== 6. 网页端实时配方与离线一致 ===');
{
  const backendSrc = fs.readFileSync(path.join(ROOT, 'web/js/audio-backend-web.js'), 'utf8');
  const renderSrc = fs.readFileSync(path.join(ROOT, 'core/render.js'), 'utf8');

  /* 增益：实时端用的是 OfflineAudioContext 实测校准值，不是简单的 TRIM/2.6 ——
     同样的 TRIM 下，实时滤波器（BiquadFilter 级联 + 白噪循环）与离线实现
     （一阶低通 + 随机事件）实际出来的能量并不相等。故此处只校验
     ① 与离线 TRIM 同阶（数量级不能差一个量级，否则明显是忘了同步）
     ② 落在合理区间（0.2–2.5）。
     精确对齐需浏览器实测：.tmp-amb-web.js 的做法（OfflineAudioContext 逐层渲染比对）。
     实测记录（44.1kHz）：实时 / 离线 的 RMS 偏差 ≤1.1dB。 */
  const trimMatch = renderSrc.match(/const NATURE_TRIM = \{([\s\S]*?)\};/);
  const gainMatch = backendSrc.match(/const LIVE_NATURE_RECIPES = \{([\s\S]*?)\n\};/);
  if (!trimMatch || !gainMatch) {
    err('未能解析 NATURE_TRIM 或 LIVE_NATURE_RECIPES');
  } else {
    const trims = {};
    trimMatch[1].replace(/(\w+):\s*([\d.]+)/g, (m, k, v) => { trims[k] = parseFloat(v); });
    const gains = {};
    gainMatch[1].replace(/(\w+):\s*\{[^}]*?gain:\s*([\d.]+)/g, (m, k, v) => { gains[k] = parseFloat(v); });
    const keys = Object.keys(trims);
    const listed = [];
    let bad = 0;
    keys.forEach((k) => {
      const g = gains[k];
      const t = trims[k];
      if (g === undefined || g < 0.2 || g > 2.5) { bad++; return; }
      // 与离线同阶：实时增益不应比 TRIM 小一个量级、或反超 TRIM 三倍以上
      // 实测比值散布在 0.37–0.68（各层滤波器结构不同），故下限放到 1/8
      if (g < t / 8 || g > t * 3) { bad++; return; }
      listed.push(k + ' ' + g.toFixed(2));
    });
    assert(!bad,
      bad
        ? '网页端实时增益与离线脱节（' + bad + ' 层不在合理区间）：'
          + keys.map((k) => k + ' trim=' + trims[k] + ' gain=' + gains[k]).join('；')
        : '网页端实时增益与离线同阶（' + listed.join(' / ') + '）');
  }

  // 滤波主特征须与离线一致：雨为低通（离线 1100Hz 一阶低通），不可是高通
  const rainLine = (backendSrc.match(/rain:\s*\{[^}]*\}/) || [''])[0];
  assert(rainLine.indexOf('lowpass') >= 0 && rainLine.indexOf('highpass') < 0,
    '「雨声」实时配方为低通雨体（与离线一致；曾误用 highpass 变成高频沙沙声）');
  const fireLine = (backendSrc.match(/fire:\s*\{[^}]*\}/) || [''])[0];
  assert(fireLine.indexOf('lowpass') >= 0, '「篝火」实时配方为低通（与离线一致）');
}

/* ---------- 汇总 ---------- */
console.log('\n' + '='.repeat(46));
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('='.repeat(46));
process.exit(fail ? 1 : 0);
