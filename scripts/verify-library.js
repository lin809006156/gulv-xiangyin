/**
 * 物象库 / 别名表交叉校验
 * 目的：保证每个 IMAGE_ALIAS 的目标名都真实存在于 IMAGE_LIBRARY 中，
 *       否则归一会失败，用户看到"识别到了但选不出来"。
 */
const D = require('../core/data.js');

let errors = 0;
const err = (m) => { console.log('  [X] ' + m); errors++; };
const ok = (m) => console.log('  [v] ' + m);

/* 1. 构建物象名集合 */
console.log('=== 1. 物象库规模 ===');
const names = new Set();
let total = 0;
D.IMAGE_LIBRARY.forEach((g) => {
  const dup = [];
  g.items.forEach((it) => {
    if (names.has(it.name)) dup.push(it.name);
    names.add(it.name);
    total++;
    if (!D.TRIGRAMS[it.gua]) err(`物象「${it.name}」的卦 key「${it.gua}」不存在`);
  });
  if (dup.length) err(`分类「${g.category}」内物象重复: ${dup.join(',')}`);
  console.log(`  ${g.category.padEnd(4)} ${String(g.items.length).padStart(3)} 项`);
});
ok(`物象总数 ${total} 个，去重后 ${names.size} 个`);

/* 2. 别名表校验 */
console.log('\n=== 2. 别名表交叉校验 ===');
const aliasKeys = Object.keys(D.IMAGE_ALIAS);
console.log(`  别名条目 ${aliasKeys.length} 个`);

let bad = 0;
aliasKeys.forEach((k) => {
  const v = D.IMAGE_ALIAS[k];
  if (!Array.isArray(v) || v.length !== 2) {
    err(`别名「${k}」格式应为 [物象名, 卦key]`);
    return;
  }
  const [target, gua] = v;
  if (!names.has(target)) {
    err(`别名「${k}」→ 物象「${target}」不在物象库中`);
    bad++;
  }
  if (!D.TRIGRAMS[gua]) {
    err(`别名「${k}」→ 卦 key「${gua}」不存在`);
    bad++;
  }
});
if (!bad) ok('全部别名的目标物象与卦 key 均有效');

/* 3. 别名与物象的卦是否一致 */
console.log('\n=== 3. 别名映射的卦一致性 ===');
const name2gua = new Map();
D.IMAGE_LIBRARY.forEach((g) => g.items.forEach((it) => name2gua.set(it.name, it.gua)));
let mismatch = 0;
aliasKeys.forEach((k) => {
  const [target, gua] = D.IMAGE_ALIAS[k];
  if (name2gua.has(target) && name2gua.get(target) !== gua) {
    err(`别名「${k}」→「${target}」声明卦 ${gua}，但物象库记为 ${name2gua.get(target)}`);
    mismatch++;
  }
});
if (!mismatch) ok('别名声明的卦与物象库完全一致');

/* 4. 关键生活物象覆盖率 */
console.log('\n=== 4. 用户明确提到的日常物象覆盖 ===');
const mustHave = ['桌案', '椅子', '沙发', '床', '窗户', '灯', '手机', '电脑',
  '书卷', '水杯', '钥匙', '时钟', '镜子', '车舆', '手表', '眼镜', '伞'];
mustHave.forEach((n) => {
  const has = names.has(n);
  console.log(`  ${has ? '[v]' : '[X]'} ${n}`);
  if (!has) err(`缺失日常物象: ${n}`);
});

/* 4b. 口语词必须可通过别名归一到标准物象 —— 这是"不讓用户不知道选什么"的关键 */
console.log('\n=== 4b. 口语词归一（用户不会说标准名）===');
const colloquial = [
  ['桌子', '桌案'], ['餐台', '桌案'], ['椅子', '椅子'], ['凳子', '椅子'],
  ['沙发', '沙发'], ['吸尘器', '吸尘器'], ['笔记本', '电脑'],
  ['iphone', '手机'], ['air conditioner', '空调'], ['desk', '桌案'], ['chair', '椅子'],
  ['水', '水'], ['树', '草木'], ['花', '草木'], ['狗', '狗'], ['雨伞', '伞'], ['凳子', '椅子']
];
colloquial.forEach(([input, expect]) => {
  if (expect === null) {
    console.log(`  [i] ${input} —— 未收录（应落兜底）`);
    return;
  }
  const hit = D.IMAGE_ALIAS[input.toLowerCase()] || D.IMAGE_ALIAS[input];
  if (!hit) { err(`口语词「${input}」未收录于别名表`); return; }
  const good = hit[0] === expect;
  console.log(`  ${good ? '[v]' : '[X]'} ${input} → ${hit[0]} (${hit[1]})`);
  if (!good) err(`口语词「${input}」归一为「${hit[0]}」，期望「${expect}」`);
});

/* 5. 八象覆盖均衡 */
console.log('\n=== 5. 八卦分布 ===');
const byGua = {};
D.IMAGE_LIBRARY.forEach((g) => g.items.forEach((it) => {
  byGua[it.gua] = (byGua[it.gua] || 0) + 1;
}));
D.TRIGRAM_KEYS.forEach((k) => {
  const n = byGua[k] || 0;
  const flag = n >= 8 ? '[v]' : '[!]';
  console.log(`  ${flag} ${D.TRIGRAMS[k].name} (${k}) ${n} 个物象`);
  if (n < 8) err(`${D.TRIGRAMS[k].name} 物象仅 ${n} 个，取卦概率偏低`);
});

console.log('\n' + (errors === 0 ? '全部通过 ✓' : `${errors} 项失败 ✗`));
process.exit(errors === 0 ? 0 : 1);