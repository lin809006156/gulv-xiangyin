/**
 * 卦象心音 · 渲染器专项验证
 * ---------------------------------------------------------------
 * 校验纯 JS 渲染器的正确性：
 *   1. 64 卦渲染不抛异常
 *   2. 音频指纹唯一（64 卦各不相同）
 *   3. 同参数必得同波形（可复现）
 *   4. 波形无 NaN / 无削波
 *   5. WAV 文件头合法、长度正确
 *   6. 立体声左右声道确有差异（声像生效）
 *   7. 混响产生空间感（与无混响版本有差异）
 */
'use strict';

const D = require('../core/data.js');
const M = require('../core/music.js');
const R = require('../core/render.js');

let errors = 0;
const err = (m) => { console.log('  [X] ' + m); errors++; };
const ok = (m) => console.log('  [v] ' + m);

console.log('\n=== 1. 64 卦渲染 ===');
const fps = new Map();
let maxDur = 0, minDur = Infinity;
let totalMs = 0;

for (let n = 1; n <= 64; n++) {
  const hex = D.getHexagram(n);
  const cfg = D.deriveMusicConfig(hex);
  const score = M.composeNotes(hex, cfg, null);
  const t0 = Date.now();
  let pcm;
  try {
    pcm = R.renderScore(score, { sampleRate: 44100 });
  } catch (e) {
    err(`第 ${n} 卦（${hex.name}）渲染抛异常：${e.message}`);
    continue;
  }
  totalMs += Date.now() - t0;
  const fp = R.audioFingerprint(pcm);
  if (fps.has(fp)) {
    err(`第 ${n} 卦与第 ${fps.get(fp)} 卦音频相同（${hex.name}）`);
  } else {
    fps.set(fp, n);
  }
  maxDur = Math.max(maxDur, score.duration);
  minDur = Math.min(minDur, score.duration);
}
ok(`64 卦渲染完成，音频指纹唯一 ${fps.size}/64`);
ok(`时长区间 ${minDur.toFixed(1)}s ~ ${maxDur.toFixed(1)}s，平均 ${(totalMs / 64).toFixed(0)}ms/卦`);

console.log('\n=== 2. 可复现性 ===');
{
  const hex = D.getHexagram(1);
  const cfg = D.deriveMusicConfig(hex);
  const score = M.composeNotes(hex, cfg, null);
  const a = R.audioFingerprint(R.renderScore(score, { sampleRate: 44100 }));
  const b = R.audioFingerprint(R.renderScore(score, { sampleRate: 44100 }));
  a === b ? ok('同参数两次渲染波形完全一致') : err('同参数渲染结果不一致');
}

console.log('\n=== 3. 波形健康度 ===');
{
  const hex = D.getHexagram(29);   // 坎为水，低沉厚重
  const cfg = D.deriveMusicConfig(hex);
  const pcm = R.renderScore(M.composeNotes(hex, cfg, null), { sampleRate: 44100 });

  let nan = 0, clipped = 0, maxAbs = 0;
  for (let i = 0; i < pcm.left.length; i++) {
    const l = pcm.left[i], r = pcm.right[i];
    if (!isFinite(l) || !isFinite(r)) { nan++; continue; }
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > maxAbs) maxAbs = a;
    if (a >= 0.999) clipped++;
  }
  nan === 0 ? ok('无 NaN / Infinity 样本') : err(`存在 ${nan} 个非法样本`);
  ok(`峰值 ${maxAbs.toFixed(4)}（<1.0 未削波）`);
  ok(`削波样本 ${clipped} 个（归一化后应为 0）`);
  if (maxAbs > 0.999) err('峰值越界，存在削波');
}

