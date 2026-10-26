/**
 * 古律象音 · 音乐页
 * ---------------------------------------------------------------
 * 当前心音 + 波形台（小程序 Canvas 2D）+ 播放控制 + 乐器园。
 * 与网页版同源之处：卦象参数、编曲引擎（即兴连播）、波形台画面。
 * 平台差异：频谱由乐谱按播放位置推算（小程序无 AnalyserNode）。
 */

'use strict';

const H = require('../../core/hexagram.js');
const M = require('../../core/music.js');
const D = require('../../core/data.js');
const store = require('../../utils/storage.js');
const Viz = require('../../core/viz-stage.js');

const app = getApp();
const mini = require('../../utils/miniplayer.js');

/** 试听短句：宫 商 角 徵 羽 徵 角 商（八音同一句，各以本音色奏出） */
const AUDITION_PHRASE = [0, 2, 4, 7, 9, 7, 4, 2];
const AUDITION_TIMBRE = {
  clarity: 0.15, brightness: 0.24, attack: 0.085,
  release: 0.80, noise: 0.14, harmonic: 0.95
};

/** 以某乐器音色奏一句五声短句（与网页版同一套参数） */
function buildAuditionScore(voice) {
  const percussive = voice === 'gu';
  const highClack = voice === 'zhu';
  const root = percussive ? 36 : highClack ? 72 : 62;
  const beat = percussive ? 0.34 : 0.44;
  const durs = [0.9, 0.7, 0.9, 1.2, 1.4, 0.8, 0.9, 1.7];
  const notes = [];
  let t = 0;
  for (let i = 0; i < AUDITION_PHRASE.length; i++) {
    const dur = durs[i] * beat;
    notes.push({
      time: +t.toFixed(3),
      dur: +dur.toFixed(3),
      midi: root + AUDITION_PHRASE[i],
      vel: 0.32,
      voice: voice,
      pan: 0,
      timbre: AUDITION_TIMBRE
    });
    t += dur * 0.92;
  }
  return { notes: notes, duration: t + 0.5, sections: {} };
}

