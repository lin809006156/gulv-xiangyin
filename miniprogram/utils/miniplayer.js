/**
 * 浮动播放条（各页共用）
 * ---------------------------------------------------------------
 * 音乐播放时自底部标签栏上方滑出一枚玻璃胶囊：
 * 曲名 + 状态 + 播放/暂停 + 循环。点曲名回音乐栏。
 * 状态由 app.globalData.ui 统一维护，各页订阅后刷新。
 */

'use strict';

const app = getApp();

module.exports = {
  data: {
    mini: { isPlaying: false, paused: false, loopOn: false, title: '心音', subtitle: '即兴中' }
  },

  methods: {
    /** 订阅全局播放状态 */
    miniBind() {
      if (this._miniOff) return;
      this._miniOff = app.onUiChange((ui) => {
        this.setData({ mini: ui, isPlaying: ui.isPlaying, paused: ui.paused, loopOn: ui.loopOn });
      });
      const ui = app.globalData.ui;
      if (ui) this.setData({ mini: ui, isPlaying: ui.isPlaying, paused: ui.paused, loopOn: ui.loopOn });
    },

    miniUnbind() {
      if (this._miniOff) { this._miniOff(); this._miniOff = null; }
    },

    /** 播放 / 暂停 / 继续 */
    miniPlay() {
      const p = app.globalData.player;
      if (!p) return;
      if (!p.isPlaying) {
        // 未在播：交给音乐栏起播
        wx.switchTab({ url: '/pages/music/music' });
        return;
      }
      if (p.paused) {
        p.resume();
        app.setUi({ paused: false, subtitle: '即兴中' });
      } else {
        p.pause();
        app.setUi({ paused: true, subtitle: '已暂停' });
      }
    },

    /** 循环 */
    miniLoop() {
      const p = app.globalData.player;
      if (!p) return;
      const on = p.toggleLoop();
      app.setUi({ loopOn: on });
      wx.showToast({ title: on ? '已开启循环' : '已关闭循环', icon: 'none' });
    },

    /** 点曲名回音乐栏 */
    miniGoMusic() {
      wx.switchTab({ url: '/pages/music/music' });
    }
  }
};