console.log('\n=== 4. 立体声差异 ===');
{
  const hex = D.getHexagram(1);
  const cfg = D.deriveMusicConfig(hex);
  const pcm = R.renderScore(M.composeNotes(hex, cfg, null), { sampleRate: 44100 });
  let diff = 0, sum = 0;
  for (let i = 0; i < pcm.left.length; i += 7) {
    const d = Math.abs(pcm.left[i] - pcm.right[i]);
    diff += d;
    sum += Math.abs(pcm.left[i]);
  }
  const ratio = sum > 0 ? diff / sum : 0;
  ratio > 0.02
    ? ok(`左右声道存在差异（相对差 ${(ratio * 100).toFixed(1)}%），声像与去相关生效`)
    : err(`左右声道几乎相同（${(ratio * 100).toFixed(2)}%），声像未生效`);
}

console.log('\n=== 5. 混响效果 ===');
{
  const hex = D.getHexagram(1);
  const cfg = D.deriveMusicConfig(hex);
  const score = M.composeNotes(hex, cfg, null);
  const dry = R.renderScore(score, { sampleRate: 44100, reverb: 0 });
  const wet = R.renderScore(score, { sampleRate: 44100, reverb: 0.28 });
  let diff = 0;
  for (let i = 0; i < dry.left.length; i += 5) {
    diff += Math.abs(dry.left[i] - wet.left[i]);
  }
  diff > 0.01
    ? ok('混响开启后波形改变，混响链路生效')
    : err('混响未产生任何影响');
}

console.log('\n=== 6. WAV 编码 ===');
{
  const hex = D.getHexagram(1);
  const cfg = D.deriveMusicConfig(hex);
  const score = M.composeNotes(hex, cfg, null);
  const pcm = R.renderScore(score, { sampleRate: 44100 });
  const wav = R.encodeWav(pcm);

  const dv = new DataView(wav);
  const str = (off, len) => Array.from({ length: len }, (_, i) =>
    String.fromCharCode(dv.getUint8(off + i))).join('');

  str(0, 4) === 'RIFF' ? ok('RIFF 头正确') : err('RIFF 头错误');
  str(8, 4) === 'WAVE' ? ok('WAVE 标识正确') : err('WAVE 标识错误');
  str(12, 4) === 'fmt ' ? ok('fmt 块正确') : err('fmt 块错误');
  str(36, 4) === 'data' ? ok('data 块正确') : err('data 块错误');

  const channels = dv.getUint16(22, true);
  const rate = dv.getUint32(24, true);
  const bits = dv.getUint16(34, true);
  const dataSize = dv.getUint32(40, true);
  // data 块声明长度 = 样本数 × 声道数 × 每样本字节数（不含 44 字节文件头）
  const expectSize = pcm.length * channels * (bits / 8);

  channels === 2 ? ok('立体声') : err(`声道数错误：${channels}`);
  rate === 44100 ? ok('采样率 44100 Hz') : err(`采样率错误：${rate}`);
  bits === 16 ? ok('16 bit 位深') : err(`位深错误：${bits}`);
  dataSize === expectSize ? ok(`数据块长度正确（${(dataSize / 1024 / 1024).toFixed(2)} MB）`)
    : err(`数据块长度错误：${dataSize} ≠ ${expectSize}`);

  // RIFF 尺寸字段
  const riffSize = dv.getUint32(4, true);
  riffSize === wav.byteLength - 8
    ? ok('RIFF 尺寸字段自洽')
    : err(`RIFF 尺寸错误：${riffSize} ≠ ${wav.byteLength - 8}`);
}

console.log('\n=== 7. 采样率一致性 ===');
{
  const hex = D.getHexagram(1);
  const cfg = D.deriveMusicConfig(hex);
  const score = M.composeNotes(hex, cfg, null);
  const p44 = R.renderScore(score, { sampleRate: 44100 });
  const p22 = R.renderScore(score, { sampleRate: 22050 });
  p44.length > p22.length
    ? ok(`44.1kHz 样本数 ${p44.length} > 22.05kHz ${p22.length}，采样率生效`)
    : err('采样率未生效');
  p22.sampleRate === 22050 ? ok('采样率元数据正确') : err('采样率元数据错误');
}

