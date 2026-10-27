/**
 * 古律象音 · 跨端加载垫片
 * ---------------------------------------------------------------
 * 让 core/ 下的模块同时适配三种运行环境：
 *   · 浏览器      —— 依赖 <script> 顺序，全局变量可见
 *   · 微信小程序  —— CommonJS，必须显式 require
 *   · Node        —— CommonJS
 *
 * 用法：在依赖其他模块的文件顶部写
 *   const { TRIGRAMS, ... } = require('./bootstrap.js').data;
 * 或直接
 *   const IC = require('./bootstrap.js');
 */

'use strict';

/* __IC_IIFE__ */
(function () {


/** 探测运行环境 */
const IS_NODE = (typeof process !== 'undefined' &&
  process.versions && process.versions.node &&
  typeof window === 'undefined');

const IS_MINIPROGRAM = !IS_NODE &&
  typeof wx !== 'undefined' &&
  typeof wx.getSystemInfoSync === 'function';

/**
 * 浏览器优先取全局（由 require-shim.js 注入的 require 亦可，但全局更直接）；
 * 小程序与 Node 走 CommonJS require。
 */
function loadData() {
  if (IS_NODE || IS_MINIPROGRAM) {
    return require('./data.js');
  }
  if (typeof window !== 'undefined' && window.ICData) {
    return window.ICData;
  }
  throw new Error('core/data.js 未加载：浏览器环境请先引入 data.js');
}

/**
 * 加载典籍依据模块（文献单一真相源）
 * 注意：classics.js 不依赖任何其他 core 模块，data.js 依赖它，
 * 故须排在 data.js 之前加载。
 */
function loadClassics() {
  if (IS_NODE || IS_MINIPROGRAM) {
    return require('./classics.js');
  }
  if (typeof window !== 'undefined' && window.ICClassics) {
    return window.ICClassics;
  }
  throw new Error('core/classics.js 未加载');
}

/**
 * 加载依赖模块（起卦层）
 */
function loadHexagram() {
  if (IS_NODE || IS_MINIPROGRAM) {
    return require('./hexagram.js');
  }
  if (typeof window !== 'undefined' && window.ICHexagram) {
    return window.ICHexagram;
  }
  throw new Error('core/hexagram.js 未加载');
}

/**
 * 加载依赖模块（作曲层）
 */
function loadMusic() {
  if (IS_NODE || IS_MINIPROGRAM) {
    return require('./music.js');
  }
  if (typeof window !== 'undefined' && window.ICMusic) {
    return window.ICMusic;
  }
  throw new Error('core/music.js 未加载');
}

/**
 * 加载渲染层
 */
function loadRender() {
  if (IS_NODE || IS_MINIPROGRAM) {
    return require('./render.js');
  }
  if (typeof window !== 'undefined' && window.ICRender) {
    return window.ICRender;
  }
  throw new Error('core/render.js 未加载');
}

/**
 * 加载播放层
 */
function loadPlayer() {
  if (IS_NODE || IS_MINIPROGRAM) {
    return require('./player.js');
  }
  if (typeof window !== 'undefined' && window.ICPlayer) {
    return window.ICPlayer;
  }
  throw new Error('core/player.js 未加载');
}

/**
 * 加载物象归一层
 */
function loadRecognize() {
  if (IS_NODE || IS_MINIPROGRAM) {
    return require('./recognize.js');
  }
  if (typeof window !== 'undefined' && window.ICRecognize) {
    return window.ICRecognize;
  }
  throw new Error('core/recognize.js 未加载');
}

/**
 * 取得空后端（Node 环境与未注入后端时用）
 * ---------------------------------------------------------------
 * 后端契约见 core/backend.js。
 */
function createNullBackend() {
  if (IS_NODE || IS_MINIPROGRAM) {
    return require('./backend.js').createNullBackend();
  }
  if (typeof window !== 'undefined' && window.ICBackend) {
    return window.ICBackend.createNullBackend();
  }
  throw new Error('core/backend.js 未加载');
}

const API = {
  IS_NODE, IS_MINIPROGRAM,
  loadClassics, loadData, loadHexagram, loadMusic, loadRender, loadPlayer, loadRecognize,
  createNullBackend
};

/* 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else {
  window.ICBootstrap = API;
}

})();
