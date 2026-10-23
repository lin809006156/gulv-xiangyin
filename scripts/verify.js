/**
 * 学易心音 · 校验脚本
 * 运行：node scripts/verify.js
 */
const D = require('../core/data.js');

let errors = 0;
const err = (m) => { console.log('  [X] ' + m); errors++; };
const ok = (m) => console.log('  [v] ' + m);

console.log('\n=== 1. 八卦基础数据 ===');
const lineSum = {};
Object.values(D.TRIGRAMS).forEach((t) => {
  if (t.lines.length !== 3) err(`${t.name} 爻数错误`);
  if (!t.lines.every((v) => v === 0 || v === 1)) err(`${t.name} 爻值非法`);
  lineSum[t.key] = t.lines.join('');
});
ok('八卦爻象: ' + Object.values(lineSum).join(' / '));

console.log('\n=== 2. 序卦传上下卦对照（64卦）===');
// 传统序卦传的标准组合：序 -> [上卦, 下卦]
const STANDARD = {
  1: ['qian', 'qian'], 2: ['kun', 'kun'], 3: ['kan', 'zhen'], 4: ['gen', 'kan'],
  5: ['kan', 'qian'], 6: ['qian', 'kan'], 7: ['kun', 'kan'], 8: ['kan', 'kun'],
  9: ['xun', 'qian'], 10: ['qian', 'dui'], 11: ['kun', 'qian'], 12: ['qian', 'kun'],
  13: ['qian', 'li'], 14: ['li', 'qian'], 15: ['kun', 'gen'], 16: ['zhen', 'kun'],
  17: ['dui', 'zhen'], 18: ['gen', 'xun'], 19: ['kun', 'dui'], 20: ['xun', 'kun'],
  21: ['li', 'zhen'], 22: ['gen', 'li'], 23: ['gen', 'kun'], 24: ['kun', 'zhen'],
  25: ['qian', 'zhen'], 26: ['gen', 'qian'], 27: ['gen', 'zhen'], 28: ['dui', 'xun'],
  29: ['kan', 'kan'], 30: ['li', 'li'], 31: ['dui', 'gen'], 32: ['zhen', 'xun'],
  33: ['qian', 'gen'], 34: ['zhen', 'qian'], 35: ['li', 'kun'], 36: ['kun', 'li'],
  37: ['xun', 'li'], 38: ['li', 'dui'], 39: ['kan', 'gen'], 40: ['zhen', 'kan'],
  41: ['gen', 'dui'], 42: ['xun', 'zhen'], 43: ['dui', 'qian'], 44: ['qian', 'xun'],
  45: ['dui', 'kun'], 46: ['kun', 'xun'], 47: ['dui', 'kan'], 48: ['kan', 'xun'],
  49: ['dui', 'li'], 50: ['li', 'xun'], 51: ['zhen', 'zhen'], 52: ['gen', 'gen'],
  53: ['xun', 'gen'], 54: ['zhen', 'dui'], 55: ['zhen', 'li'], 56: ['li', 'gen'],
  57: ['xun', 'xun'], 58: ['dui', 'dui'], 59: ['xun', 'kan'], 60: ['kan', 'dui'],
  61: ['xun', 'dui'], 62: ['zhen', 'gen'], 63: ['kan', 'li'], 64: ['li', 'kan']
};

D.HEXAGRAMS.forEach((h) => {
  const std = STANDARD[h.n];
  if (!std) { err(`卦序 ${h.n} 缺少标准对照`); return; }
  if (h.upper !== std[0] || h.lower !== std[1]) {
    err(`卦序 ${h.n} ${h.name} 上下卦不符：得到 ${h.upper}/${h.lower}，应为 ${std[0]}/${std[1]}`);
  }
});
if (!errors) ok('64卦上下卦组合与序卦传完全一致');

console.log('\n=== 3. 组合唯一性 ===');
const seen = new Map();
D.HEXAGRAMS.forEach((h) => {
  const key = h.upper + '/' + h.lower;
  if (seen.has(key)) err(`组合重复：${key} 出现于卦序 ${seen.get(key)} 与 ${h.n}`);
  seen.set(key, h.n);
});
if (seen.size !== 64) err(`组合数 ${seen.size} ≠ 64`);
else ok('64 种上下卦组合唯一且完备');

