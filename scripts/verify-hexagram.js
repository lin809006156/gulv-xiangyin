/**
 * 卦象爻序与卦名一致性校验
 * ---------------------------------------------------------------
 * 背景：曾出现网页版六爻图上下颠倒的缺陷——
 *   renderYao 已按「上爻在上」倒序插入 DOM，
 *   而 .yao-figure 又设了 flex-direction: column-reverse，
 *   两次反转叠加，导致雷火丰（䷶ 上震下离）显示成火山旅（上离下艮）。
 * 动爻标记随之错位。
 *
 * 本脚本做三件事：
 *   1. 校验 64 卦的「卦名 ↔ 上下卦」对应关系
 *   2. 校验六爻序列自下而上的正确性
 *   3. 校验爻题格式（初九/初六、上九/上六、九二/六三…）
 */

'use strict';

const D = require('../core/data.js');
const H = require('../core/hexagram.js');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  [v] ' + m); };
const err = (m) => { fail++; console.log('  [X] ' + m); };

/** 卦名 → 上下卦的通例（八卦本名 → 卦象名） */
const TRIGRAM_IMAGE_NAME = {
  qian: '天', kun: '地', zhen: '雷', xun: '风',
  kan: '水', li: '火', gen: '山', dui: '泽'
};

/** 「乾为天」这类八卦自成一体的卦 */
const SELF_NAMES = {
  'qian-qian': '乾为天', 'kun-kun': '坤为地', 'zhen-zhen': '震为雷',
  'xun-xun': '巽为风', 'kan-kan': '坎为水', 'li-li': '离为火',
  'gen-gen': '艮为山', 'dui-dui': '兑为泽'
};

console.log('=== 1. 64 卦「卦名 ↔ 上下卦」对应 ===');
const comboSeen = new Map();
D.HEXAGRAMS.forEach((h) => {
  const key = h.upper + '-' + h.lower;
  if (comboSeen.has(key)) {
    err(`卦序 ${h.n}「${h.name}」与卦序 ${comboSeen.get(key)} 的上下卦组合重复`);
  } else {
    comboSeen.set(key, h.n);
  }

  const self = SELF_NAMES[key];
  if (self) {
    if (h.name !== self) {
      err(`卦序 ${h.n} 应为「${self}」，实为「${h.name}」`);
    }
    return;
  }

  // 他卦：卦名前两字必为「上卦象名 + 下卦象名」，如 雷火丰 = 上震(雷) 下离(火)
  // 第三字为卦名本身（丰/旅/遯…），或有异体（豐/遯/濟），不参与校验
  const expect = TRIGRAM_IMAGE_NAME[h.upper] + TRIGRAM_IMAGE_NAME[h.lower];
  if (h.name.slice(0, 2) !== expect) {
    err(`卦序 ${h.n}「${h.name}」与上下卦不符，应以「${expect}」起首（上${h.upper} 下${h.lower}）`);
  }
});
if (comboSeen.size === 64) ok('64 组上下卦组合齐全且互不重复');
else err(`上下卦组合只有 ${comboSeen.size} 组，应为 64 组`);

console.log('\n=== 2. 六爻序列（自下而上）===');
let linesBad = 0;
D.HEXAGRAMS.forEach((h) => {
  const hex = D.getHexagram(h.n);
  const ls = D.getSixLines(hex);
  if (ls.length !== 6) { err(`卦序 ${h.n} 六爻数不为 6`); linesBad++; return; }
  // 下卦三爻须等于内卦定义，上卦三爻须等于外卦定义
  const inner = D.TRIGRAMS[h.lower].lines;
  const outer = D.TRIGRAMS[h.upper].lines;
  for (let i = 0; i < 3; i++) {
    if (ls[i] !== inner[i]) { err(`卦序 ${h.n} 内卦第 ${i + 1} 爻不符`); linesBad++; break; }
    if (ls[3 + i] !== outer[i]) { err(`卦序 ${h.n} 外卦第 ${i + 1} 爻不符`); linesBad++; break; }
  }
});
if (!linesBad) ok('64 卦六爻自下而上均与内外卦定义一致');

