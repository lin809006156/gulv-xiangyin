/**
 * 古律象音 · 我的
 * ---------------------------------------------------------------
 * 历史记录（含每卦累计收听时长）、数据管理、偏好设置、联系我们。
 * 全部数据只在本机 wx storage，不上传、不需要登录。
 *
 * 与网页版保持一致的三点：
 *   · 时长的统计口径 —— 播放中每 5 秒累加，暂停不计（计时器在 app.js）；
 *   · 「恢复默认」只清偏好，不动历史；
 *   · 联系邮箱为同一个地址。
 */

'use strict';

const D = require('../../core/data.js');
const M = require('../../core/music.js');
const store = require('../../utils/storage.js');

const app = getApp();

/** 版本号：与 package.json / CHANGELOG 同步 */
const APP_VERSION = 'v1.4.3';

/** 联系邮箱（与网页版同一地址） */
const CONTACT_MAIL = '809006156@qq.com';

/** 秒 → 中文时长 */
function fmtDur(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} 小时 ${rest} 分` : `${h} 小时`;
}

Page({
  data: {
    metaText: '',
    historyCount: 0,
    summaryText: '',
    history: [],
    castModes: [
      { key: 'daily', label: '每日' },
      { key: 'image', label: '观象' },
      { key: 'number', label: '数字' }
    ],
    defaultCastMode: 'daily',
    version: APP_VERSION,
    mail: CONTACT_MAIL
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(3);
    }
    this.refresh();
  },

  /** 汇总历史与统计（每次进入都重算，别处可能刚起过卦） */
  refresh() {
    const stats = store.loadStats();
    const list = store.loadHistory() || [];

    // 首次使用日期兜底：老用户可能还没有 stats
    if (!stats.firstDay) {
      stats.firstDay = store.todayKey();
      store.saveStats(stats);
    }

    const first = new Date(String(stats.firstDay).replace(/-/g, '/')).getTime();
    const days = isFinite(first)
      ? Math.max(1, Math.floor((Date.now() - first) / 86400000) + 1)
      : 1;

    const history = list.map((h) => ({
      key: h.key,
      n: h.n,
      symbol: h.symbol,
      name: h.name,
      title: h.name + (h.image ? ` · 观${h.image}` : ''),
      method: h.method || h.hint || '',
      date: h.date,
      time: h.time,
      durText: h.listenSec ? fmtDur(h.listenSec) : ''
    }));

    this.setData({
      metaText: `已陪伴 ${days} 天 · 起卦 ${stats.castCount} 次 · 累计听音 ${fmtDur(stats.totalSec)}`,
      historyCount: history.length,
      summaryText: history.length
        ? `共 ${history.length} 卦 · 累计听音 ${fmtDur(stats.totalSec)}`
        : '',
      history,
      defaultCastMode: (store.loadPref() || {}).defaultCastMode || 'daily'
    });
  },

  /** 点历史条目：载入该卦并回到起卦页（与卦历页同一做法） */
  onReplay(e) {
    const n = Number(e.currentTarget.dataset.n);
    const hex = D.getHexagram(n);
    if (!hex) return;
    const result = {
      hex,
      changedHex: null,
      movingLine: 1,
      lines: D.getSixLines(hex),
      changedLines: D.getSixLines(hex),
      methodText: '历史回看',
      detail: {},
      music: D.deriveMusicConfig(hex)
    };
    app.globalData.currentResult = result;
    app.globalData.currentScore = M.composeNotes(hex, result.music, null);
    wx.switchTab({
      url: '/pages/index/index',
      success: () => wx.showToast({ title: `已载入 ${hex.name}`, icon: 'none' })
    });
  },

  /* ---------- 偏好 ---------- */

  onCastMode(e) {
    const mode = e.currentTarget.dataset.mode;
    const pref = store.loadPref() || {};
    pref.defaultCastMode = mode;
    store.savePref(pref);
    this.setData({ defaultCastMode: mode });
    wx.showToast({ title: '已设为进入时的默认起卦方式', icon: 'none' });
  },

  onResetPref() {
    wx.showModal({
      title: '恢复默认设置',
      content: '音量、音层、外观都会复位，历史记录不受影响。',
      confirmText: '恢复',
      confirmColor: '#B23A2E',
      success: (r) => {
        if (!r.confirm) return;
        store.savePref({});
        wx.showToast({ title: '已恢复默认，重启后生效', icon: 'none' });
      }
    });
  },

  /* ---------- 数据管理 ---------- */

  /** 把历史复制成 CSV 文本（小程序不便直接落盘，复制后粘到表格即可） */
  onCopyHistory() {
    const list = store.loadHistory() || [];
    if (!list.length) {
      wx.showToast({ title: '还没有记录', icon: 'none' });
      return;
    }
    const esc = (v) => {
      const s = String(v === undefined || v === null ? '' : v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const head = ['日期', '时间', '卦号', '卦名', '卦符', '起卦方式', '物象', '收听秒数'];
    const rows = [head].concat(list.map((h) => [
      h.date, h.time, h.n, h.name, h.symbol, h.method || '', h.image || '', h.listenSec || 0
    ]));
    const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n');
    wx.setClipboardData({
      data: csv,
      success: () => wx.showToast({ title: `已复制 ${list.length} 条记录`, icon: 'none' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
    });
  },

  onClearHistory() {
    const list = store.loadHistory() || [];
    if (!list.length) {
      wx.showToast({ title: '还没有记录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '清空历史记录',
      content: `将删除全部 ${list.length} 条记录，此操作不可恢复。`,
      confirmText: '清空',
      confirmColor: '#B23A2E',
      success: (r) => {
        if (!r.confirm) return;
        store.clearHistory();
        app.globalData.currentCastKey = null;
        this.refresh();
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  },

  /* ---------- 联系我们 ---------- */

  onCopyMail() {
    wx.setClipboardData({
      data: CONTACT_MAIL,
      success: () => wx.showToast({ title: '邮箱已复制', icon: 'none' })
    });
  }
});
