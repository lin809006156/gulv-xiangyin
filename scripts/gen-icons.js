/**
 * 生成 PWA / APP 所需的 PNG 图标
 * ---------------------------------------------------------------
 * 不依赖任何图形库：手写 PNG 编码器（IHDR + IDAT + IEND），
 * 用最小 2x2 缩放的位图放大到目标尺寸。
 *
 * 用法：node scripts/gen-icons.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.resolve(__dirname, '..', 'web', 'assets');

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

/* ---------- PNG 编码 ---------- */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * 编码 8 位 RGBA PNG
 * @param {number} w
 * @param {number} h
 * @param {Buffer} rgba 长度 w*h*4
 */
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // color type RGBA
  ihdr[10] = 0;   // compression
  ihdr[11] = 0;   // filter
  ihdr[12] = 0;   // interlace

  // 原始扫描行（每行加 filter byte 0）
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 4);
    raw[off] = 0;
    rgba.copy(raw, off + 1, y * w * 4, (y + 1) * w * 4);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 绘制 ---------- */

/**
 * 在 RGBA 缓冲上绘制图标
 * @param {number} size
 * @param {boolean} maskable 可遮罩图标（内容缩到安全区内）
 */
function drawIcon(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);

  const px = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const sa = a / 255;
    const da = buf[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / oa);
    buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa);
    buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa);
    buf[i + 3] = Math.round(oa * 255);
  };

  const rect = (x0, y0, w, h, r, g, b, a) => {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) {
        px(x, y, r, g, b, a);
      }
    }
  };

  const roundRect = (x0, y0, w, h, rad, r, g, b, a) => {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) {
        // 圆角判定
        const dx = Math.max(x0 + rad - x, 0, x - (x0 + w - rad));
        const dy = Math.max(y0 + rad - y, 0, y - (y0 + h - rad));
        if (dx * dx + dy * dy <= rad * rad) px(x, y, r, g, b, a);
      }
    }
  };

  const S = size;

  if (maskable) {
    // 可遮罩图标：满幅背景，安全区 80%
    rect(0, 0, S, S, 245, 240, 230, 255);
    const inset = S * 0.16;
    const box = S - inset * 2;
    roundRect(inset, inset, box, box, S * 0.05, 251, 248, 241, 255);
  } else {
    // 常规图标：圆角方形背景
    roundRect(0, 0, S, S, S * 0.19, 245, 240, 230, 255);
    const inset = S * 0.19;
    const box = S - inset * 2;
    roundRect(inset, inset, box, box, S * 0.04, 251, 248, 241, 255);
  }

  // 卦符：三爻皆阳（乾卦）
  const barW = S * 0.45;
  const barH = S * 0.038;
  const gap = S * 0.115;
  const startY = S * 0.335;
  for (let i = 0; i < 3; i++) {
    const y = startY + i * gap;
    roundRect((S - barW) / 2, y, barW, barH, barH / 2, 43, 38, 32, 255);
  }

  // 顶部朱砂点
  const dotR = S * 0.036;
  const dotY = S * 0.265;
  for (let y = Math.round(dotY - dotR); y <= Math.round(dotY + dotR); y++) {
    for (let x = Math.round(S / 2 - dotR); x <= Math.round(S / 2 + dotR); x++) {
      const dx = x - S / 2, dy = y - dotY;
      if (dx * dx + dy * dy <= dotR * dotR) px(x, y, 178, 58, 46, 255);
    }
  }

  return buf;
}

/* ---------- 输出 ---------- */
const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-180.png', size: 180, maskable: false },
  { name: 'icon-maskable.png', size: 512, maskable: true }
];

fs.mkdirSync(OUT, { recursive: true });

targets.forEach((t) => {
  const rgba = drawIcon(t.size, t.maskable);
  const png = encodePNG(t.size, t.size, rgba);
  const p = path.join(OUT, t.name);
  fs.writeFileSync(p, png);
  console.log(`[OK] ${t.name}  ${t.size}x${t.size}  ${(png.length / 1024).toFixed(1)} KB`);
});

console.log('\n图标生成完毕');
