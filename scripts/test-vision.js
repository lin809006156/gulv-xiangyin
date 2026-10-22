/**
 * 视觉识别解析层测试
 * 重点：模型返回格式千变万化，解析必须稳健，
 *      否则用户看到的是"识别失败"而非结果。
 */
const V = require('../core/vision.js');
const R = require('../core/recognize.js');
const D = require('../core/data.js');

let errors = 0;
const ok = (m) => console.log('  [v] ' + m);
const err = (m) => { console.log('  [X] ' + m); errors++; };
const head = (t) => console.log('\n=== ' + t + ' ===');

/* 1. 提示词必须包含关键约束 */
head('1. 提示词关键约束');
const p = V.VISION_PROMPT;
[
  ['不要考虑某个物体上面放着什么', '必须禁止"看物上有什么"'],
  ['按在画面中的显著程度', '必须要求按显著度排序（上卦取主体）'],
  ['最多列 8 个', '必须限制条数'],
  ['不要输出"氛围"', '必须禁止抽象词']
].forEach(([needle, why]) => {
  if (p.indexOf(needle) === -1) err(`${why}：提示词缺少「${needle}」`);
  else ok(`含约束：${why}`);
});

/* 2. 各种返回格式都必须解析成功 */
head('2. 模型返回格式兼容');
const cases = [
  ['纯文本逐行', '桌子\n椅子\n笔记本电脑', ['桌子', '椅子', '笔记本电脑']],
  ['带编号', '1. 桌子\n2. 椅子\n3. 笔记本电脑', ['桌子', '椅子', '笔记本电脑']],
  ['带项目符号', '- 桌子\n- 椅子', ['桌子', '椅子']],
  ['JSON 数组', '["桌子","椅子","手机"]', ['桌子', '椅子', '手机']],
  ['JSON 代码块', '```json\n["桌子","椅子"]\n```', ['桌子', '椅子']],
  ['带引号', '"桌子"\n"椅子"', ['桌子', '椅子']],
  ['带尾标点', '桌子。\n椅子，\n笔记本电脑。', ['桌子', '椅子', '笔记本电脑']],
  ['带前言', '以下是图片中的物体：\n桌子\n椅子', ['桌子', '椅子']],
  ['CRLF 换行', '桌子\r\n椅子\r\n手机', ['桌子', '椅子', '手机']],
  ['JSON 对象数组', '[{"name":"桌子"},{"name":"椅子"}]', ['桌子', '椅子']],
  ['多余空白', '   桌子   \n\n\n  椅子  ', ['桌子', '椅子']],
  ['单条', '桌子', ['桌子']],
  ['空返回', '', []],
  ['null', null, []]
];
cases.forEach(([name, input, expect]) => {
  const got = V.parseElements(input);
  const pass = expect.length === got.length &&
    expect.every((e, i) => got[i] === e);
  console.log(`  ${pass ? '[v]' : '[X]'} ${name.padEnd(12)} → [${got.join(', ')}]`);
  if (!pass) err(`${name} 解析错误，期望 [${expect.join(', ')}]`);
});

/* 3. 说明性文字必须被过滤 */
head('3. 噪声过滤');
{
  const noisy = '图片中有以下物体：\n桌子\n椅子\n\n共3个物体\n希望对您有帮助！';
  const got = V.parseElements(noisy);
  console.log('  解析结果: [' + got.join(', ') + ']');
  const junk = got.filter((g) => /^(共|希望|图片|以下)/.test(g));
  if (junk.length) err(`未过滤说明性文字: ${junk.join(',')}`);
  else ok('模型口水话已过滤');
}

/* 4. 限长与去重 */
head('4. 限长与去重');
{
  const many = Array.from({ length: 20 }, (_, i) => `物${i}`).join('\n');
  const got = V.parseElements(many);
  console.log(`  20 条输入 → ${got.length} 条输出`);
  if (got.length > 8) err(`超出 8 条上限，实际 ${got.length}`);
  else ok(`已限长至 ${got.length} 条`);

  const dup = '桌子\n桌子\n 桌子 \n椅子';
  const d = V.parseElements(dup);
  console.log(`  重复输入 → [${d.join(', ')}]`);
  if (d.length !== 2) err('未去重');
  else ok('已去重');
}

/* 5. 端到端：模型文本 → UI 数据 */
head('5. 端到端：模型文本 → 可用 UI 数据');
{
  // 模拟真实的视觉模型返回（用户场景：桌子不是餐桌、椅子空着）
  const raw = '桌子\n椅子\n笔记本电脑\n咖啡杯\n窗户';
  const ui = V.fromModelText(raw);
  console.log('  ' + ui.hint);
  ui.candidates.forEach((c, i) => {
    console.log(`    ${i === ui.defaultIndex ? '▶' : ' '}${c.label.padEnd(6)} ${c.guaName}${c.symbol}  ${c.confidence.toFixed(2)}  ${c.method}`);
  });
  if (!ui.candidates.length) err('未产出候选');
  if (ui.allFallback) err('正常识别不应全部兜底');
  if (!ui.hint) err('缺少用户提示');
  ui.candidates.forEach((c) => { if (!D.TRIGRAMS[c.gua]) err('候选缺卦'); });
  ok(`${ui.candidates.length} 个候选全部有效，上卦=${ui.upper}(${ui.upperGua})`);
}

head('6. 空返回与全兜底必须可用');
{
  const empty = V.fromModelText('');
  console.log('  空返回: candidates=' + empty.candidates.length + ' empty=' + empty.empty);
  if (!empty.empty) err('空返回未标记 empty');
  if (empty.candidates.length) err('空返回不应产出候选');
  ok('空返回被正确标记，UI 可据此引导手动选择');

  const junk = V.fromModelText('一张桌子和一把椅子');
  console.log('  正常: allFallback=' + junk.allFallback + ' upper=' + junk.upper);
  console.log('  提示: ' + junk.hint.slice(0, 40) + '...');
  junk.candidates.forEach((c) => {
    if (!D.TRIGRAMS[c.gua]) err('兜底候选缺卦');
    if (!c.reason) err('兜底候选缺理由');
  });
  ok('每个候选均有卦与理由');
}

const alljunk = V.fromModelText('希望对您有帮助\n共3个物体');
  if (alljunk.upper !== null) err('全噪声时 upper 应为 null，实得 ' + JSON.stringify(alljunk.upper));
  else ok('全噪声时 upper=null（非字符串\"null\"），UI 可安全判空');
  if (!alljunk.empty) err('全噪声应标记 empty');

head('7. 未配置视觉服务时的手动兜底');
{
  const nc = V.notConfigured('尚未开通云开发');
  console.log('  notConfigured=' + nc.notConfigured);
  console.log('  提示: ' + nc.hint);
  if (!nc.notConfigured) err('未标记 notConfigured');
  if (!nc.hint || nc.hint.indexOf('手动') === -1) err('兜底提示必须引导手动选择');
  ok('未配置时给出手动选物象路径，而非报错');
}

head('8. 同一输入完全可复现');
{
  const raw = '桌子\n椅子\n手机';
  const a = V.fromModelText(raw);
  const b = V.fromModelText(raw);
  const sig = (u) => u.candidates.map((c) => c.label + ':' + c.gua).join('|');
  if (sig(a) !== sig(b)) err('同一模型返回解析结果不一致');
  else ok(`可复现：${sig(a)}`);
}

console.log('\n' + (errors === 0 ? '全部通过 ✓' : `${errors} 项失败 ✗`));
process.exit(errors === 0 ? 0 : 1);