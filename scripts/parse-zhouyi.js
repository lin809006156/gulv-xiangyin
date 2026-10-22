/**
 * 解析 ctext 抓取的《周易》原文，产出结构化 JSON
 * ---------------------------------------------------------------
 * 每卦：{ n, name, gua, tuan, xiang, yao: [6], yaoXiang: [6], yong }
 *   gua      卦辞
 *   tuan     彖传
 *   xiang    大象传
 *   yao      六爻爻辞（自下而上：初、二、三、四、五、上）
 *   yaoXiang 六爻小象（象曰），与 yao 一一对应
 *   yong     用九 / 用六（仅乾坤两卦有）
 *
 * 同时把繁体转简体（opencc-js），与项目其余文本保持一致。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const OpenCC = require('opencc-js');

const RAW = path.join(__dirname, '.cache', 'zhouyi-raw.json');
const URLS = path.join(__dirname, '.cache', 'zhouyi-urls.json');
const OUT = path.join(__dirname, '.cache', 'zhouyi.json');

const cc = OpenCC.Converter({ from: 'tw', to: 'cn' });
const s2t = (s) => (s ? cc(s) : '');

/* 卦符（U+4DC0 起的六十四卦卦画字符）——目录页上「䷀乾」这样的链接文本才是卦页 */
const HEX_SYM = /[\u4DC0-\u4DFF]/;

/* 通行卦序的 64 个卦符（U+4DC0 递增），用于把抓到的页对上卦序 */
const HEX_CHARS = Array.from({ length: 64 }, (_, i) => String.fromCodePoint(0x4DC0 + i));

/* 卦名（简体）——与 core/data.js 的 HEXAGRAMS 同序 */
const NAMES = [
  '乾为天', '坤为地', '水雷屯', '山水蒙', '水天需', '天水讼', '地水师', '水地比',
  '风天小畜', '天泽履', '地天泰', '天地否', '天火同人', '火天大有', '地山谦', '雷地豫',
  '泽雷随', '山风蛊', '地泽临', '风地观', '火雷噬嗑', '山火贲', '山地剥', '地雷复',
  '天雷无妄', '山天大畜', '山雷颐', '泽风大过', '坎为水', '离为火', '泽山咸', '雷风恒',
  '天山遁', '雷天大壮', '火地晋', '地火明夷', '风火家人', '火泽睽', '水山蹇', '雷水解',
  '山泽损', '风雷益', '泽天夬', '天风姤', '泽地萃', '地风升', '泽水困', '水风井',
  '泽火革', '火风鼎', '震为雷', '艮为山', '风山渐', '雷泽归妹', '雷火丰', '火山旅',
  '巽为风', '兑为泽', '风水涣', '水泽节', '风泽中孚', '雷山小过', '水火既济', '火水未济'
];

/* 爻题：初九 / 六二 / 九三 / 六四 / 九五 / 上六 / 用九 / 用六
   注意爻题是「阴阳在前、位次在后」（九二、六四），不是「二九」
   分隔符多为「：」，少数卦作「，」（如咸卦「初六，咸其拇」），故两者都收 */
const YAO_HEAD = /^(初[九六]|[九六][二三四五]|上[九六]|用[九六])\s*[：:，,]\s*(.+)$/;

/**
 * ctext 的页面结构（每卦）：
 *   ䷀乾:                 卦符标题（卦辞）
 *   乾：元亨，利貞。        ← 卦辞
 *   彖傳: / 大哉乾元……     ← 彖传
 *   象傳: / 天行健……        ← 大象传（整卦只有一次）
 *   ䷀乾:                 卦符标题（爻辞）
 *   初九：潛龍，勿用。      ← 爻辞
 *   象傳: / 潛龍勿用……      ← 小象（每爻一次，共 6 次）
 *
 * 因此：第一次出现的「象傳:」是大象传，其后 6 次是小象。
 */