// 雷火丰专项：上震下离 → 自下而上 101100；若显示成 001101 即为火山旅（上离下艮）
const feng = D.HEXAGRAMS.find((h) => h.name === '雷火丰');
const fengLines = D.getSixLines(feng);
if (fengLines.join('') === '101100') {
  ok('雷火丰 ䷶ 上震下离，六爻自下而上为 101100（与火山旅 001101 判然有别）');
} else {
  err(`雷火丰六爻应为 101100，实为 ${fengLines.join('')}`);
}
const lv = D.HEXAGRAMS.find((h) => h.name === '火山旅');
if (D.getSixLines(lv).join('') === '001101') ok('火山旅 ䷷ 上离下艮，六爻为 001101');
else err('火山旅六爻应为 001101');

console.log('\n=== 3. 爻题格式 ===');
const cases = [
  [1, true, '初九'], [1, false, '初六'],
  [2, true, '九二'], [2, false, '六二'],
  [3, true, '九三'], [3, false, '六三'],
  [4, true, '九四'], [4, false, '六四'],
  [5, true, '九五'], [5, false, '六五'],
  [6, true, '上九'], [6, false, '上六']
];
let titleBad = 0;
cases.forEach(([idx, isYang, expect]) => {
  const got = H.yaoTitle(isYang, idx - 1);
  if (got !== expect) { err(`第 ${idx} 爻爻题应为「${expect}」，实为「${got}」`); titleBad++; }
});
if (!titleBad) ok('十二种爻题格式全部合《周易》通例（初九/初六…上九/上六）');

console.log('\n=== 4. 动爻与变卦 ===');
// 逐卦逐爻验证：动爻标记唯一、变卦阴阳推算正确
let mvBad = 0;
D.HEXAGRAMS.forEach((h) => {
  for (let ml = 1; ml <= 6; ml++) {
    const r = H.numberHexagram(
      D.TRIGRAM_KEYS.indexOf(h.upper) + 1,
      D.TRIGRAM_KEYS.indexOf(h.lower) + 1
    );
    // 手动重算变卦：动爻阴阳反转
    const cl = r.lines.slice();
    cl[ml - 1] = cl[ml - 1] === 1 ? 0 : 1;
    r.movingLine = ml;
    r.movingLines = [ml];
    r.changedLines = cl;

    const rd = H.buildReading(r);
    const moving = rd.yaoList.filter((y) => y.isMoving);
    if (moving.length !== 1 || moving[0].index !== ml) {
      err(`卦序 ${h.n} 动爻 ${ml} 标记异常`); mvBad++;
    }
    if (rd.yaoList[ml - 1].changedTo !== (cl[ml - 1] === 1 ? '阳' : '阴')) {
      err(`卦序 ${h.n} 动爻 ${ml} 变爻阴阳标注错误`); mvBad++;
    }
    // 非动爻的爻不得被标为动
    rd.yaoList.forEach((y) => {
      if (y.index !== ml && y.isMoving) { err(`卦序 ${h.n} 爻 ${y.index} 误标为动爻`); mvBad++; }
    });
    if (mvBad > 5) break;
  }
});
if (!mvBad) ok('64 卦逐爻动爻标记与变卦阴阳推算全部正确');

console.log('\n=== 5. 爻序显示方向（DOM 顺序）===');
// 网页版 renderYao 按 i = 5..0 插入，故 DOM 首个元素必须是上爻
const sampleResult = H.numberHexagram(4, 3);   // 上震下离 = 雷火丰
const sample = H.buildReading(sampleResult);
const domOrder = [];
for (let i = 5; i >= 0; i--) domOrder.push(sample.yaoList[i]);
const domYang = domOrder.map((y) => (y.isYang ? 1 : 0)).join('');
const expectDom = D.getSixLines(sampleResult.hex).slice().reverse().join('');
if (domYang === expectDom) {
  ok(`DOM 自上而下为 ${domYang}，与「上爻在上」一致（雷火丰 ䷶ 显示为上震下离）`);
} else {
  err(`DOM 顺序 ${domYang} 与期望 ${expectDom} 不符，爻图会上下颠倒`);
}
// CSS 不得再用 column-reverse（二次反转）
const fs = require('fs');
const path = require('path');
const cssPath = path.join(__dirname, '..', 'web', 'css', 'style.css');
const css = fs.readFileSync(cssPath, 'utf8');
const figBlock = (css.match(/\.yao-figure\s*\{[^}]*\}/) || [''])[0];
if (/column-reverse/.test(figBlock)) {
  err('.yao-figure 仍含 column-reverse，会与 renderYao 的倒序插入叠加成二次反转');
} else {
  ok('.yao-figure 未使用 column-reverse，与 renderYao 的插入方向一致');
}

console.log('\n=== 汇总 ===');
console.log(`  通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
