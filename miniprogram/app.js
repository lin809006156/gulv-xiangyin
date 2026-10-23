/**
 * 学易心音 · 小程序入口
 * ---------------------------------------------------------------
 * 启动时做三件事：
 *   1. 记录首次启动时间（用于"每日一卦"的初始化）
 *   2. 预热核心模块（起卦、作曲），让首页打开即用
 *   3. 注入全局工具
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
    // 起卦结果暂存：从首页跳转到详情页时传递
    currentResult: null,
    currentScore: null,
    player: null,

    /**
     * 云开发环境 ID。
     * 留空则「拍照识象」自动降级为手动选物象，其余功能不受影响。
     * 配置方法：开发者工具 → 云开发 → 复制环境 ID 填到这里。
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
  }
});
