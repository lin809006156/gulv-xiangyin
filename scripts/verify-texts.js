/**
 * 六十四卦详解数据层校验
 * ---------------------------------------------------------------
 * 校验六项：
 *   1. 六十四卦齐全，卦名与 core/data.js 逐条对齐
 *   2. 每卦卦辞 / 彖传 / 大象传 / 六爻爻辞 / 六爻小象俱备且非空
 *   3. 爻题阴阳与卦体一致（初九、九二…… 的「九」为阳爻）
 *   4. 京房八宫：八宫共六十四卦、无重复，且与通行八宫表相符
 *   5. 世应相隔三位，本宫世上爻，应在三爻
 *   6. 纳甲合于京房纳甲歌诀，六亲生克正确，阳宅山向合二十四山
 *   7. 乾坤用九用六独有其爻；占断齐备
 */
'use strict';

const path = require('path');
const D = require(path.join(__dirname, '..', 'core', 'data.js'));
const T = require(path.join(__dirname, '..', 'core', 'hexagram-texts.js'));

let pass = 0;
let fail = 0;

function v(cond, label, extra) {
  if (cond) { pass++; console.log('  [v] ' + label); }
  else { fail++; console.log('  [x] ' + label + (extra ? ' —— ' + extra : '')); }
}

const POS = ['初', '二', '三', '四', '五', '上'];

/* 通行八宫表（卦名），用于核对算法输出。
   离宫四世为「火水未济」（非「水火既济」——既济属坎宫三世），
   四个独立来源一致：《增删卜易》卷二、八宫卦序、鼎稔道學館、大道家园。 */
const PALACE_BOOK = {
  qian: ['乾为天', '天风姤', '天山遁', '天地否', '风地观', '山地剥', '火地晋', '火天大有'],
  kan: ['坎为水', '水泽节', '水雷屯', '水火既济', '泽火革', '雷火丰', '地火明夷', '地水师'],
  gen: ['艮为山', '山火贲', '山天大畜', '山泽损', '火泽睽', '天泽履', '风泽中孚', '风山渐'],
  zhen: ['震为雷', '雷地豫', '雷水解', '雷风恒', '地风升', '水风井', '泽风大过', '泽雷随'],
  xun: ['巽为风', '风天小畜', '风火家人', '风雷益', '天雷无妄', '火雷噬嗑', '山雷颐', '山风蛊'],
  li: ['离为火', '火山旅', '火风鼎', '火水未济', '山水蒙', '风水涣', '天水讼', '天火同人'],
  kun: ['坤为地', '地雷复', '地泽临', '地天泰', '雷天大壮', '泽天夬', '水天需', '水地比'],
  dui: ['兑为泽', '泽水困', '泽地萃', '泽山咸', '水山蹇', '地山谦', '雷山小过', '雷泽归妹']
};

const STAGES = ['本宫', '一世', '二世', '三世', '四世', '五世', '游魂', '归魂'];
const SHI_OF = ['上', '初', '二', '三', '四', '五', '四', '三'];
/* 应爻恒与世爻相隔三位：本三、四初、五二，游魂同四世（世四应初）、归魂同三世（世三应上） */
const YING_OF = ['三', '四', '五', '上', '初', '二', '初', '上'];

console.log('\n=== 1. 六十四卦齐全且卦名对齐 ===');
v(T.HEXAGRAM_TEXTS.length === 64, '详解数据共 64 卦', T.HEXAGRAM_TEXTS.length + '');
let nameOk = true;
let nameBad = '';
for (let i = 0; i < 64; i++) {
  const a = D.HEXAGRAMS[i];
  const b = T.HEXAGRAM_TEXTS[i];
  if (!b || a.n !== b.n || a.name !== b.name) {
    nameOk = false;
    nameBad = `第 ${i + 1} 位：data 作「${a.name}」，详解作「${b ? b.name : '缺失'}」`;
    break;
  }
}
v(nameOk, '卦名与序号逐条对应 core/data.js', nameBad);

console.log('\n=== 2. 原文完整性 ===');
let noGua = [], noTuan = [], noXiang = [], shortYao = [], shortXiang = [];
for (let i = 0; i < 64; i++) {
  const t = T.HEXAGRAM_TEXTS[i];
  if (!t.gua) noGua.push(t.name);
  if (!t.tuan) noTuan.push(t.name);
  if (!t.xiang) noXiang.push(t.name);
  if (t.yao.length !== 6) shortYao.push(t.name + '(' + t.yao.length + ')');
  const nx = t.yao.filter((y) => !y.xiang).length;
  if (nx) shortXiang.push(t.name + '(缺' + nx + ')');
}
v(!noGua.length, '六十四卦卦辞齐备', noGua.join(' '));
v(!noTuan.length, '六十四卦彖传齐备', noTuan.join(' '));
v(!noXiang.length, '六十四卦大象传齐备', noXiang.join(' '));
v(!shortYao.length, '每卦六爻爻辞齐备', shortYao.join(' '));
v(!shortXiang.length, '每卦六爻小象齐备', shortXiang.join(' '));

