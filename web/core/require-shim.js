/**
 * 浏览器端的 CommonJS 垫片
 * ---------------------------------------------------------------
 * core/ 下的模块用 require() 引用彼此，这在 Node 和小程序里原生可用，
 * 但浏览器没有 require。这里注入一个最小实现：
 *   require('./x.js')  →  从 window 上取对应模块
 *
 * 加载顺序要求：
 *   require-shim.js → data.js → hexagram.js → music.js → render.js → player.js
 *
 * 因为 data.js 内部不依赖其他 core 模块（是依赖链的根），
 * 所以 shim 只需在 data.js 之前存在即可。
 */
(function (global) {
  'use strict';

  // 模块路径 → 全局变量名
  const MAP = {
    './classics.js': 'ICClassics',
    './data.js': 'ICData',
    './hexagram-texts.js': 'ICTexts',
    './hexagram.js': 'ICHexagram',
    './music.js': 'ICMusic',
    './render.js': 'ICRender',
    './player.js': 'ICPlayer',
    './recognize.js': 'ICRecognize',
    './viz-stage.js': 'ICVizStage',
    './bootstrap.js': 'ICBootstrap'
  };

  function req(path) {
    const key = MAP[path] || MAP['./' + String(path).replace(/^\.\//, '')];
    const mod = key ? global[key] : null;
    if (!mod) {
      throw new Error(
        '浏览器 require 失败：' + path + ' 未加载。请检查 script 引入顺序，' +
        '或确认该模块已完成导出（module.exports 或 window 赋值）。'
      );
    }
    return mod;
  }

  req.cache = {};
  global.require = req;
  global.__IC_BROWSER__ = true;

})(typeof window !== 'undefined' ? window : this);
