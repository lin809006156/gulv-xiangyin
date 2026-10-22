/**
 * 卦象心音 · 卦象详情页
 * ---------------------------------------------------------------
 * 展示当前卦的完整信息：卦辞、大象、六爻详解、音乐构成
 */

'use strict';

const D = require('../../core/data.js');
const H = require('../../core/hexagram.js');
const M = require('../../core/music.js');
const store = require('../../utils/storage.js');

const app = getApp();

Page({
  data: {
    hasResult: false,
    symbol: '',
    name: '',
    n: 0,
    structure: '',
    virtue: '',
    gua: '',
    xiang: '',
    hint: '',
    upper: null,
    lower: null,
    yaoList: [],
    movingLine: 0,
    movingTitle: '',
    movingText: '',
    changedText: '',
    changedName: '',
    changedSymbol: '',
    musicParams: [],
    voiceText: '',
    // 文献依据
    classicsMethod: null,
    classicsImages: [],
    classicsTrigrams: [],
    classicsVoice: null,
    classicsMode: null,
    classicsDisclaimer: null
  },

  onLoad() {
    this.loadResult();
  },

  onShow() {
    this.loadResult();
  },

  /**
   * 从全局读取当前卦象
   */
  loadResult() {
    const result = app.globalData.currentResult;
    if (!result) {
      this.setData({ hasResult: false });
      return;
    }

    const reading = H.buildReading(result);
    const music = result.music;

    // 六爻详解（自上而下）
    const yaoList = [];
    for (let i = 5; i >= 0; i--) {
      const yao = reading.yaoList[i];
      yaoList.push({
        index: yao.index,
        title: yao.title,
        isYang: yao.isYang,
        isMoving: yao.isMoving,
        changed: yao.isMoving && result.changedLines[i] !== (yao.isYang ? 1 : 0),
        changedTo: yao.changedTo,
        // 爻位白话，取自卦德与爻位的关系
        position: this.yaoPosition(yao.index, yao.isYang)
      });
    }

    const musicParams = [
      { label: '调式', value: music.modeName, sub: music.modeMood },
      { label: '律', value: music.lvName },
      { label: '主音', value: 'MIDI ' + music.rootMidi },
      { label: '音色', value: music.voiceText, sub: music.voiceMaterial + '声' },
      { label: '速度', value: music.tempo + ' BPM' },
      { label: '密度', value: music.density },
      { label: '卦德', value: music.virtue },
      { label: '六音轮廓', value: music.melody.join(' · ') }
    ];

    // 文献依据：取象、卦德、乐器配卦、调式清浊，各标出处
    const panel = D.buildClassicsPanel(result, {
      imageName: result.detail && result.detail.imageName
    });

    this.setData({
      hasResult: true,
      symbol: reading.symbol,
      name: reading.name,
      n: reading.n,
      structure: reading.structure,
      virtue: reading.virtue,
      gua: reading.gua,
      xiang: reading.xiang,
      hint: reading.hint,
      upper: reading.upper,
      lower: reading.lower,
      yaoList,
      movingLine: reading.movingLine,
      movingTitle: reading.yaoList[reading.movingLine - 1].title,
      movingText: reading.movingText,
      changedText: reading.changedText,
      changedName: reading.changedHex ? reading.changedHex.name : '',
      changedSymbol: reading.changedHex ? reading.changedHex.symbol : '',
      musicParams,
      voiceText: music.voiceText,
      classicsMethod: panel.method,
      classicsImages: panel.images,
      classicsTrigrams: panel.trigrams,
      classicsVoice: panel.voice,
      classicsMode: panel.mode,
      classicsDisclaimer: panel.disclaimer
    });

    wx.setNavigationBarTitle({ title: reading.name });
  },

  /**
   * 爻位白话：由爻位序号与阴阳推导
   */
  yaoPosition(index, isYang) {
    const table = {
      1: '初爻居下，事物在起步，根基为先',
      2: '二爻得中，位置不偏，进退有据',
      3: '三爻居危，过刚则折，当知戒惧',
      4: '四爻近君，柔顺得位，宜谨守勿争',
      5: '五爻居尊，统领之位，当以中正为要',
      6: '上爻居极，盈满将至，宜知止而退'
    };
    const base = table[index] || '';
    return isYang ? base : base + '；阴爻柔顺，宜柔宜缓';
  },

  onShareAppMessage() {
    return {
      title: `今日之卦 · ${this.data.name}`,
      desc: this.data.hint
    };
  }
});
