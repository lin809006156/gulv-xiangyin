/**
 * 学易心音 · 小程序存储工具
 * ---------------------------------------------------------------
 * 统一封装 wx.setStorageSync / wx.getStorageSync，
 * 并处理 JSON 序列化与异常。
 */

'use strict';

const HISTORY_KEY = 'gx_history';
const PREF_KEY = 'gx_pref';

/** 读取 JSON 数据 */
function read(key, fallback) {
  try {
    const raw = wx.getStorageSync(key);
    if (!raw) return fallback;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    console.warn('读取存储失败', key, e);
    return fallback;
  }
}

/** 写入 JSON 数据 */
function write(key, value) {
  try {
    wx.setStorageSync(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('写入存储失败', key, e);
    return false;
  }
}

/** 读取卦历 */
function loadHistory() {
  return read(HISTORY_KEY, []);
}

/** 保存卦历（最多保留 60 条） */
function saveHistory(list) {
  return write(HISTORY_KEY, (list || []).slice(0, 60));
}

/** 清空卦历 */
function clearHistory() {
  try {
    wx.removeStorageSync(HISTORY_KEY);
  } catch (e) {
    console.warn('清空存储失败', e);
  }
}

/** 读取偏好 */
function loadPref() {
  return read(PREF_KEY, {});
}

/** 保存偏好 */
function savePref(pref) {
  return write(PREF_KEY, pref || {});
}

/**
 * 格式化中文日期
 */
function formatCnDate(date) {
  const cn = ['日', '一', '二', '三', '四', '五', '六'];
  const d = date || new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日 周${cn[d.getDay()]}`;
}

/**
 * 格式化时间 mm:ss
 */
function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

module.exports = {
  HISTORY_KEY, PREF_KEY,
  read, write,
  loadHistory, saveHistory, clearHistory,
  loadPref, savePref,
  formatCnDate, fmtTime
};