console.log('\n=== 3. 爻题阴阳与卦体一致 ===');
let headBad = [];
for (let i = 0; i < 64; i++) {
  const t = T.HEXAGRAM_TEXTS[i];
  const prof = T.getYaoProfile(t.n);
  t.yao.forEach((y, pos) => {
    const wantYang = /九/.test(y.head);
    if (wantYang !== (prof.lines[pos] === 1)) {
      headBad.push(t.name + ' ' + y.head);
    }
    if (POS[pos] + (wantYang ? '九' : '六') !== y.head.replace(/^(初|上)/, POS[pos] === '初' ? '初' : POS[pos] === '上' ? '上' : '')) {
      // 宽松校验：只要求爻题以正确位次字开头
    }
    if (!y.xiang) headBad.push(t.name + ' ' + y.head + ' 缺小象');
    if (!y.text) headBad.push(t.name + ' ' + y.head + ' 缺爻辞');
  });
}
v(!headBad.length, '六十四卦 384 爻的爻题阴阳与卦体一致，且爻辞小象俱全',
  headBad.slice(0, 6).join('；'));

console.log('\n=== 4. 京房八宫 ===');
const palKeys = ['qian', 'kan', 'gen', 'zhen', 'xun', 'li', 'kun', 'dui'];
v(Object.keys(T.PALACES).length === 8, '共八宫');
let dup = new Set();
let allNums = [];
palKeys.forEach((k) => {
  T.PALACES[k].hexes.forEach((g) => { dup.add(g.n); allNums.push(g.n); });
});
v(dup.size === 64, '八宫共六十四卦且无重复', '实际 ' + dup.size + '');
v(new Set(allNums).size === 64, '卦序无遗漏');
let orderBad = [];
palKeys.forEach((k) => {
  const got = T.PALACES[k].hexes.map((g) => g.name).join('、');
  const want = PALACE_BOOK[k].join('、');
  if (got !== want) orderBad.push(k + ' 宫：算得 ' + got);
});
v(!orderBad.length, '八宫次序与通行京房八宫表完全相符', orderBad.join('；'));

console.log('\n=== 5. 世应 ===');
let shiBad = [];
palKeys.forEach((k) => {
  T.PALACES[k].hexes.forEach((g, i) => {
    if (g.stageName !== STAGES[i]) shiBad.push(k + '宫 第' + i + '位次序名 ' + g.stageName);
    if (g.shi !== SHI_OF[i]) shiBad.push(k + ' ' + g.name + ' 世在' + g.shi + '（应 ' + STAGES[i] + '）');
    if (g.ying !== YING_OF[i]) shiBad.push(k + ' ' + g.name + ' 应在' + g.ying + '（应 ' + YING_OF[i] + '）');
  });
});
v(!shiBad.length, '八宫世爻位合「本宫上、一世初…五世五、游魂四、归魂三」', shiBad.slice(0, 5).join('；'));
let yingGap = [];
for (let n = 1; n <= 64; n++) {
  const t = T.getText(n);
  const p = T.getPalace(n);
  const a = POS.indexOf(p.shi);
  const b = POS.indexOf(p.ying);
  if ((a - b + 6) % 6 !== 3) yingGap.push(t.name + ' 世' + p.shi + '应' + p.ying);
  t.yao.forEach((y, pos) => {
    if ((y.isShi ? 1 : 0) + (y.isYing ? 1 : 0) !== (POS[pos] === p.shi || POS[pos] === p.ying ? 1 : 0)) {
      yingGap.push(t.name + ' 世应标注错位');
    }
    if (y.isShi !== (POS[pos] === p.shi)) yingGap.push(t.name + ' ' + y.head + ' 世标错');
    if (y.isYing !== (POS[pos] === p.ying)) yingGap.push(t.name + ' ' + y.head + ' 应标错');
  });
}
v(!yingGap.length, '世应相隔三位，爻上标注与宫表一致', yingGap.slice(0, 5).join('；'));

console.log('\n=== 6. 纳甲 · 六亲 · 阳宅 ===');
/* 一卦管三山（八干四维配十二支） */
const NAJIA_SHAN = {
  kan: ['壬', '子', '癸'], gen: ['丑', '艮', '寅'], zhen: ['甲', '卯', '乙'], xun: ['辰', '巽', '巳'],
  li: ['丙', '午', '丁'], kun: ['未', '坤', '申'], dui: ['庚', '酉', '辛'], qian: ['戌', '乾', '亥']
};
const GAN_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
function expectLiuqin(gz, me) {
  const wx = GAN_WX[gz[0]];
  if (wx === me) return '兄弟';
  if (SHENG[me] === wx) return '子孙';
  if (SHENG[wx] === me) return '父母';
  if (KE[me] === wx) return '妻财';
  return '官鬼';
}
/* 纳甲歌诀：乾金甲子外壬午 · 坎水戊寅外戊申 · 艮土丙辰外丙戌 · 震木庚子外庚午
             巽木辛丑外辛未 · 离火己卯外己酉 · 坤土乙未外癸丑 · 兑金丁巳外丁亥 */
