/**
 * 学易心音 · 起卦与作曲链路测试
 * 运行：node scripts/test.js
 */
const D = require('../core/data.js');
const H = require('../core/hexagram.js');
const M = require('../core/music.js');

// hexagram.js 依赖 data.js 的全局符号
Object.assign(global, D);

let errors = 0;
const err = (m) => { console.log('  [X] ' + m); errors++; };
const ok = (m) => console.log('  [v] ' + m);

console.log('\n=== 1. 时间起卦（每日一卦）===');
const d1 = new Date(2026, 9, 20, 9, 42, 0);
const t1 = H.timeHexagram(d1);
ok(`2026-10-20 09:42 → ${t1.hex.name}（${t1.hex.symbol}）动爻${t1.movingLine}`);
if (!t1.hex || t1.hex.n < 1 || t1.hex.n > 64) err('卦序越界');
if (t1.movingLine < 1 || t1.movingLine > 6) err('动爻越界');
if (!t1.changedHex) err('变卦缺失');

// 同一天不同时刻 → 每日卦应恒定
const t2 = H.timeHexagram(new Date(2026, 9, 20, 0, 0, 0));
const t3 = H.timeHexagram(new Date(2026, 9, 20, 23, 59, 0));
if (t2.hex.n !== t3.hex.n) err('同一天不同时刻的每日卦不一致');
else ok(`同日恒定: 00:00 与 23:59 同得 ${t2.hex.name}`);

// 变卦校验：变爻处阴阳应反转，其余不变
D.getSixLines(t1.hex).forEach((y, i) => {
  const c = t1.changedLines[i];
  if (i === t1.movingLine - 1) {
    if (c === y) err('动爻阴阳未反转');
  } else if (c !== y) err(`非动爻第${i + 1}爻被改动`);
});
ok('变卦规则正确：仅动爻反转');

// 变卦反查一致性
const idx = D.findHexagramIndex(t1.changedHex.upper, t1.changedHex.lower);
if (idx + 1 !== t1.changedHex.n) err('变卦反查不一致');
else ok(`变卦 ${t1.changedHex.name} 反查一致`);

console.log('\n=== 2. 物象起卦（观象起卦）===');
// 物象起卦：上卦固定为物象之卦，下卦随时辰变化（梅花易数本意）
const img = H.imageHexagram('猫', 'gen', d1);
ok(`观"猫"(艮) → ${img.hex.name}（${img.hex.symbol}）动爻${img.movingLine}`);
if (img.upperNum !== 7) err(`艮的先天数应为 7，实得 ${img.upperNum}`);
if (img.detail.imageName !== '猫') err('物象名未记录');
// 同物象同一时刻 → 完全恒定
const img2 = H.imageHexagram('猫', 'gen', new Date(2026, 9, 20, 9, 42, 0));
if (img.hex.n !== img2.hex.n || img.movingLine !== img2.movingLine) err('同物象同时刻结果不一致');
else ok('物象起卦在相同时刻结果恒定');
// 不同时辰 → 下卦应随之变化（这是设计意图，非缺陷）
const img3 = H.imageHexagram('猫', 'gen', new Date(2026, 9, 20, 15, 0, 0));
ok(`同物象不同时辰 → ${img.hex.name} / ${img3.hex.name}（下卦随时辰流转）`);

console.log('\n=== 3. 数字起卦 ===');
const num = H.numberHexagram(17, 43);
ok(`数字 17/43 → ${num.hex.name} 动爻${num.movingLine}`);
if (num.upperNum !== 1) err(`17 → 上卦数应为 1，实得 ${num.upperNum}`);
if (num.lowerNum !== 3) err(`43 → 下卦数应为 3，实得 ${num.lowerNum}`);

console.log('\n=== 4. 解读文案组装 ===');
const reading = H.buildReading(t1);
ok(`卦名: ${reading.name}  卦辞: ${reading.gua}`);
ok(`大象: ${reading.xiang}`);
ok(`心语: ${reading.hint}`);
ok(`结构: ${reading.structure}`);
ok(`动爻: ${reading.movingLine} ${reading.yaoList[reading.movingLine - 1].title}`);
if (reading.yaoList.length !== 6) err('爻列表长度不为 6');
if (!reading.yaoList[reading.movingLine - 1].isMoving) err('动爻标记缺失');
if (reading.yaoList.filter((y) => y.isMoving).length !== 1) err('动爻标记数量不为 1');

