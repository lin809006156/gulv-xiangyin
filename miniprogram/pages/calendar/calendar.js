/**
 * 古律象音 · 卦历
 * ---------------------------------------------------------------
 * 记录每日所起之卦，可回看并重听
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
    list: [],
    empty: true
  },

  onUnload() { this.miniUnbind(); },

  onShow() {
    this.refresh();
  },

  refresh() {
    const list = store.loadHistory();
    this.setData({ list, empty: list.length === 0 });
  },

  /**
   * 回看某一卦
   */
  replay(e) {
    const n = e.currentTarget.dataset.n;
    const hex = D.getHexagram(n);
    const result = {
      hex,
      changedHex: null,
      movingLine: 1,
      lines: D.getSixLines(hex),
      changedLines: D.getSixLines(hex),
      methodText: '卦历回看',
      detail: {},
      music: D.deriveMusicConfig(hex)
    };
    app.globalData.currentResult = result;
    app.globalData.currentScore = M.composeNotes(hex, result.music, null);

    wx.switchTab({
      url: '/pages/index/index',
      success: () => {
        wx.showToast({ title: `已载入 ${hex.name}`, icon: 'none' });
      }
    });
  },

  clearAll() {
    wx.showModal({
      title: '清空卦历',
      content: '确定清空所有卦象记录？此操作不可恢复。',
      confirmText: '清空',
      confirmColor: '#B23A2E',
      success: (res) => {
        if (res.confirm) {
          store.clearHistory();
          this.refresh();
          wx.showToast({ title: '已清空', icon: 'none' });
        }
      }
    });
  },

  onShareAppMessage() {
    return { title: '古律象音 · 每日观象起卦', desc: '观身边之物，每日起一卦，生一段心音。' };
  }
});
