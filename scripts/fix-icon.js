/**
 * 图标后处理：去水印 + 多尺寸输出
 * ---------------------------------------------------------------
 * AI 生成的图标右下角带「AI生成 WORKBUDDY>」水印，正式发布必须去掉。
 * 水印位于纯色背景角落，用同图底部干净区域的中位色精确修补，
 * 再双线性缩放到各端所需尺寸：
 *   miniprogram/assets/icon.png     1024（源）
 *   miniprogram/assets/icon-144.png 144（微信小程序上传规格）
 *   web/assets/icon-512.png         512（PWA）
 *   web/assets/icon-192.png         192（PWA）
 *   web/assets/icon-180.png         180（apple-touch-icon）
 *   web/assets/icon-maskable.png    512（可遮罩，满幅）
 *
 * 用法：node scripts/fix-icon.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'miniprogram', 'assets',
  'A_minimalist_mobile_app_icon___2026-10-20T08-38-28.png');

/* ---------- CRC32 ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 4);
    raw[off] = 0;
    rgba.copy(raw, off + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- PNG 解码（支持 RGB/RGBA，完整反滤波） ---------- */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504E47) throw new Error('不是 PNG 文件');
  let off = 8;
  let width = 0, height = 0, colorType = 6;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8) throw new Error('仅支持 8 位深');
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!ch) throw new Error('不支持的颜色类型：' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = ch;
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  let srcOff = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[srcOff++];
    const rowStart = srcOff;
    srcOff += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    raw.copy(cur, 0, rowStart, rowStart + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        v = (v + pr) & 255;
      }
      cur[x] = v;
    }
    prev = cur;
  }
  return { width, height, ch, data: out };
}

/** 规整为 RGBA */
function toRGBA(img) {
  if (img.ch === 4) return img;
  const { width, height, ch, data } = img;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = data[i * ch];
    rgba[i * 4 + 1] = data[i * ch + 1];
    rgba[i * 4 + 2] = data[i * ch + 2];
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, ch: 4, data: rgba };
}

/** 双线性缩放 */
function resize(img, dw, dh) {
  const { width: sw, height: sh, data } = img;
  const dst = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = (y + 0.5) * sh / dh - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(sy)));
    const y1 = Math.max(0, Math.min(sh - 1, y0 + 1));
    const fy = Math.max(0, Math.min(1, sy - y0));
    for (let x = 0; x < dw; x++) {
      const sx = (x + 0.5) * sw / dw - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(sx)));
      const x1 = Math.max(0, Math.min(sw - 1, x0 + 1));
      const fx = Math.max(0, Math.min(1, sx - x0));
      for (let c = 0; c < 4; c++) {
        const p00 = data[(y0 * sw + x0) * 4 + c];
        const p10 = data[(y0 * sw + x1) * 4 + c];
        const p01 = data[(y1 * sw + x0) * 4 + c];
        const p11 = data[(y1 * sw + x1) * 4 + c];
        const top = p00 + (p10 - p00) * fx;
        const bot = p01 + (p11 - p01) * fx;
        dst[(y * dw + x) * 4 + c] = Math.round(top + (bot - top) * fy);
      }
    }
  }
  return { width: dw, height: dh, ch: 4, data: dst };
}

/* ---------- 主流程 ---------- */
if (!fs.existsSync(SRC)) {
  console.error('源图标不存在：' + SRC);
  process.exit(1);
}

const img = toRGBA(decodePNG(fs.readFileSync(SRC)));
const { width: W, height: H, data } = img;
console.log(`源图：${W}x${H}`);

/* 1) 诊断：打印四角与底部条带颜色 */
const px = (x, y) => {
  const i = (Math.round(y) * W + Math.round(x)) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};
console.log('左上角：', px(W * 0.02, H * 0.02).join(','));
console.log('右上角：', px(W * 0.98, H * 0.02).join(','));
console.log('左下角：', px(W * 0.02, H * 0.98).join(','));
console.log('右下角(水印区)：', px(W * 0.98, H * 0.98).join(','));

/* 2) 取底部干净区域的中位色作为背景色 */
const bandY0 = Math.floor(H * 0.88);
const bandX1 = Math.floor(W * 0.45);   // 左半底部是干净的
const samples = [];
for (let y = bandY0; y < H - 2; y += 2) {
  for (let x = 2; x < bandX1; x += 2) {
    const i = (y * W + x) * 4;
    samples.push(data[i] * 65536 + data[i + 1] * 256 + data[i + 2]);
  }
}
samples.sort((a, b) => a - b);
const mid = samples[Math.floor(samples.length / 2)];
const bg = [(mid >> 16) & 255, (mid >> 8) & 255, mid & 255];
console.log('底部背景中位色：', bg.join(','), `（样本 ${samples.length}）`);

/* 3) 修补右下角水印区（纯背景，直接填背景色） */
const patchX0 = Math.floor(W * 0.52);
const patchY0 = Math.floor(H * 0.85);
let patched = 0;
for (let y = patchY0; y < H; y++) {
  for (let x = patchX0; x < W; x++) {
    const i = (y * W + x) * 4;
    data[i] = bg[0]; data[i + 1] = bg[1]; data[i + 2] = bg[2]; data[i + 3] = 255;
    patched++;
  }
}
console.log(`已修补 ${patched} 像素（右下 ${W - patchX0}x${H - patchY0} 区）`);

/* 4) 输出各尺寸 */
const outputs = [
  { file: path.join(ROOT, 'miniprogram', 'assets', 'icon.png'), size: 1024 },
  { file: path.join(ROOT, 'miniprogram', 'assets', 'icon-144.png'), size: 144 },
  { file: path.join(ROOT, 'web', 'assets', 'icon-512.png'), size: 512 },
  { file: path.join(ROOT, 'web', 'assets', 'icon-192.png'), size: 192 },
  { file: path.join(ROOT, 'web', 'assets', 'icon-180.png'), size: 180 },
  { file: path.join(ROOT, 'web', 'assets', 'icon-maskable.png'), size: 512 }
];

outputs.forEach(({ file, size }) => {
  const out = size === W ? img : resize(img, size, size);
  const png = encodePNG(size, size, out.data);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  console.log(`[OK] ${path.relative(ROOT, file)}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
});

/* 5) 清理原始 AI 文件（保留成品） */
const raw1 = path.join(ROOT, 'miniprogram', 'assets', 'A_mobile_app_icon_design_for_a_2026-10-20T08-36-42.png');
const raw2 = SRC;
[raw1, raw2].forEach((f) => {
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    console.log('[清理] ' + path.relative(ROOT, f));
  }
});

console.log('\n图标后处理完成');
