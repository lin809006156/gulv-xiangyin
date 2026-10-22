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
head('5. 整份识别结果归一');
{
  const labels = ['一张木制桌子', '空椅子', '一台笔记本电脑', '一杯咖啡', '窗外有树'];
  const res = R.normalizeAll(labels);
  console.log(`  识别到 ${res.items.length} 个元素，上卦取「${res.upper}」(${res.upperGua})`);
  const cands = R.toCandidates(res);
  cands.forEach((c) => {
    console.log(`    ${c.matched ? '实' : '兜'} ${c.label.padEnd(6)} ${c.guaName}${c.symbol}  置信 ${c.confidence.toFixed(2)}`);
  });
  if (cands.length < 3) err('候选过少');
  // 上卦 = AI 排序第一的（最显著）物象 —— AI 已按画面显著性排序
  if (res.upper !== '椅子') err(`上卦应为画面主体「椅子」，实得 ${res.upper}`);
  ok(`上卦取画面主体物「${res.upper}」（AI 排序第一）`);
  // 置信度应有梯度，不能全部相同
  const confs = cands.map((c) => c.confidence);
  const spread = Math.max(...confs) - Math.min(...confs);
  if (spread < 0.05) err(`置信度无区分度（极差 ${spread.toFixed(2)}），无法区分主次`);
  else ok(`置信度分层生效：${Math.min(...confs).toFixed(2)} ~ ${Math.max(...confs).toFixed(2)}`);
  // 兜底项必须排在已匹配项之后
  const firstFallback = cands.findIndex((c) => !c.matched);
  const lastMatched = cands.map((c) => c.matched).lastIndexOf(true);
  if (firstFallback !== -1 && firstFallback < lastMatched) err('兜底项排在了已匹配项之前');
  // 所有候选都必须有卦
  cands.forEach((c) => { if (!D.TRIGRAMS[c.gua]) err('候选缺卦'); });
  ok('全部候选均有卦，无死路');
}

head('6. 端到端：识象 → 起卦 → 音乐');
{
  const res = R.normalizeAll(['一张木制桌子', '空椅子'], { now: new Date(2026, 9, 20, 15, 0, 0) });
  const up = res.upperGua;
  const div = H.imageHexagram(res.upper, up, new Date(2026, 9, 20, 15, 0, 0));
  console.log(`  物象「${res.upper}」属${D.TRIGRAMS[up].name}`);
  console.log(`  → ${div.hex.name} ${div.hex.symbol}  动爻 ${div.movingLine}`);
  console.log(`  理由：${div.hex.xiang}`);
  if (!div.hex || !div.music) err('起卦链路断裂');
  ok('识象 → 卦象 → 音乐参数 链路打通');

  // 同输入必须同结果
  const div2 = H.imageHexagram(res.upper, up, new Date(2026, 9, 20, 15, 0, 0));
  if (div2.hex.n !== div.hex.n) err('结果不可复现');
  ok('同一画面同一时刻，结果完全可复现');
}

head('7. 手动搜索兜底');
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

head('8. 界面数据完整性');
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