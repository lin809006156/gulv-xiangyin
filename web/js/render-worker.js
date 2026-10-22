/**
 * 渲染 Worker —— 把「编曲 + 渲染」搬离主线程
 * ---------------------------------------------------------------
 * 为什么要它：
 *   一轮 67 秒的音频，渲染要 1.1–1.3 秒（≈17× 实时）。
 *   放在主线程上，按下播放要等这一秒多（听起来像「卡住」），
 *   连播过程中每隔一分多钟也会卡一下（画面与交互都顿住）。
 *
 * 搬进 Worker 后：主线程始终流畅，编曲在后台悄悄完成，
 * 准备好了就送回来，按下播放即刻出声。
 *
 * 环境说明：core/ 的模块用 require() 互相引用，浏览器靠
 * require-shim.js 注入的垫片。故 Worker 里先造一个 window 别名
 * （self.window = self），再按与网页相同的顺序 importScripts。
 *
 * 协议：
 *   主 → Worker：{ id, type:'compose', hex, cfg, changedCfg, seed,
 *                 variant, form, sampleRate, reverb, bakeAmbient, ambient }
 *   Worker → 主：{ id, ok:true, score, left, right, duration }
 *                 { id, ok:false, error }
 *   PCM 用 Transferable 交回，避免大数组拷贝。
 */
'use strict';

self.window = self;

importScripts(
  '../core/require-shim.js',
  '../core/bootstrap.js',
  '../core/classics.js',
  '../core/data.js',
  '../core/music.js',
  '../core/render.js'
);

const MUSIC = self.ICMusic;
const RENDER = self.ICRender;

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type !== 'compose') return;
  const id = msg.id;
  try {
    const score = MUSIC.composeNotes(msg.hex, msg.cfg, msg.changedCfg, {
      seed: msg.seed,
      variant: msg.variant,
      form: msg.form
    });
    const pcm = RENDER.renderScore(score, {
      sampleRate: msg.sampleRate,
      reverb: msg.reverb,
      ambient: msg.bakeAmbient ? msg.ambient : null
    });
    // PCM 的底层 buffer 交回主线程（转移所有权，零拷贝）
    const transfer = [];
    if (pcm.left && pcm.left.buffer) transfer.push(pcm.left.buffer);
    if (pcm.right && pcm.right.buffer) transfer.push(pcm.right.buffer);
    self.postMessage({
      id,
      ok: true,
      score,
      left: pcm.left,
      right: pcm.right,
      sampleRate: pcm.sampleRate,
      duration: pcm.duration,
      length: pcm.length
    }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
  }
};
