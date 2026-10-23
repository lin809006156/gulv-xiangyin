/**
 * 识象归一模块测试
 * 重点验证用户提到的真实痛点：
 *  - "有桌子但不是餐桌" → 应归桌案(艮)，不因"餐桌"字样归坤
 *  - "有椅子但上面没东西" → 应归椅子(艮)，物象取物本身
 *  - 任何输入都不能死路
 */
const R = require('../core/recognize.js');
const D = require('../core/data.js');
const H = require('../core/hexagram.js');

let errors = 0;
const ok = (m) => console.log('  [v] ' + m);
const err = (m) => { console.log('  [X] ' + m); errors++; };
const head = (t) => console.log('\n=== ' + t + ' ===');

/* 1 */
head('1. 基础归一');
[
  ['手机', '手机', 'li'],
  ['椅子', '椅子', 'gen'],
  ['desk', '桌案', 'gen'],
  ['dog', '狗', 'gen'],
  ['tree', '草木', 'xun']
].forEach(([inp, expImg, expGua]) => {
  const r = R.normalizeOne(inp);
  if (!r.matched) { err(`「${inp}」未归一成功`); return; }
  const good = r.image === expImg && r.gua === expGua;
  console.log(`  ${good ? '[v]' : '[X]'} 「${inp}」→ ${r.image}(${r.gua})  ${r.reason}`);
  if (!good) err(`期望 ${expImg}(${expGua})`);
});

/* 2 —— 用户原话场景 */
head('2. 用户原话场景：桌子不是餐桌');
{
  // AI 可能输出 "一张木制桌子"，用户强调不是餐桌
  const r = R.normalizeOne('一张木制桌子');
  console.log(`  [?] 「一张木制桌子」→ ${r.image}(${r.gua}) 方法=${r.method}`);
  console.log(`      ${r.reason}`);
  if (r.image !== '桌案') err('长句中的"桌子"未被抽为「桌案」');
  if (r.gua !== 'gen') err(`桌子应归艮(g en)，实得 ${r.gua}`);
  ok('桌子 → 桌案(艮)：与是否餐桌无关，符合《说卦传》艮为桌案门阙');
}
{
  const r = R.normalizeOne('餐桌');
  console.log(`  [?] 「餐桌」→ ${r.image}(${r.gua})`);
  // 餐桌也应归桌案(艮)，因为艮为桌案
  if (r.image !== '桌案') err(`餐桌应归桌案，实得 ${r.image}`);
  ok('餐桌 → 桌案(艮)：与"桌子"同卦，说明细分类目不影响取卦');
}

head('3. 用户原话场景：椅子上面没有东西');
{
  const r = R.normalizeOne('椅子');
  if (r.image !== '椅子' || r.gua !== 'gen') err('椅子归一异常');
  ok('「空的椅子」→ 椅子(艮)：物象取物本身，不看它上面有什么');
  // 强调：不查"椅子上放着什么"
  const r2 = R.normalizeOne('一把椅子，座位是空的');
  console.log(`  [?] 「一把椅子，座位是空的」→ ${r2.image}(${r2.gua})`);
  if (r2.image !== '椅子') err('长描述中的"椅子"未被抽出');
  ok('长描述也能抽出「椅子」，"空的"不影响');
}

/* 4 */
head('4. 兜底：不能死路');
['龙腾四海', 'zzz不存在的词', '一张火星照片', '', '   '].forEach((inp) => {
  const r = R.normalizeOne(inp);
  const hasGua = !!D.TRIGRAMS[r.gua];
  const good = hasGua && r.reason.length > 0;
  console.log(`  ${good ? '[v]' : '[X]'} 「${inp || '(空)'}」→ ${r.method} ${r.gua ? D.TRIGRAMS[r.gua].name : '无'}`);
  if (!good) err('兜底失败：必须给出卦与理由');
});
{
  // 兜底必须可复现
  const a = R.normalizeOne('某个怪东西');
  const b = R.normalizeOne('某个怪东西');
  if (a.gua !== b.gua) err('兜底卦不可复现');
  else ok(`兜底可复现：「某个怪东西」→ ${D.TRIGRAMS[a.gua].name}`);
}

/* 5 */
head('5. 手动搜索兜底');
[['桌', 1], ['椅', 1], ['desk', 1], ['手机', 1], ['xyz不存在', 0]].forEach(([kw, min]) => {
  const r = R.searchImages(kw, 12);
  console.log(`  [?] 搜「${kw}」→ ${r.length} 条`);
  if (r.length < min) err(`搜索「${kw}」应至少 ${min} 条`);
});
{
  const r = R.searchImages('椅');
  console.log(`  搜「椅」首条：${r[0].image}(${r[0].guaName}) 通过「${r[0].via}」`);
  ok('口语单字也能搜到标准物象');
}

head('6. 界面数据完整性');
{
  const flat = R.flattenLibrary();
  const total = flat.reduce((s, g) => s + g.items.length, 0);
  console.log(`  物象库 ${flat.length} 类共 ${total} 项`);
  flat.forEach((g) => {
    g.items.forEach((it) => {
      if (!it.guaName || !it.symbol) err(`「${it.name}」卦信息不全`);
    });
  });
  if (total !== R.librarySize) err(`扁平化数量 ${total} ≠ 索引数量 ${R.librarySize}`);
  ok(`分组数据完整（${R.librarySize} 项，与索引一致）`);
}

console.log('\n' + (errors === 0 ? '全部通过 ✓' : `${errors} 项失败 ✗`));
process.exit(errors === 0 ? 0 : 1);