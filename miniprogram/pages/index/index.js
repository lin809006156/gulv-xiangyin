/**
 * 古律象音 · 首页（起卦）
 * ---------------------------------------------------------------
 * 三种起卦方式：每日一卦 / 观象起卦 / 数字起卦
 * 起卦后展示卦象与心音播放器
 */

'use strict';

const D = require('../../core/data.js');
const H = require('../../core/hexagram.js');
const M = require('../../core/music.js');
const store = require('../../utils/storage.js');

const app = getApp();
const mini = require('../../utils/miniplayer.js');

Page({
  ...mini.methods,
  data: {
    // 起卦方式
    mode: 'daily',
    modes: [
      { key: 'daily', label: '每日一卦' },
      { key: 'image', label: '观象起卦' },
      { key: 'number', label: '数字起卦' }
    ],

    dateCn: '',
    dateNum: '',
    dailyNote: '',

    // 物象选择
    imageGroups: [],
    selectedImage: null,
    selectedImageName: '未选择',
    selectedImageGua: '',

    // 数字起卦
    numUpper: 17,
    numLower: 43,

    // 卦象结果
    hasResult: false,
    symbol: '',
    name: '',
    structure: '',
    virtue: '',
    methodText: '',
    gua: '',
    xiang: '',
    hint: '',
    movingText: '',
    changedText: '',
    yaoList: [],

    // 音乐参数
    musicParams: [],

    // 播放
    isPlaying: false,
    loopOn: false,
    playerTip: '点击播放，生成属于这一卦的心音',
    progressPercent: 0,
    playerTime: '00:00 / 00:00',
    sections: []
  },

  onLoad() {
    this.miniBind();
    this.initData();
    this.castDaily();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(0);
    }
    // 从详情页返回时同步播放状态
    const p = app.globalData.player;
    if (p) {
      this.setData({ isPlaying: !!p.isPlaying, loopOn: !!p.loop });
    }
  },

  onUnload() { this.miniUnbind();
    // 离开首页不停止播放，允许跨页续听
  },

  /* =============================================================
   * 初始化
   * ============================================================= */

  initData() {
    const now = new Date();
    this.setData({
      dateCn: store.formatCnDate(now),
      dateNum: `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`,
      imageGroups: D.IMAGE_LIBRARY.map((g) => ({
        category: g.category,
        items: g.items.map((it) => ({
          name: it.name,
          gua: it.gua,
          guaName: D.TRIGRAMS[it.gua].name,
          attribute: D.TRIGRAMS[it.gua].attribute
        }))
      }))
    });
    this.updateDailyNote();
  },

  updateDailyNote() {
    const d = new Date();
    const yearZhi = H.getYearZhiIndex(d);
    const detail = H.timeHexagram(d).detail;
    this.setData({
      dailyNote: `年支${H.ZHI_ORDER[yearZhi - 1]} · ${detail.month}月${detail.day}日 · ${detail.shi}时　→　上卦数 ${detail.upperNum}，下卦数 ${detail.lowerNum}，动爻 ${detail.movingLine}`
    });
  },

  /* =============================================================
   * 起卦方式切换
   * ============================================================= */

  onModeChange(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  /* =============================================================
   * 物象选择
   * ============================================================= */

  onImageSelect(e) {
    const { name, gua } = e.currentTarget.dataset;
    const t = D.TRIGRAMS[gua];
    this.setData({
      selectedImage: { name, gua },
      selectedImageName: name,
      selectedImageGua: `属${t.name}卦 · ${t.attribute}`
    });
  },

  /* =============================================================
   * 数字输入
   * ============================================================= */

  onNumInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value });
  },

  /* =============================================================
   * 起卦
   * ============================================================= */

  castDaily() {
    this.present(H.dailyHexagram(new Date()));
  },

  castImage() {
    const sel = this.data.selectedImage;
    if (!sel) {
      wx.showToast({ title: '请先选择物象', icon: 'none' });
      return;
    }
    this.present(H.imageHexagram(sel.name, sel.gua, new Date()));
  },

  castNumber() {
    const a = parseInt(this.data.numUpper, 10);
    const b = parseInt(this.data.numLower, 10);
    if (!a || !b || a < 1 || b < 1) {
      wx.showToast({ title: '请输入有效数字', icon: 'none' });
      return;
    }
    this.present(H.numberHexagram(a, b));
  },

  /**
   * 展示卦象
   */
  present(result) {
    const reading = H.buildReading(result);
    const music = result.music;
    const score = M.composeNotes(result.hex, music, result.changedMusic);

    app.globalData.currentResult = result;
    app.globalData.currentScore = score;

    // 爻位图形数据（自上而下：上爻 → 初爻）
    const yaoList = [];
    for (let i = 5; i >= 0; i--) {
      const yao = reading.yaoList[i];
      yaoList.push({
        title: yao.title,
        isYang: yao.isYang,
        isMoving: yao.isMoving,
        changed: yao.isMoving && result.changedLines[i] !== (yao.isYang ? 1 : 0)
      });
    }

    // 音乐参数
    const musicParams = [
      { label: '调式', value: music.modeName, sub: music.modeMood },
      { label: '律', value: music.lvName },
      { label: '主音', value: 'MIDI ' + music.rootMidi, sub: this.freqName(music.rootMidi) },
      { label: '音色', value: music.voiceText },
      { label: '速度', value: music.tempo, sub: 'BPM' },
      { label: '卦德', value: music.virtue }
    ];

    // 段落刻度
    const names = { intro: '起', theme: '承', variation: '转', coda: '合' };
    const sections = Object.keys(score.sections).map((k) => ({
      label: names[k],
      left: (score.sections[k].start / score.duration * 100).toFixed(2)
    }));

    this.setData({
      hasResult: true,
      symbol: reading.symbol,
      name: reading.name,
      structure: reading.structure,
      virtue: reading.virtue,
      methodText: reading.methodText,
      gua: reading.gua,
      xiang: reading.xiang,
      hint: reading.hint,
      movingText: `${reading.yaoList[reading.movingLine - 1].title}　${reading.movingText}`,
      changedText: reading.changedText,
      yaoList,
      musicParams,
      sections,
      isPlaying: false,
      progressPercent: 0,
      playerTime: `00:00 / ${store.fmtTime(score.duration)}`,
      playerTip: '点击播放，生成属于这一卦的心音'
    });

    this.saveHistory(reading, result);
  },

  freqName(midi) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  },

  /* =============================================================
   * 播放
   * ============================================================= */

  togglePlay() {
    const p = app.globalData.player;
    if (!p) return;

    if (this.data.isPlaying) {
      p.stop();
      this.setData({ isPlaying: false, progressPercent: 0 });
      return;
    }

    const score = app.globalData.currentScore;
    if (!score) return;

    this.setData({ playerTip: '正在生成音频…' });
    p.play(score, { offset: 0 });
    this.setData({ isPlaying: true });
  },

  /** 切换循环播放 */
  toggleLoop() {
    const p = app.globalData.player;
    if (!p) return;
    const on = p.toggleLoop();
    this.setData({
      loopOn: on,
      playerTip: on
        ? '已开启循环：此卦之音将反复播放。'
        : '已关闭循环。'
    });
  },

  onPlayerProgress(elapsed, duration) {
    if (!this.data.isPlaying) return;
    this.setData({
      progressPercent: duration > 0 ? (elapsed / duration * 100).toFixed(2) : 0,
      playerTime: `${store.fmtTime(elapsed)} / ${store.fmtTime(duration)}`
    });
  },

  onPlayerEnd() {
    this.setData({
      isPlaying: false,
      progressPercent: 0,
      playerTime: `00:00 / ${store.fmtTime(
        (app.globalData.currentScore || {}).duration || 0
      )}`,
      playerTip: '心音已止。可再听一遍，或换一个物象起卦。'
    });
  },

  onPlayerState(state, progress) {
    if (state === 'rendering') {
      this.setData({
        playerTip: progress !== undefined
          ? `正在生成音频… ${progress}%`
          : '正在生成音频…'
      });
    } else if (state === 'playing') {
      this.setData({ playerTip: '正在播放——这一段心音由本卦卦象生成。' });
    }
  },

  /* =============================================================
   * 卦历
   * ============================================================= */

  saveHistory(reading, result) {
    const list = store.loadHistory();
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${reading.n}`;
    const filtered = list.filter((h) => h.key !== key);
    filtered.unshift({
      key,
      n: reading.n,
      name: reading.name,
      symbol: reading.symbol,
      hint: reading.hint,
      method: reading.methodText,
      image: (result.detail && result.detail.imageName) || '',
      date: `${now.getMonth() + 1}月${now.getDate()}日`,
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    });
    store.saveHistory(filtered);
  },

  /* =============================================================
   * 导航
   * ============================================================= */

  goDetail() {
    if (!this.data.hasResult) {
      wx.showToast({ title: '请先起卦', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/detail/detail' });
  },

  goCalendar() {
    wx.navigateTo({ url: '/pages/calendar/calendar' });
  },

  shareApp() {
    const name = this.data.name || '古律象音';
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] });
  },

  /** 去音乐栏 */
  goMusic() {
    wx.switchTab({ url: '/pages/music/music' });
  },

  /** 去学易栏 */
  goLearn() {
    wx.switchTab({ url: '/pages/learn/learn' });
  },


  onShareAppMessage() {
    const name = this.data.name || '古律象音';
    const hint = this.data.hint || '观身边之物，每日起一卦';
    return {
      title: `今日之卦 · ${name}`,
      desc: hint
    };
  }
});