Page({
  ...mini.methods,
  data: {
    hasResult: false,
    symbol: '', name: '', structure: '', virtue: '',
    musicParams: [],
    instruments: [],
    isPlaying: false,
    paused: false,
    loopOn: false,
    volume: 85,
    liveText: '即兴中',
    playerTip: '',
    playingKey: '',
    // 浮动播放条
    mini: { isPlaying: false, paused: false, loopOn: false, title: '心音', subtitle: '即兴中' }
  },

  onLoad() {
    this.miniBind();
    this.stage = Viz.createStage();
    this.canvas = null;
    this.raf = 0;
    this.lastT = 0;
    this._unsub = app.onUiChange((ui) => {
      this.setData({
        isPlaying: ui.isPlaying, paused: ui.paused, loopOn: ui.loopOn, mini: ui
      });
    });
    this.setData({ instruments: this.buildInstruments() });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(1);
    }
    this.syncResult();
    this.initCanvas();
    this.restoreVolume();
  },

  onHide() { this.stopLoop(); },
  onUnload() { this.miniUnbind(); this.stopLoop(); if (this._unsub) this._unsub(); },

  /* =============================================================
   * 数据
   * ============================================================= */

  /** 从全局结果里取当前卦象，刷新参数与波形台 */
  syncResult() {
    const result = app.globalData.currentResult;
    const ui = app.globalData.ui || {};
    if (!result) {
      this.setData({ hasResult: false, musicParams: [] });
      return;
    }
    const reading = H.buildReading(result);
    const music = result.music;
    const musicParams = [
      { label: '调式', value: music.modeName, sub: music.modeMood },
      { label: '律', value: music.lvName },
      { label: '主音', value: 'MIDI ' + music.rootMidi, sub: this.freqName(music.rootMidi) },
      { label: '音色', value: music.voiceText },
      { label: '速度', value: music.tempo, sub: 'BPM' },
      { label: '卦德', value: music.virtue }
    ];
    this.setData({
      hasResult: true,
      symbol: reading.symbol,
      name: reading.name,
      structure: reading.structure,
      virtue: reading.virtue,
      musicParams,
      playerTip: '即兴连播中：八段一循环，同一动机逐段生长、不作原样复读。'
    });
    // 波形台：卦象结构
    this.applyHex(reading);
    // 曲名同步到浮动播放条
    app.setUi({ title: reading.name, subtitle: music.modeName });
    // 画布随 wx:if 出现，稍后再取一次节点
    if (!this.canvas) setTimeout(() => this.initCanvas(0), 80);
  },

  /** 把卦象结构送到波形台 */
  applyHex(reading) {
    const rd = reading || (app.globalData.currentResult
      ? H.buildReading(app.globalData.currentResult) : null);
    if (!rd) return;
    const rows = rd.yaoList.map((y) => (y.isYang ? 1 : 0)).reverse();
    const moving = [];
    rd.yaoList.forEach((y, i) => { if (y.isMoving) moving.push(6 - i); });
    this.stage.setHex(rows, moving);
  },

  buildInstruments() {
    const out = [];
    const tone = D.EIGHT_TONE || {};
    const keys = Object.keys(tone);
    for (let i = 0; i < keys.length; i++) {
      const it = tone[keys[i]];
      const tri = D.TRIGRAMS[it.trigram] || {};
      out.push({
        key: keys[i],
        name: it.name,
        mat: it.material,
        guaName: tri.name || '',
        desc: it.desc,
        cite: '《白虎通·礼乐》引《乐记》'
      });
    }
    return out;
  },

  freqName(midi) {
    const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const n = ((midi % 12) + 12) % 12;
    return names[n] + (Math.floor(midi / 12) - 1);
  },

  /* =============================================================
   * 波形台
   * ============================================================= */

  initCanvas(tryCount) {
    if (this.canvas) return;
    const tries = tryCount || 0;
    const q = wx.createSelectorQuery().in(this);
    q.select('#viz').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        // 画布在 wx:if 里，节点可能尚未渲染 → 稍后重试
        if (tries < 10) setTimeout(() => this.initCanvas(tries + 1), 120);
        return;
      }
      const canvas = res[0].node;
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const dpr = info.pixelRatio || 2;
      // 画布的物理像素 = CSS 像素 × dpr
      const cssW = res[0].width || 320;
      const cssH = res[0].height || 150;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const ctx = canvas.getContext('2d');
      // 坐标系缩放到 CSS 像素，故共享渲染核心里的坐标一律用 CSS 像素
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.canvas = canvas;
      this.ctx = ctx;
      this.stage.attach(ctx, cssW, cssH);
      // 画布就绪后同步一次卦象（画布拿到前 syncResult 可能还没跑到）
      this.applyHex();
      this.startLoop();
    });
  },

  /**
   * 下一帧
   * ---------------------------------------------------------------
   * 小程序**逻辑层没有全局 requestAnimationFrame**（那是渲染层的能力）。
   * 优先用 canvas 节点自带的 requestAnimationFrame（基础库 2.7.0+，
   * 帧率跟随系统刷新、页面隐藏时自动暂停）；拿不到则退回 setTimeout。
   */
  nextFrame(cb) {
    if (this.canvas && typeof this.canvas.requestAnimationFrame === 'function') {
      return this.canvas.requestAnimationFrame(cb);
    }
    if (typeof requestAnimationFrame === 'function') {
      return requestAnimationFrame(cb);
    }
    return setTimeout(() => cb(Date.now()), 16);
  },

  cancelFrame(id) {
    if (!id) return;
    if (this.canvas && typeof this.canvas.cancelAnimationFrame === 'function') {
      try { this.canvas.cancelAnimationFrame(id); return; } catch (e) { /* 落到下面 */ }
    }
    if (typeof cancelAnimationFrame === 'function') {
      try { cancelAnimationFrame(id); return; } catch (e) { /* 落到下面 */ }
    }
    clearTimeout(id);
  },

  startLoop() {
    this.stopLoop();
    this.lastT = Date.now();
    const tick = () => {
      this.raf = this.nextFrame(tick);
      const now = Date.now();
      const dt = Math.min(50, now - this.lastT);   // 毫秒
      this.lastT = now;
      const p = app.globalData.player;
      const isPlaying = !!(p && p.isPlaying && !p.paused);
      const paused = !!(p && p.paused && p.isPlaying);

      // 频谱：小程序无 AnalyserNode → 由乐谱按播放位置推算
      let bins = null;
      if (p && isPlaying) {
        const pos = p.genPos;
        if (pos) bins = Viz.spectrumFromScore(pos.score, pos.elapsed, 64);
      }

      // 状态机：playing / paused / drain / idle
      this.stage.setFlowState(isPlaying ? 'playing' : (paused ? 'paused' : 'drain'));
      this.stage.setSignal({ bins });
      this.stage.draw(this.ctx, dt / 1000);        // dt 换成秒
    };
    this.raf = this.nextFrame(tick);
  },

  stopLoop() {
    if (this.raf) { this.cancelFrame(this.raf); this.raf = 0; }
  },

  /* =============================================================
   * 播放控制
   * ============================================================= */

  togglePlay() {
    const p = app.globalData.player;
    const result = app.globalData.currentResult;
    if (!p || !result) return;
    if (p.isPlaying) {
      if (p.paused) { p.resume(); app.setUi({ paused: false, isPlaying: true, subtitle: '即兴中' }); }
      else { p.pause(); app.setUi({ paused: true, isPlaying: true, subtitle: '已暂停' }); }
      this.setData({ isPlaying: p.isPlaying, paused: p.paused });
      return;
    }
    // 起播：即兴连播（与网页版同一引擎）
    this.setData({ playerTip: '正在编曲：第一段即兴…' });
    p.playGenerative(result.hex, result.music, result.changedMusic, {
      onChange: (info) => {
        const names = { intro: '起', theme: '承', variation: '转', coda: '合' };
        this.setData({ liveText: (names[info.section] || '奏') + ' · 即兴中' });
      }
    });
    app.setUi({ isPlaying: true, paused: false, subtitle: '即兴中' });
    this.setData({ isPlaying: true, paused: false, playerTip: '即兴连播中：八段一循环，同一动机逐段生长。' });
  },

  toggleLoop() {
    const p = app.globalData.player;
    if (!p) return;
    const on = p.toggleLoop();
    app.setUi({ loopOn: on });
    this.setData({ loopOn: on, playerTip: on ? '已开启循环：此卦之音将反复播放。' : '已关闭循环。' });
  },

  onVolume(e) {
    const v = Number(e.detail.value);
    const p = app.globalData.player;
    if (p) p.setVolume(v / 100);
    this.setData({ volume: v });
    const pref = store.loadPref() || {};
    pref.volume = v;
    store.savePref(pref);
  },

  restoreVolume() {
    const pref = store.loadPref() || {};
    if (pref.volume != null) {
      this.setData({ volume: pref.volume });
      const p = app.globalData.player;
      if (p) p.setVolume(pref.volume / 100);
    }
  },

  /* =============================================================
   * 乐器园
   * ============================================================= */

  audition(e) {
    const key = e.currentTarget.dataset.key;
    const p = app.globalData.player;
    if (!p) return;
    if (this.data.playingKey === key) {
      p.stop();
      this.setData({ playingKey: '' });
      app.setUi({ isPlaying: false, paused: false });
      return;
    }
    const it = this.data.instruments.filter((x) => x.key === key)[0];
    if (!it) return;
    const score = buildAuditionScore(key);
    this.setData({ playingKey: key, playerTip: '正在试听：' + it.name + '（' + it.mat + '声，配' + it.guaName + '卦）' });
    p.play(score, { offset: 0 });
    app.setUi({ isPlaying: true, paused: false, title: it.name, subtitle: it.mat + '声 · ' + it.guaName });
  },

  goCast() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onPlayerState(state, progress) {
    if (state === 'rendering') {
      this.setData({ playerTip: '正在编曲：第一段即兴…' + (progress != null ? ' ' + progress + '%' : '') });
    } else if (state === 'playing') {
      this.setData({ playerTip: '即兴连播中：八段一循环，同一动机逐段生长、不作原样复读。' });
    }
  },

  onShareAppMessage() {
    return {
      title: (this.data.name || '古律象音') + ' · 卦象心音',
      path: '/pages/index/index'
    };
  }
});
