/**
 * 古律象音 · 小程序入口
 * ---------------------------------------------------------------
 * 启动时做三件事：
 *   1. 记录首次启动时间（用于"每日一卦"的初始化）
 *   2. 预热核心模块（起卦、作曲），让首页打开即用
 *   3. 维护全局播放状态，浮动播放条据此同步
 */

'use strict';

const D = require('./core/data.js');
const H = require('./core/hexagram.js');
const M = require('./core/music.js');
const P = require('./core/player.js');

/**
 * 取当前页面栈顶
 * getCurrentPages 是小程序全局函数，此处包一层便于容错
 */
function topPage() {
  if (typeof getCurrentPages !== 'function') return null;
  const pages = getCurrentPages();
  return pages.length ? pages[pages.length - 1] : null;
}

App({
  globalData: {
    // 起卦结果暂存：各页共享（音乐页据此取卦象与心音）
    currentResult: null,
    currentScore: null,
    player: null,

    /**
     * 播放状态（浮动播放条与各页共享）
     * isPlaying 是否在播；paused 是否被用户挂起；loopOn 循环；
     * title 曲名；subtitle 状态文案
     */
    ui: { isPlaying: false, paused: false, loopOn: false, title: '心音', subtitle: '即兴中' },
    _uiListeners: [],

    /**
     * 云开发环境 ID（预留，当前版本未使用云开发）。
     */
    envId: '',

    /**
     * 是否已初始化云开发。云环境为空时不做初始化，避免报错。
     */
    cloudInited: false
  },

  onLaunch() {
    // 初始化云开发（仅当配置了环境 ID 时）
    const envId = this.globalData.envId;
    if (envId && wx.cloud) {
      wx.cloud.init({ env: envId, traceUser: false });
      this.globalData.cloudInited = true;
    }
    // 全局共享一个播放引擎，跨页面保持播放连续性
    this.globalData.player = new P.Player({
      onProgress: (elapsed, duration) => {
        const top = topPage();
        if (top && top.onPlayerProgress) top.onPlayerProgress(elapsed, duration);
      },
      onEnd: () => {
        this.setUi({ isPlaying: false, paused: false, subtitle: '已止' });
        const top = topPage();
        if (top && top.onPlayerEnd) top.onPlayerEnd();
      },
      onError: (msg) => {
        wx.showToast({ title: String(msg).slice(0, 20), icon: 'none' });
      },
      onStateChange: (state, progress) => {
        const top = topPage();
        if (top && top.onPlayerState) top.onPlayerState(state, progress);
      }
    });

    // 预热：提前算好今日之卦与对应音符表
    try {
      const result = H.dailyHexagram(new Date());
      this.globalData.currentResult = result;
      this.globalData.currentScore = M.composeNotes(
        result.hex, result.music, result.changedMusic
      );
    } catch (e) {
      console.error('预热失败', e);
    }
  },

  onHide() {
    // 小程序切后台时保留播放（InnerAudioContext 支持）
  },

  onError(err) {
    console.error('小程序异常', err);
  },

  /**
   * 更新全局播放状态并通知各页（浮动播放条据此刷新）
   */
  setUi(patch) {
    const ui = Object.assign({}, this.globalData.ui, patch);
    this.globalData.ui = ui;
    const ls = this.globalData._uiListeners || [];
    for (let i = 0; i < ls.length; i++) {
      try { ls[i](ui); } catch (e) { /* 单个页面出错不影响其它 */ }
    }
  },

  /** 页面注册播放状态监听（返回取消函数） */
  onUiChange(fn) {
    const ls = this.globalData._uiListeners || (this.globalData._uiListeners = []);
    ls.push(fn);
    return () => {
      const i = ls.indexOf(fn);
      if (i >= 0) ls.splice(i, 1);
    };
  }
});