console.log('\n=== 5. 64卦作曲全量校验 ===');
let minDur = 999, maxDur = 0, totalNotes = 0;
// 音色集须与《白虎通·礼乐》八音配八卦一致（八音 + 装饰音）
const VOICES = new Set([
  'zhu', 'zhong', 'xian', 'gu', 'xiao', 'xun', 'guan', 'qing',
  'click', 'pad'
]);
D.HEXAGRAMS.forEach((h) => {
  const hex = D.getHexagram(h.n);
  const cfg = D.deriveMusicConfig(hex);
  const score = M.composeNotes(hex, cfg, null);

  if (!score.notes.length) { err(`卦序 ${h.n} 无音符`); return; }
  if (score.duration <= 0) err(`卦序 ${h.n} 时长非正`);

  // 音符合法性
  score.notes.forEach((note) => {
    if (typeof note.time !== 'number' || Number.isNaN(note.time)) err(`卦序 ${h.n} 音符 time 非法`);
    if (note.midi < 28 || note.midi > 104) err(`卦序 ${h.n} MIDI ${note.midi} 超范围`);
    if (note.dur <= 0) err(`卦序 ${h.n} 音符时值非正`);
    if (note.vel < 0 || note.vel > 1.2) err(`卦序 ${h.n} 力度 ${note.vel} 越界`);
    if (!VOICES.has(note.voice)) err(`卦序 ${h.n} 未知音色 ${note.voice}`);
    if (note.time < 0) err(`卦序 ${h.n} 音符时间为负`);
  });

  // 音符不超出总时长
  const lastEnd = Math.max(...score.notes.map((n) => n.time + n.dur));
  if (lastEnd > score.duration + 0.01) err(`卦序 ${h.n} 音符超出总时长`);

  // 四段式齐全
  ['intro', 'theme', 'variation', 'coda'].forEach((s) => {
    const sec = score.sections[s];
    if (!sec || sec.end <= sec.start) err(`卦序 ${h.n} 段落 ${s} 异常`);
  });

  // 音符时间单调递增（排序后）
  const times = score.notes.map((n) => n.time);
  const sorted = [...times].sort((a, b) => a - b);
  if (times.join(',') !== sorted.join(',')) err(`卦序 ${h.n} 音符时间未按序排列`);

  minDur = Math.min(minDur, score.duration);
  maxDur = Math.max(maxDur, score.duration);
  totalNotes += score.notes.length;
});
ok(`64 卦全部成功作曲，时长 ${minDur.toFixed(1)}s ~ ${maxDur.toFixed(1)}s`);
ok(`平均每卦 ${(totalNotes / 64).toFixed(0)} 个音符，总计 ${totalNotes} 个`);

console.log('\n=== 6. 作曲可复现性 ===');
const h11 = D.getHexagram(11), h11b = D.getHexagram(11);
const s1 = M.composeNotes(h11, D.deriveMusicConfig(h11), null);
const s2 = M.composeNotes(h11b, D.deriveMusicConfig(h11b), null);
if (JSON.stringify(s1.notes) !== JSON.stringify(s2.notes)) err('同卦两次作曲结果不一致');
else ok('同卦作曲完全可复现');

console.log('\n=== 7. 64卦音频指纹唯一性 ===');
const fingerprints = new Set();
D.HEXAGRAMS.forEach((h) => {
  const hex = D.getHexagram(h.n);
  const cfg = D.deriveMusicConfig(hex);
  const score = M.composeNotes(hex, cfg, null);
  fingerprints.add(score.notes.map((n) => `${n.midi}@${n.time}`).join('|'));
});
ok(`64 卦音频指纹唯一性: ${fingerprints.size}/64`);
if (fingerprints.size !== 64) err('存在音频指纹重复的卦');

console.log('\n=== 8. 样本卦概览 ===');
[1, 11, 29, 63].forEach((n) => {
  const hex = D.getHexagram(n);
  const cfg = D.deriveMusicConfig(hex);
  const score = M.composeNotes(hex, cfg, null);
  console.log(`  ${hex.symbol} ${hex.name.padEnd(5)} | ${cfg.modeName} | ${cfg.lvName} | 主音MIDI ${cfg.rootMidi} | ${cfg.voiceText} | ${cfg.tempo}BPM | ${score.duration.toFixed(1)}s | ${score.notes.length}音`);
});

console.log('\n' + (errors === 0 ? '全部通过 ✓' : `发现 ${errors} 处问题 ✗`));
process.exit(errors === 0 ? 0 : 1);
