/**
 * 同步 core/ 到各端目录
 * ---------------------------------------------------------------
 * core/ 是唯一真相源。本脚本把它分发到：
 *   web/       —— 网页版（Capacitor APP 也用它）
 *   miniprogram/core/ —— 微信小程序
 *
 * 用法：node scripts/sync-core.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CORE = path.join(ROOT, 'core');
const TARGETS = [
  path.join(ROOT, 'web', 'core'),
  path.join(ROOT, 'miniprogram', 'core')
];

/**
 * 同步顺序即依赖顺序，勿随意调整：
 *   require-shim  浏览器里注入 require（必须最先）
 *   bootstrap    提供 loadXxx 垫片
 *   classics     文献依据的单一真相源（不依赖其他 core 模块）
 *   data         依赖 classics，必须在其后
 *   hexagram-texts 六十四卦详解（原文 + 京房八宫纳甲），依赖 data 的卦序
 *   hexagram / music / render / player / recognize
 *   vision       依赖 recognize，必须在其后
 */
const FILES = [
  'require-shim.js',
  'bootstrap.js',
  'classics.js',
  'data.js',
  'hexagram-texts.js',
  'hexagram.js',
  'music.js',
  'render.js',
  'player.js',
  'recognize.js',
  'vision.js'
];

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

let count = 0;
TARGETS.forEach((target) => {
  FILES.forEach((f) => {
    const src = path.join(CORE, f);
    const dst = path.join(target, f);
    if (!fs.existsSync(src)) {
      console.error(`[跳过] 源文件不存在: ${src}`);
      return;
    }
    copyFile(src, dst);
    count++;
  });
  console.log(`[OK] 同步至 ${path.relative(ROOT, target)}`);
});

console.log(`\n共同步 ${count} 个文件`);