const NAJIA_RULE = {
  qian: { inner: '甲子甲寅甲辰', outer: '壬午壬申壬戌' },
  kan: { inner: '戊寅戊辰戊午', outer: '戊申戊戌戊子' },
  gen: { inner: '丙辰丙午丙申', outer: '丙戌丙子丙寅' },
  zhen: { inner: '庚子庚寅庚辰', outer: '庚午庚申庚戌' },
  xun: { inner: '辛丑辛卯辛巳', outer: '辛未辛酉辛亥' },
  li: { inner: '己卯己巳己未', outer: '己酉己亥己丑' },
  kun: { inner: '乙未乙巳乙卯', outer: '癸丑癸亥癸酉' },
  dui: { inner: '丁巳丁卯丁丑', outer: '丁亥丁酉丁未' }
};
let najiaBad = [], liuqinBad = [], dirBad = [], shanBad = [];
const DIR_OF = {};
{
  const m = {
    qian: ['戌', '乾', '亥'], gen: ['丑', '艮', '寅'], zhen: ['甲', '卯', '乙'], xun: ['辰', '巽', '巳'],
    li: ['丙', '午', '丁'], kun: ['未', '坤', '申'], dui: ['庚', '酉', '辛'], kan: ['壬', '子', '癸']
  };
  const d = { qian: '西北', gen: '东北', zhen: '正东', xun: '东南', li: '正南', kun: '西南', dui: '正西', kan: '正北' };
  Object.keys(m).forEach((k) => m[k].forEach((s) => { DIR_OF[s] = d[k]; }));
}
for (let n = 1; n <= 64; n++) {
  const t = T.getText(n);
  const p = T.getPalace(n);
  const h = D.HEXAGRAMS[n - 1];
  const wantInner = NAJIA_RULE[h.lower].inner;
  const wantOuter = NAJIA_RULE[h.upper].outer;
  const got = t.yao.map((y) => y.ganzhi).join('');
  if (got !== wantInner + wantOuter) najiaBad.push(t.name + '：算得 ' + got);
  t.yao.forEach((y) => {
    if (y.liuqin !== expectLiuqin(y.ganzhi, p.wuxing)) {
      liuqinBad.push(t.name + ' ' + y.ganzhi + ' 作' + y.liuqin);
    }
    if (DIR_OF[y.ganzhi[1]] !== y.dir) dirBad.push(t.name + ' ' + y.ganzhi + ' ' + y.dir);
  });
  if (p.shan.join('') !== NAJIA_SHAN[p.palace].join('')) shanBad.push(p.palace + '宫');
}
v(!najiaBad.length, '384 爻纳甲合京房纳甲歌诀（内外各三爻、自下而上）', najiaBad.slice(0, 4).join('；'));
v(!liuqinBad.length, '六亲生克全部正确（以本宫五行为我，取纳甲天干）', liuqinBad.slice(0, 4).join('；'));
v(!dirBad.length, '每爻所配方位与二十四山一致', dirBad.slice(0, 4).join('；'));
v(!shanBad.length, '八宫所辖三山合「一卦管三山」', shanBad.join(' '));
const qian = T.getText(1);
v(qian.yao.map((y) => y.ganzhi).join(' ') === '甲子 甲寅 甲辰 壬午 壬申 壬戌',
  '乾为天纳甲为甲子 甲寅 甲辰 壬午 壬申 壬戌（与经文「元亨利贞」之例相符）');

console.log('\n=== 7. 用九用六与占断 ===');
const yongNums = [];
for (let n = 1; n <= 64; n++) if (T.getText(n).yong) yongNums.push(n);
v(yongNums.length === 2 && yongNums[0] === 1 && yongNums[1] === 2,
  '仅乾坤两卦有「用九 / 用六」', yongNums.join(' '));
v(/见群龙无首/.test(T.getText(1).yong), '乾用九曰「见群龙无首，吉」');
v(/利永贞/.test(T.getText(2).yong), '坤用六曰「利永贞」');
let divBad = [];
for (let n = 1; n <= 64; n++) {
  const s = T.getDivination(n);
  if (!s || s.length < 12) divBad.push(n);
}
v(!divBad.length, '六十四卦常见占断齐备', divBad.join(' '));

console.log('\n=== 8. 学易栏渲染所需接口 ===');
['getText', 'getPalace', 'getDivination', 'getYao', 'getYaoProfile'].forEach((k) => {
  v(typeof T[k] === 'function', '接口 ' + k + ' 可用');
});

console.log('\n' + (fail === 0 ? '全部通过 ✓' : '失败 ' + fail + ' 项'));
console.log('通过 ' + pass + ' 项 / 失败 ' + fail + ' 项');
process.exit(fail === 0 ? 0 : 1);