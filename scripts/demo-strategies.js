/**
 * 试听样渲染：三种音频生成策略，各渲染一段供人工试听
 * ---------------------------------------------------------------
 * 用户反馈「只有单一的一小段在不停重复」。本脚本把候选策略离线渲染成 WAV，
 * 改主程序之前先让用户试听选定，避免返工浪费。
 *
 *   A 现行策略     —— 无发展层：主题每一遍原样陈述（reference，听到的问题）
 *   B 轮内发展     —— 呈示轮 + 轮内发展手法（加花/换头/移宫/分裂逐遍生长）
 *   C 跨轮宏曲式   —— 连续四轮走八轮曲式（呈示→应和→加花→隔凡）
 *
 * 每轮编曲与播放器完全同构：时间种子 + 随机变体 + 同一渲染参数（混响 0.32），
 * 轮与轮之间按播放器的「叠尾」做 1.5 秒交叉淡入。
 *
 * 用法：node scripts/demo-strategies.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const M = require('../core/music.js');
const R = require('../core/render.js');
const H = require('../core/hexagram.js');
const D = require('../core/data.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const SR = 22050;          // 试听样采样率（正码 44100 亦可，此处省体积）
const ROUNDS = { A: 3, B: 3, C: 4 };

/* ---------- 今日之卦（与 APP「每日一卦」同源） ---------- */
const res = H.timeHexagram(new Date());
const hex = res.hex;
const cfg = res.music;
const changedCfg = res.changedMusic;
console.log(`今日之卦：第 ${hex.n} 卦 ${hex.name}（${cfg.modeName} · ${cfg.lvName} · ${cfg.voiceText} · ${cfg.tempo}BPM）`);
console.log(`轮时长参考：${M.composeNotes(hex, cfg, changedCfg).duration.toFixed(1)}s\n`);

/** 一轮：编曲 + 渲染（与 player._genComposeRound 同构，外加 form） */
function renderRound(roundNo, form) {
  const seed = (0x51ED2701 + roundNo * 7919) >>> 0;    // 固定种子，保证试听样可复现
  const variant = M.randomVariant(D.seededRandom(seed));
  const score = M.composeNotes(hex, cfg, changedCfg, { seed, variant, form });
  const pcm = R.renderScore(score, { sampleRate: SR, reverb: 0.32 });
  return { score, pcm };
}

/** 叠尾：两轮之间 1.5 秒等余弦交叉淡入（同播放器叠尾之意） */
function xfade(a, b, sec) {
  const n = Math.min(Math.floor(sec * SR), a.left.length, b.left.length);
  const len = a.left.length + b.left.length - n;
  const L = new Float32Array(len);
  const Rr = new Float32Array(len);
  L.set(a.left, 0); Rr.set(a.right, 0);
  for (let i = 0; i < n; i++) {
    const f = i / n;
    const g = Math.cos(f * Math.PI / 2);
    const h = Math.cos((1 - f) * Math.PI / 2);
    const ai = a.left.length - n + i;
    L[ai] = a.left[ai] * g + b.left[i] * h;
    Rr[ai] = a.right[ai] * g + b.right[i] * h;
  }
  L.set(b.left.subarray(n), a.left.length);
  Rr.set(b.right.subarray(n), a.left.length);
  return { left: L, right: Rr, length: len, sampleRate: SR, duration: len / SR };
}

/** 渲染一个试听样：rounds 轮依次叠尾相接 */
function renderDemo(label, formOf) {
  const rounds = ROUNDS[label];
  let acc = null;
  for (let i = 0; i < rounds; i++) {
    const form = formOf(i);
    const { score, pcm } = renderRound(i, form);
    console.log(`  [${label}] 第 ${i + 1} 轮：宏曲式「${form ? M.ARC_NAMES[form] : '无'}」`
      + `，时长 ${pcm.duration.toFixed(1)}s，音符 ${score.notes.length}`);
    acc = acc ? xfade(acc, pcm, 1.5) : pcm;
  }
  const wav = R.encodeWav(acc);
  const file = path.join(OUT, `试听-${label}-${label === 'A' ? '现行策略' : label === 'B' ? '轮内发展' : '跨轮曲式'}.wav`);
  fs.writeFileSync(file, Buffer.from(wav));
  const mb = (wav.byteLength / 1048576).toFixed(1);
  console.log(`  [${label}] 合计 ${acc.duration.toFixed(1)}s → ${path.basename(file)}（${mb} MB）\n`);
  return file;
}

fs.mkdirSync(OUT, { recursive: true });

console.log('=== A · 现行策略（每遍原样陈述）===');
renderDemo('A', () => null);

console.log('=== B · 轮内发展（呈示轮 + 轮内发展手法）===');
renderDemo('B', () => 'chengshi');

console.log('=== C · 跨轮宏曲式（呈示→应和→加花→隔凡）===');
renderDemo('C', (i) => M.arcAt(i));

console.log('三个试听样已写入 dist/。请试听后选定策略，再改主程序。');
