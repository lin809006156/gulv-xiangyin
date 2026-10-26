/**
 * 古律象音 · 学易页
 * ---------------------------------------------------------------
 * 九章折叠内容，全部取自 core（与网页版同源）：
 * 易之生成 / 八卦速查 / 六十四卦 / 按上下卦找卦 / 起卦与卜筮 /
 * 五音与十二律 / 爻位与变卦 / 八音配卦 / 所据典籍。
 */

'use strict';

const D = require('../../core/data.js');
const C = require('../../core/classics.js');
const store = require('../../utils/storage.js');
const mini = require('../../utils/miniplayer.js');

const app = getApp();
const OPEN_KEY = 'gulv-xiangyin-learn-open';

Page({
  ...mini.methods,
  data: {
    ...mini.data,
    open: { origin: false, trigrams: false, hex64: false, finder: false, divination: false, tones: false, yao: false, tone8: false, books: false },
    siXiang: [
      { name: '老阳', broken: false },
      { name: '少阳', broken: true },
      { name: '少阴', broken: true },
      { name: '老阴', broken: false }
    ],
    trigrams: [],
    triNames: [],
    upperIdx: 0,
    lowerIdx: 0,
    found: null,
    hexList: [],
    hexKw: '',
    fiveTones: [],
    twelveLv: [],
    eightTone: [],
    books: []
  },

  onLoad() {
    this.miniBind();
    this.setData(this.buildData());
    this.restoreOpen();
  },

  onUnload() { this.miniUnbind(); },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(2);
    }
  },

  /* =============================================================
   * 数据装配
   * ============================================================= */

  buildData() {
    // 八卦速查
    const trigrams = [];
    const triNames = [];
    const tkeys = Object.keys(D.TRIGRAMS);
    for (let i = 0; i < tkeys.length; i++) {
      const t = D.TRIGRAMS[tkeys[i]];
      trigrams.push({
        key: t.key, name: t.name, symbol: t.symbol,
        nature: t.nature, wuxing: t.wuxing, image: t.image
      });
      triNames.push(t.name + '（' + t.symbol + '）');
    }
    // 五音
    const fiveTones = [];
    const fkeys = Object.keys(C.FIVE_TONE || {});
    for (let i = 0; i < fkeys.length; i++) {
      const f = C.FIVE_TONE[fkeys[i]];
      fiveTones.push({
        name: f.name,
        clear: f.clear || f.clearness || '',
        desc: f.desc || ''
      });
    }
    // 十二律
    const twelveLv = (D.TWELVE_LV || []).map((l) => ({ name: l.name, semi: l.semi }));
    // 八音配卦
    const eightTone = [];
    const ekeys = Object.keys(D.EIGHT_TONE || {});
    for (let i = 0; i < ekeys.length; i++) {
      const e = D.EIGHT_TONE[ekeys[i]];
      const tri = D.TRIGRAMS[e.trigram] || {};
      eightTone.push({
        key: ekeys[i], name: e.name, material: e.material,
        guaName: tri.name || '', desc: e.desc || ''
      });
    }
    // 所据典籍
    const books = [
      { name: '《周易·系辞》', use: '太极生两仪四象八卦；爻位与卦德之总纲。' },
      { name: '《说卦传》', use: '八卦万物类象与卦德；本应用物象取象的第一依据。' },
      { name: '《礼记·乐记》', use: '五音（宫商角徵羽）清浊次第与八音之属；伴奏层次的依据。' },
      { name: '《白虎通疏证·礼乐》', use: '八音配八卦；清人陈立补证「箫为巽音、磬为坤音」。' },
      { name: '《梅花易数》', use: '时间起卦与物象取卦之法。' },
      { name: '《黄帝内经·素问》', use: '五音与五脏、五季的古代音律对应（仅作文化陈述，不涉疗效）。' }
    ];
    return {
      trigrams, triNames, fiveTones, twelveLv, eightTone, books,
      hexList: this.buildHexList('')
    };
  },

  buildHexList(kw) {
    const list = [];
    const hexes = D.HEXAGRAMS || [];
    for (let i = 0; i < hexes.length; i++) {
      const h = hexes[i];
      if (kw && h.name.indexOf(kw) < 0) continue;
      list.push({ n: h.n, name: h.name, symbol: h.symbol });
    }
    return list;
  },

  /* =============================================================
   * 交互
   * ============================================================= */

  toggle(e) {
    const key = e.currentTarget.dataset.key;
    const open = Object.assign({}, this.data.open);
    open[key] = !open[key];
    this.setData({ open: open });
    const pref = store.loadPref() || {};
    pref.learnOpen = open;
    store.savePref(pref);
  },

  restoreOpen() {
    const pref = store.loadPref() || {};
    if (pref.learnOpen) this.setData({ open: pref.learnOpen });
  },

  onHexSearch(e) {
    const kw = (e.detail.value || '').trim();
    this.setData({ hexKw: kw, hexList: this.buildHexList(kw) });
  },

  goDetail(e) {
    const n = Number(e.currentTarget.dataset.n);
    const result = app.globalData.currentResult;
    wx.navigateTo({ url: '/pages/detail/detail?n=' + n });
  },

  onUpper(e) {
    const idx = Number(e.detail.value);
    this.setData({ upperIdx: idx });
    this.updateFound(idx, this.data.lowerIdx);
  },

  onLower(e) {
    const idx = Number(e.detail.value);
    this.setData({ lowerIdx: idx });
    this.updateFound(this.data.upperIdx, idx);
  },

  updateFound(upperIdx, lowerIdx) {
    const tkeys = Object.keys(D.TRIGRAMS);
    const up = D.TRIGRAMS[tkeys[upperIdx]];
    const low = D.TRIGRAMS[tkeys[lowerIdx]];
    if (!up || !low) return;
    const idx = D.findHexagramIndex ? D.findHexagramIndex(up.key, low.key) : -1;
    let found = null;
    const h = idx >= 0 ? (D.HEXAGRAMS || [])[idx] : null;
    if (h) found = { name: h.name, symbol: h.symbol, xiang: h.xiang || '' };
    this.setData({ found: found });
  },

  onShareAppMessage() {
    return { title: '古律象音 · 易之生成与六十四卦', path: '/pages/learn/learn' };
  }
});