console.log('\n=== 4. 反查函数 ===');
for (let n = 1; n <= 64; n++) {
  const h = D.HEXAGRAMS[n - 1];
  const idx = D.findHexagramIndex(h.upper, h.lower);
  if (idx !== n - 1) err(`findHexagramIndex(${h.upper},${h.lower}) = ${idx}，期望 ${n - 1}`);
  const sym = D.hexagramSymbol(n);
  if (sym.length !== 1 || sym.charCodeAt(0) !== 0x4dc0 + n - 1) err(`卦符错误：${n} -> ${sym}`);
}
if (!errors) ok('反查与卦符（U+4DC0 起）全部正确');

console.log('\n=== 5. 音乐参数推导 ===');
const modes = new Set();
const voices = new Set();
let minRoot = 999, maxRoot = 0;
D.HEXAGRAMS.forEach((h) => {
  const cfg = D.deriveMusicConfig(h);
  modes.add(cfg.modeKey);
  voices.add(cfg.voice);
  minRoot = Math.min(minRoot, cfg.rootMidi);
  maxRoot = Math.max(maxRoot, cfg.rootMidi);
  if (!cfg.melody || cfg.melody.length !== 6) err(`卦序 ${h.n} 旋律轮廓长度异常`);
  if (cfg.melody.some((v) => v < 0 || v > 9)) err(`卦序 ${h.n} 旋律轮廓越界`);
  if (!cfg.rhythm || cfg.rhythm.length !== 6) err(`卦序 ${h.n} 节奏长度异常`);
});
ok(`调式覆盖: ${[...modes].join(', ')} (${modes.size}/5)`);
ok(`音色覆盖: ${[...voices].join(', ')} (${voices.size}/8)`);
ok(`主音 MIDI 区间: ${minRoot} ~ ${maxRoot}`);

const melodySet = new Set(D.HEXAGRAMS.map((h) => D.deriveMusicConfig(h).melody.join(',')));
ok(`六爻旋律轮廓唯一性: ${melodySet.size}/64 种不同轮廓`);

// 可复现性：同卦两次推导必须完全一致
const r1 = D.deriveMusicConfig(D.HEXAGRAMS[0]).melody.join(',');
const r2 = D.deriveMusicConfig(D.HEXAGRAMS[0]).melody.join(',');
if (r1 !== r2) err('同卦两次推导结果不一致，种子随机不可复现');
else ok('可复现性: 同卦旋律生成结果一致');

// 节奏与六爻阴阳一致：阳爻力度高于阴爻
D.HEXAGRAMS.forEach((h) => {
  const cfg = D.deriveMusicConfig(h);
  cfg.rhythm.forEach((r, i) => {
    const isYang = cfg.lines[i] === 1;
    if (isYang && r.accent <= 0.45) err(`卦序 ${h.n} 第${i + 1}爻为阳但力度偏低`);
    if (!isYang && r.accent >= 0.9) err(`卦序 ${h.n} 第${i + 1}爻为阴但力度偏高`);
  });
});
ok('节奏强弱与六爻阴阳对应正确');

console.log('\n=== 6. 调式度数校验 ===');
Object.entries(D.MODES).forEach(([k, m]) => {
  const sorted = [...m.degrees].sort((a, b) => a - b);
  const okDeg = sorted.every((d, i) => i === 0 || d > sorted[i - 1]);
  if (!okDeg) err(`${k} 音级未严格递增`);
  if (m.degrees.length !== 5) err(`${k} 音级数不等于 5`);
});
if (!errors) ok('五种调式均为严格递增的五声音级');

console.log('\n=== 7. 物象库 ===');
let imgCount = 0;
D.IMAGE_LIBRARY.forEach((g) => {
  g.items.forEach((it) => {
    imgCount++;
    if (!D.TRIGRAMS[it.gua]) err(`物象 "${it.name}" 的卦 ${it.gua} 不存在`);
  });
});
ok(`物象总数: ${imgCount}，分类: ${D.IMAGE_LIBRARY.map((g) => g.category).join(', ')}`);

console.log('\n=== 8. 十二律吕 ===');
if (D.TWELVE_LV.length !== 12) err('律数不为 12');
D.TWELVE_LV.forEach((l, i) => { if (l.semi !== i) err(`律 ${l.name} 半音值应为 ${i}`); });
if (!errors) ok('十二律半音值 0-11 连续正确');

console.log('\n' + (errors === 0 ? '全部通过 ✓' : `发现 ${errors} 处问题 ✗`));
process.exit(errors === 0 ? 0 : 1);
