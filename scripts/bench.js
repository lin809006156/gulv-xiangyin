/**
 * 基准测试：纯 JS 渲染器的性能
 * 测三件事：
 *   1. 单卦渲染耗时（小程序端实时生成的可行性）
 *   2. 64 卦全量渲染耗时（Node 端批量预渲染的可行性）
 *   3. 渲染结果的基本质量指标
 */
'use strict';

const D = require('../core/data.js');
const M = require('../core/music.js');
const R = require('../core/render.js');

console.log('=== 学易心音 · 渲染性能基准 ===\n');

/* ---------- 1. 单卦渲染耗时 ---------- */
const hex = D.getHexagram(1);
const cfg = D.deriveMusicConfig(hex);
const score = M.composeNotes(hex, cfg, null);

console.log(`样本卦：${hex.name}（${hex.symbol}）`);
console.log(`音符数：${score.notes.length}`);
console.log(`时长：${score.duration.toFixed(2)} 秒`);

// 预热一次，避开 JIT 冷启动的干扰
R.renderScore(score, { sampleRate: 44100 });

const runs = 3;
let total = 0;
for (let i = 0; i < runs; i++) {
  const t0 = Date.now();
  const pcm = R.renderScore(score, { sampleRate: 44100 });
  const dt = Date.now() - t0;
  total += dt;
  if (i === runs - 1) {
    console.log(`\n单卦渲染耗时：${dt} ms`);
    console.log(`峰值：${pcm.peak.toFixed(3)}`);
    console.log(`采样点：${pcm.length} (${pcm.sampleRate} Hz)`);
  }
}
console.log(`平均：${(total / runs).toFixed(0)} ms`);

/* ---------- 2. 实时倍率 ---------- */
const avg = total / runs;
const ratio = (score.duration * 1000) / avg;
console.log(`\n渲染速度：${ratio.toFixed(1)}× 实时`);
console.log(ratio > 1
  ? `  → 快于实时，可在小程序端实时生成`
  : `  → 慢于实时，需预渲染缓存`);

/* ---------- 3. 64 卦全量渲染 ---------- */
console.log('\n渲染全部 64 卦...');
const t1 = Date.now();
const fps = new Set();
let maxMs = 0;
for (let n = 1; n <= 64; n++) {
  const h = D.getHexagram(n);
  const c = D.deriveMusicConfig(h);
  const s = M.composeNotes(h, c, null);
  const t0 = Date.now();
  const pcm = R.renderScore(s, { sampleRate: 44100 });
  const dt = Date.now() - t0;
  if (dt > maxMs) maxMs = dt;
  fps.add(R.audioFingerprint(pcm));
}
const tAll = Date.now() - t1;
console.log(`全量渲染耗时：${(tAll / 1000).toFixed(1)} 秒`);
console.log(`最慢单卦：${maxMs} ms`);
console.log(`音频指纹唯一性：${fps.size}/64`);

/* ---------- 4. 可复现性 ---------- */
const s1 = M.composeNotes(hex, cfg, null);
const p1 = R.renderScore(s1, { sampleRate: 44100 });
const p2 = R.renderScore(s1, { sampleRate: 44100 });
console.log(`\n可复现性：${R.audioFingerprint(p1) === R.audioFingerprint(p2) ? '通过（同参数必得同波形）' : '失败'}`);

/* ---------- 5. WAV 体积估算 ---------- */
const wavSize = 44 + p1.length * 4;
console.log(`\nWAV 体积（44.1kHz 立体声 16bit）：${(wavSize / 1024 / 1024).toFixed(2)} MB`);
console.log('小程序端建议：渲染后写文件用 InnerAudioContext 播放');
