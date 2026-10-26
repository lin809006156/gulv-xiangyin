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

    /**
     * 页面重新显示时同步一次播放状态
     * ---------------------------------------------------------------
     * 小程序 tabBar 页切走时**不销毁**，页面实例仍在栈里。
     * 若期间播放状态变了（起播 / 暂停 / 停止），而本页面没重新订阅，
     * 浮动播放条显示的就是**过期状态**（例如明明在播却显示已停）。
     * 故各页 onShow 都要调本方法，把全局状态拉回来。
     */
    miniSync() {
      const ui = app.globalData.ui;
      if (ui) this.setData({ mini: ui, isPlaying: ui.isPlaying, paused: ui.paused, loopOn: ui.loopOn });
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
      /* 注意：**不能只看 p.paused 来决定图标** ——
       * 暂停时 p.isPlaying 仍为 true（引擎还挂着，只是被挂起）。
       * 引擎的 paused 状态才是唯一真相。
       * 且必须检查返回值：暂停失败时不能把 UI 说成「已暂停」。 */
      if (p.paused) {
        if (p.resume()) app.setUi({ paused: false, subtitle: '即兴中' });
        else wx.showToast({ title: '继续失败', icon: 'none' });
      } else {
        if (p.pause()) app.setUi({ paused: true, subtitle: '已暂停' });
        else wx.showToast({ title: '暂停失败', icon: 'none' });
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