function parseText(text) {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  // 只取中文行（英文译文行跳过）
  const zh = lines.filter((l) => /[一-鿿]/.test(l));

  const out = { gua: '', tuan: '', xiang: '', yao: [], yaoXiang: [], yong: '' };
  let mode = null;        // 'gua' | 'tuan' | 'xiang' | 'yao' | 'yaoXiang'
  let xiangSeen = 0;      // 已见「象傳:」的次数：1 = 大象，2..7 = 六爻小象
  let lastWasXiangLabel = false;

  for (let i = 0; i < zh.length; i++) {
    const l = zh[i];
    if (l === '打開字典' || l === '顯示相似段落' || l === '英文翻譯：理雅各（James Legge）[?]') continue;
    if (l === '彖傳:') { mode = 'tuan'; continue; }
    if (l === '象傳:') {
      xiangSeen++;
      mode = xiangSeen === 1 ? 'xiang' : 'yaoXiang';
      lastWasXiangLabel = true;
      continue;
    }
    // 卦符标题行，如「䷀乾:」
    if (HEX_SYM.test(l) && /[：:]$/.test(l)) {
      const nx = zh[i + 1] || '';
      if (YAO_HEAD.test(nx)) { mode = 'yao'; lastWasXiangLabel = false; continue; }
      if (!out.gua) { mode = 'gua'; lastWasXiangLabel = false; continue; }
    }

    if (mode === 'gua') {
      if (!out.gua && l.length > 3) out.gua = l;
    } else if (mode === 'tuan') {
      if (!out.tuan && l.length > 6) out.tuan = l;
    } else if (mode === 'xiang') {
      if (!out.xiang && l.length > 4) out.xiang = l;
    } else if (mode === 'yao') {
      const m = l.match(YAO_HEAD);
      if (m) {
        const body = m[2];
        if (/^用[九六]/.test(m[1])) {
          out.yong = (m[1] + '：' + body).trim();
        } else {
          out.yao.push({ head: m[1], text: body });
        }
      }
    } else if (mode === 'yaoXiang') {
      if (out.yao.length && out.yaoXiang.length < out.yao.length && l.length > 3) {
        out.yaoXiang.push(l);
      }
    }
  }
  return out;
}

function main() {
  const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
  const links = JSON.parse(fs.readFileSync(URLS, 'utf8'));

  /* 目录页里带卦符的链接即 64 个卦页；卦符本身决定卦序，不靠拼音猜 */
  const bySym = {};
  const seen = new Set();
  links.forEach((l) => {
    const t = (l.text || '').trim();
    const m = t.match(HEX_SYM);
    if (!m) return;
    const sym = m[0];
    const key = l.href.replace(/^\//, '').split('/')[1];
    if (seen.has(key)) return;
    seen.add(key);
    if (bySym[sym] === undefined) bySym[sym] = key;
  });

  const missingSym = HEX_CHARS.filter((c) => !bySym[c]);
  if (missingSym.length) {
    console.log('目录页缺卦符页：', missingSym.map((c) => 'U+' + c.codePointAt(0).toString(16)).join(' '));
  }

  const result = [];
  const problems = [];
  HEX_CHARS.forEach((sym, i) => {
    const name = NAMES[i];
    const key = bySym[sym];
    if (!key) { problems.push(`第 ${i + 1} 卦 ${name}：目录页无此卦`); return; }
    const rec = raw[key];
    if (!rec) { problems.push(`第 ${i + 1} 卦 ${name}：未抓到 ${key}`); return; }
    const p = parseText(rec.text);
    if (p.yao.length < 6) problems.push(`第 ${i + 1} 卦 ${name}（${key}）：爻辞仅 ${p.yao.length} 条`);
    if (p.yaoXiang.length < 6) problems.push(`第 ${i + 1} 卦 ${name}（${key}）：小象仅 ${p.yaoXiang.length} 条`);
    if (!p.gua) problems.push(`第 ${i + 1} 卦 ${name}（${key}）：缺卦辞`);
    if (!p.xiang) problems.push(`第 ${i + 1} 卦 ${name}（${key}）：缺大象`);
    result.push({
      n: i + 1,
      name,
      sym,
      key,
      gua: s2t(p.gua),
      tuan: s2t(p.tuan),
      xiang: s2t(p.xiang),
      yao: p.yao.map((y) => ({ head: s2t(y.head), text: s2t(y.text) })),
      yaoXiang: p.yaoXiang.map((x) => s2t(x)),
      yong: s2t(p.yong)
    });
  });

  fs.writeFileSync(OUT, JSON.stringify(result, null, 1), 'utf8');
  console.log('解析完成：', result.length, '卦 →', OUT);
  if (problems.length) {
    console.log('问题 ' + problems.length + ' 项：');
    problems.slice(0, 20).forEach((p) => console.log('  ·', p));
  }
  // 抽样
  const q = result[0];
  if (q) {
    console.log('\n抽样 乾卦：');
    console.log('  卦辞:', q.gua);
    console.log('  大象:', q.xiang);
    q.yao.forEach((y, i) => console.log(`  ${y.head}：${y.text}　〔象曰：${q.yaoXiang[i] || '—'}〕`));
    console.log('  用九:', q.yong);
  }
}

main();