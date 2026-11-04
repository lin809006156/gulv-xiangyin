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
    ...mini.data,
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
    this.applyDefaultMode();
    // 不自动取卦：进页面为空白态，由用户点「取今日之卦」触发
  },

  /** 按偏好切到默认起卦方式（在「我的 → 偏好设置」里设置） */
  applyDefaultMode() {
    const pref = store.loadPref() || {};
    const mode = pref.defaultCastMode;
    if (mode === 'image' || mode === 'number') {
      this.setData({ mode });
    }
  },

  onShow() {
    this.miniSync();
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
    this.setData({ dailyNote: '' });
  },

  /**
   * 起卦依据：用**该卦自己**的 detail。
   * 不可用 new Date() 的当前时辰重算 —— dailyHexagram 归零到当日子时，
   * 两者算出的卦数会对不上（实测午时显示风雷益、实取风水涣）。
   */
  updateDailyNote(detail) {
    if (!detail) { this.setData({ dailyNote: '' }); return; }
    this.setData({
      dailyNote: `年支${detail.yearZhi} · ${detail.month}月${detail.day}日 · ${detail.shi}时`
        + `　→　上卦数 ${detail.upperNum}，下卦数 ${detail.lowerNum}，动爻 ${detail.movingLine}`
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
    const result = H.dailyHexagram(new Date());
    this.present(result);
    this.updateDailyNote(result.detail);
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
    // 同日同卦重取：保留此前累计的收听时长
    const prev = list.filter((h) => h.key === key)[0];
    filtered.unshift({
      key,
      listenSec: (prev && prev.listenSec) || 0,
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

    // 记下当前卦：听音计时据此把时长记到这一条上
    app.globalData.currentCastKey = key;
    const stats = store.loadStats();
    stats.castCount += 1;
    stats.lastDay = store.todayKey(now);
    store.saveStats(stats);
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