console.log('\n=== 8. 各音色可渲染 ===');
{
  const hex = D.getHexagram(1);
  const cfg = D.deriveMusicConfig(hex);
  const score = M.composeNotes(hex, cfg, null);
  const voices = new Set(score.notes.map((n) => n.voice));
  let allOk = true;
  voices.forEach((v) => {
    const single = {
      notes: [{ time: 0, dur: 1.0, midi: 60, vel: 0.6, voice: v, pan: 0 }],
      duration: 1.2
    };
    try {
      const p = R.renderScore(single, { sampleRate: 44100 });
      let peak = 0;
      for (let i = 0; i < p.left.length; i++) peak = Math.max(peak, Math.abs(p.left[i]));
      if (!(peak > 0.001)) {
        err(`音色 ${v} 渲染出静音`);
        allOk = false;
      }
    } catch (e) {
      err(`音色 ${v} 渲染抛异常：${e.message}`);
      allOk = false;
    }
  });
  if (allOk) ok(`全部 ${voices.size} 种音色可正常发声：${[...voices].join('、')}`);
}

console.log('\n=== 9. 音符时间偏移不丢音 ===');
{
  // 回归测试：曾因 renderNote 切换到 scratch 缓冲后，
  // voice 函数仍按绝对样本号写入，导致 t>0 的音符全部越界被静默丢弃
  //（表现：只有第一个音能听见，整曲几乎全静音）。
  // 此处逐个时间点验证每个音都真实发声。
  const sr = 22050;
  const voices = ['zhu', 'zhong', 'xian', 'gu', 'xiao', 'xun', 'guan', 'qing', 'pad', 'click'];
  let allOk = true;
  voices.forEach((v) => {
    for (const t of [0, 0.5, 1.5, 3.0, 5.25]) {
      const single = {
        notes: [{ time: t, dur: 0.6, midi: 60, vel: 0.6, voice: v, pan: 0 }],
        duration: t + 0.8
      };
      const p = R.renderScore(single, { sampleRate: sr });
      const from = Math.floor((t + 0.05) * sr);
      const to = Math.min(Math.floor((t + 0.5) * sr), p.left.length);
      let peak = 0;
      for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(p.left[i]));
      if (!(peak > 0.001)) {
        err(`音色 ${v} 在 t=${t}s 处无声音（时间偏移丢音）`);
        allOk = false;
      }
    }
  });
  if (allOk) ok('10 种音色在 5 个不同时间点均正常发声，无时间偏移丢音');
}

console.log('\n=== 10. 64 卦各段均有声（伴奏不得使某段静音）===');
{
  let allOk = true;
  const badList = [];
  for (let n = 1; n <= 64; n++) {
    const hex = D.getHexagram(n);
    const cfg = D.deriveMusicConfig(hex);
    const score = M.composeNotes(hex, cfg, null);
    const p = R.renderScore(score, { sampleRate: 8000 });
    Object.entries(score.sections).forEach(([k, v]) => {
      const from = Math.floor(v.start * p.sampleRate);
      const to = Math.min(Math.floor(v.end * p.sampleRate), p.left.length);
      let s = 0, c = 0;
      for (let i = from; i < to; i++) { s += p.left[i] * p.left[i]; c++; }
      const rms = c ? Math.sqrt(s / c) : 0;
      if (rms < 0.008) {
        badList.push(`卦${n} ${hex.name} 的 ${k} 段近静音(RMS ${rms.toFixed(4)})`);
        allOk = false;
      }
    });
  }
  if (allOk) ok('64 卦的起/承/转/合四段均有声音，伴奏层未造成段落静音');
  else badList.slice(0, 6).forEach((b) => err(b));
}

console.log('\n' + (errors === 0 ? '全部通过 ✓' : `存在 ${errors} 处问题`));
process.exit(errors > 0 ? 1 : 0);
