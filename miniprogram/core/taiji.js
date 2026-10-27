/**
 * 太极图（阴阳鱼）绘制
 * ---------------------------------------------------------------
 * 网页版与微信小程序端**共用同一份**绘制代码，
 * 保证两端画出来的太极完全一致（此前两端各画各的，
 * 小程序端用纯 CSS 画，结果画成了「上下平分 + 方槽」的怪东西）。
 *
 * 几何（标准阴阳鱼）
 *   外圆半径 R，圆心 O。
 *   黑白分界是一条 **S 形曲线**，由两段半径 R/2 的半圆弧接成：
 *     · 上段：圆心在 O 上方 R/2 处，向右鼓入上半区
 *     · 下段：圆心在 O 下方 R/2 处，向左鼓入下半区
 *   两瓣因此像两条鱼首尾相咬 —— 而**不是**上下平分。
 *   鱼眼：黑瓣内嵌一白眼（在上），白瓣内嵌一黑眼（在下）。
 *
 * 为什么不用 CSS 画
 *   纯 CSS 无法用单个圆角矩形做出 S 形分界。实测各种
 *   border-radius 组合只会得到「方槽」或「上下平分」，都不是太极。
 *   故用 Canvas 2D 精确绘制。
 *
 * 用法（两端通用）：
 *   const taiji = require('./core/taiji.js');   // 小程序
 *   const taiji = window.ICTaiji;               // 网页
 *   taiji.draw(ctx, cx, cy, radius);
 */
'use strict';

const DARK = '#23201B';
const LIGHT = '#F7F2E8';

/**
 * 在给定上下文里画太极图
 * @param {CanvasRenderingContext2D} ctx  2D 上下文
 * @param {number} cx    圆心 x
 * @param {number} cy    圆心 y
 * @param {number} R     圆半径
 * @param {object} [opt] 可选：dark / light / stroke / lineWidth / showEyes
 */
function draw(ctx, cx, cy, R, opt) {
  const o = opt || {};
  const dark = o.dark || DARK;
  const light = o.light || LIGHT;
  const r2 = R / 2;
  const lw = o.lineWidth || 2;

  ctx.save();

  /* ① 裁到圆内 */
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  /* ② 底：白 */
  ctx.fillStyle = light;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  /* ③ 黑瓣：外弧（右侧半圆，自上而下）+ 两段 R/2 弧构成 S 形 */
  ctx.fillStyle = dark;
  ctx.beginPath();
  // 外弧：12 点 → 6 点，走右半边
  ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false);
  // 自 6 点回到圆心：圆心在 O 下方 R/2，向左鼓
  ctx.arc(cx, cy + r2, r2, Math.PI / 2, -Math.PI / 2, true);
  // 自圆心回到 12 点：圆心在 O 上方 R/2，向右鼓
  ctx.arc(cx, cy - r2, r2, Math.PI / 2, -Math.PI / 2, false);
  ctx.closePath();
  ctx.fill();

  /* ④ 鱼眼：黑瓣内一白眼（在上）、白瓣内一黑眼（在下） */
  if (o.showEyes !== false) {
    const er = R / 12;
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(cx, cy - R / 4, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(cx, cy + R / 4, er, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  /* ⑤ 外框 */
  if (o.stroke !== null) {
    ctx.strokeStyle = o.stroke || 'rgba(35,32,27,.45)';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy, R - lw / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * 画成 data URL 的 PNG（供 <image> 使用）
 * @param {number} size  边长（像素）
 * @param {number} dpr   设备像素比
 */
function toDataURL(size, dpr) {
  const s = size || 150;
  const d = dpr || 2;
  const cv = (typeof document !== 'undefined')
    ? document.createElement('canvas')
    : null;
  if (!cv) return '';
  cv.width = s * d;
  cv.height = s * d;
  const ctx = cv.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  draw(ctx, s / 2, s / 2, s / 2 - 2);
  return cv.toDataURL('image/png');
}

const API = { draw: draw, toDataURL: toDataURL, DARK: DARK, LIGHT: LIGHT };

/* 网页端：挂到全局（与其它 core 模块一致） */
if (typeof window !== 'undefined') {
  window.ICTaiji = API;
}
/* 小程序端：CommonJS 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
