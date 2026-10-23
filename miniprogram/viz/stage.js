/**
 * 波形台 · 小程序版（Canvas 2D）
 * ---------------------------------------------------------------
 * 与网页版同一套视觉：暗调展厅 + 青铜金属板卦体 + 湍流丝缕云雾。
 * 两处平台差异：
 *   1. 小程序无 ctx.filter → 雾的「体积感」改用**离屏降采样回插**做柔化
 *      （辉光层画在 1/3 分辨率离屏画布上，再放大回插，等效一次模糊）。
 *   2. 小程序无 AnalyserNode → 频谱由**当前乐谱按播放位置推算**
 *      （player.genPos 提供 elapsed 与 score.notes），确定且不失真。
 */
'use strict';

const VIZ_YAW = 0.17;      // 方位角：露出一线右端面
const VIZ_PITCH = 0.26;    // 仰角：露出一线顶面

/* ---------- 工具 ---------- */

function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, oct) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < (oct || 3); i++) { s += amp * vnoise(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return s;
}
/** 圆角矩形路径（小程序未必支持 ctx.roundRect） */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/**
 * 由乐谱与播放位置推算频谱
 * @param score  core/music.js 的乐谱（notes: {time,dur,midi,vel}）
 * @param elapsed 当前播放位置（秒）
 * @param bins 频段数
 */
function spectrumFromScore(score, elapsed, bins) {
  const out = new Float32Array(bins);
  if (!score || !score.notes || !score.notes.length) return out;
  const win = 0.7;                      // 时间窗（秒）
  for (let i = 0; i < score.notes.length; i++) {
    const n = score.notes[i];
    const t0 = n.time, t1 = n.time + (n.dur || 0.2);
    if (elapsed < t0 - win || elapsed > t1 + win) continue;
    let a;
    if (elapsed >= t0 && elapsed <= t1) a = 1;
    else if (elapsed < t0) a = Math.max(0, 1 - (t0 - elapsed) / win);
    else a = Math.max(0, 1 - (elapsed - t1) / win);
    a *= (n.vel != null ? n.vel : 0.8);
    const midi = n.midi != null ? n.midi : 60;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    // 频率 → 频段（40Hz ~ 5kHz 对数分布）
    const pos = Math.log(freq / 40) / Math.log(5000 / 40);
    const bin = Math.min(bins - 1, Math.max(0, Math.round(pos * (bins - 1))));
    out[bin] += a;
  }
  let mx = 0;
  for (let i = 0; i < bins; i++) if (out[i] > mx) mx = out[i];
  if (mx > 0) for (let i = 0; i < bins; i++) out[i] = Math.min(1, out[i] / mx);
  return out;
}

/* ===============================================================
   波形台
   =============================================================== */

function createStage() {
  /* 状态 */
  let ctx = null, W = 0, H = 0, dpr = 1;
  let model = null;          // 卦体几何
  let parts = [];            // 丝缕粒子
  let filT = 0;
  let spec = new Float32Array(48);   // 频谱
  let level = 0, low = 0, high = 0;
  let bass = 0;
  let playing = false;
  let intro = 0;
  let fogLayer = null, fogCtx = null;   // 离屏辉光层
  let fogUnsupported = false;          // 基础库不支持离屏画布时降级

  /* ---------- 几何 ---------- */
  function buildModel(rows) {
    const barH = 12, gap = 23;
    const totalH = (rows.length - 1) * gap + barH + 14;
    const scale = Math.min(W / 340, (H * 0.52) / totalH);
    const cy = H * 0.47;
    const bottomEdge = cy + ((rows.length - 1) / 2) * gap * scale + (barH / 2) * scale;
    const pedestalH = Math.max(5, H * 0.032);
    const baseY = bottomEdge + 1;
    const floorY = baseY + pedestalH;
    return {
      cx: W * 0.5, cy, baseY, floorY, pedestalH, scale,
      hx: 62, hy: barH / 2, hz: 13, gap, rows: rows.slice(),
      barRGB: [140, 104, 66], movRGB: [180, 102, 68], edgeRGB: [18, 12, 8],
      goldRGB: [255, 202, 132]
    };
  }

  /* ---------- 卦体（正交三面） ---------- */
  function drawYao(geo, x0w, x1w, y, energy, isMov, fade, mirror) {
    const s = geo.scale;
    const hx = (x1w - x0w) / 2;
    const hy = geo.hy, hz = geo.hz;
    const halfW = hx * s, halfH = hy * s;
    let x0 = geo.cx + x0w * s, x1 = geo.cx + x1w * s;
    let cy = geo.cy - y * s;
    let ddx = -hz * Math.sin(VIZ_YAW) * s;
    let ddy = -hz * Math.sin(VIZ_PITCH) * s;
    if (mirror) { cy = 2 * geo.floorY - cy; ddy = -ddy; }
    const yTop = cy - halfH, yBot = cy + halfH;
    const bw = x1 - x0, bh = yBot - yTop;

    const base = isMov ? geo.movRGB : geo.barRGB;
    const edge = geo.edgeRGB;
    const glow = Math.min(1, 0.30 + energy * 1.5 + (isMov ? 0.28 : 0));
    const lit = (k) => 'rgba(' + Math.round(Math.min(255, base[0] * k)) + ',' +
      Math.round(Math.min(255, base[1] * k)) + ',' + Math.round(Math.min(255, base[2] * k)) + ',' + fade + ')';

    // 右端面（最暗）
    ctx.fillStyle = lit(0.22 + glow * 0.08);
    ctx.beginPath();
    ctx.moveTo(x1, yTop); ctx.lineTo(x1, yBot);
    ctx.lineTo(x1 + ddx, yBot + ddy); ctx.lineTo(x1 + ddx, yTop + ddy);
    ctx.closePath(); ctx.fill();

    // 顶面（最亮）
    const gTop = ctx.createLinearGradient(x0, yTop, x1, yTop + ddy);
    gTop.addColorStop(0, lit(1.45 + glow * 0.32));
    gTop.addColorStop(0.55, lit(1.06 + glow * 0.20));
    gTop.addColorStop(1, lit(0.72 + glow * 0.10));
    ctx.fillStyle = gTop;
    ctx.beginPath();
    ctx.moveTo(x0, yTop); ctx.lineTo(x1, yTop);
    ctx.lineTo(x1 + ddx, yTop + ddy); ctx.lineTo(x0 + ddx, yTop + ddy);
    ctx.closePath(); ctx.fill();

    // 正面（暗面：金属靠高光提亮）
    const gFront = ctx.createLinearGradient(x0, yTop, x0 + bw * 0.30, yBot);
    gFront.addColorStop(0, lit(0.58 + glow * 0.22));
    gFront.addColorStop(0.22, lit(0.36 + glow * 0.13));
    gFront.addColorStop(0.66, lit(0.17 + glow * 0.07));
    gFront.addColorStop(1, lit(0.09 + glow * 0.04));
    ctx.fillStyle = gFront;
    ctx.fillRect(x0, yTop, bw, bh);

    // 拉丝纹理
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, yTop, bw, bh); ctx.clip();
    const seed = Math.round(cy * 13 + hx * 7);
    for (let i = 0; i < 16; i++) {
      const yy = yTop + (bh * (i + 0.5)) / 16 + (hash2(seed, i) - 0.5) * bh * 0.05;
      const a = (0.025 + hash2(seed, i + 40) * 0.08) * fade;
      ctx.strokeStyle = hash2(seed, i + 80) > 0.48
        ? 'rgba(255,248,232,' + a + ')' : 'rgba(26,16,8,' + (a * 1.1) + ')';
      ctx.lineWidth = 0.5 + hash2(seed, i + 120) * 1.1;
      ctx.beginPath(); ctx.moveTo(x0 - 2, yy); ctx.lineTo(x1 + 2, yy); ctx.stroke();
    }
    // 镜面反光带
    const ms = ctx.createLinearGradient(x0, yTop + bh * 0.1, x0 + bw * 0.62, yBot);
    ms.addColorStop(0, 'rgba(255,255,255,0)');
    ms.addColorStop(0.4, 'rgba(255,246,228,' + (0.04 + energy * 0.08) * fade + ')');
    ms.addColorStop(0.52, 'rgba(255,252,242,' + (0.10 + energy * 0.13) * fade + ')');
    ms.addColorStop(0.64, 'rgba(255,255,255,0)');
    ctx.fillStyle = ms;
    ctx.fillRect(x0 - 2, yTop - 2, bw + 4, bh + 4);
    ctx.restore();

    // 上下倒角
    ctx.strokeStyle = 'rgba(255,246,224,' + (0.09 + energy * 0.10) * fade + ')';
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x0, yTop); ctx.lineTo(x1, yTop); ctx.stroke();
    ctx.strokeStyle = 'rgba(10,6,3,' + 0.42 * fade + ')';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x0, yBot); ctx.lineTo(x1, yBot); ctx.stroke();

    // 边缘暖金自发光
    const gold = geo.goldRGB.join(',');
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(' + gold + ',' + (0.035 + energy * 0.065) * fade + ')';
    ctx.lineWidth = Math.max(2.2, bh * 0.38);
    ctx.beginPath(); ctx.moveTo(x0, yBot - bh * 0.1); ctx.lineTo(x1, yBot - bh * 0.1); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(' + gold + ',' + (0.15 + energy * 0.15) * fade + ')';
    ctx.lineWidth = Math.max(0.7, bh * 0.075);
    ctx.beginPath(); ctx.moveTo(x0 + 1, yBot - bh * 0.1); ctx.lineTo(x1 - 1, yBot - bh * 0.1); ctx.stroke();

    // 描边
    ctx.strokeStyle = 'rgba(' + edge.join(',') + ',' + 0.42 * fade + ')';
    ctx.lineWidth = 0.9;
    ctx.strokeRect(x0, yTop, bw, bh);
  }

  /* ---------- 房间 ---------- */
  function drawRoom(geo, energy) {
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, '#151f29');
    base.addColorStop(0.52, '#0e161f');
    base.addColorStop(1, '#070b11');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    const vpx = geo.cx;
    const vpy = Math.max(geo.cy - H * 0.04, geo.floorY - (H - geo.floorY) * 0.58);

    // 尽头光池
    const pool = ctx.createRadialGradient(vpx, vpy, 4, vpx, vpy, Math.max(W, H) * 0.72);
    pool.addColorStop(0, 'rgba(96,140,180,' + (0.055 + energy * 0.05) + ')');
    pool.addColorStop(0.28, 'rgba(86,124,158,' + (0.030 + energy * 0.03) + ')');
    pool.addColorStop(1, 'rgba(76,112,142,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, W, H);

    // 地面
    ctx.save();
    ctx.beginPath(); ctx.rect(0, vpy, W, H - vpy); ctx.clip();
    const fg = ctx.createLinearGradient(0, vpy, 0, H);
    fg.addColorStop(0, 'rgba(30,44,60,0)');
    fg.addColorStop(0.22, 'rgba(30,44,60,0.5)');
    fg.addColorStop(1, 'rgba(14,21,30,0.92)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, vpy, W, H - vpy);
    // 辐线（自灭点淡出）
    ctx.lineWidth = 1;
    for (let i = -7; i <= 7; i++) {
      if (i === 0) continue;
      const ex = vpx + i * (W * 0.19);
      const ga = 0.030 + energy * 0.024;
      const lg = ctx.createLinearGradient(vpx, vpy, ex, H);
      lg.addColorStop(0, 'rgba(122,158,188,0)');
      lg.addColorStop(0.26, 'rgba(122,158,188,' + (ga * 0.3) + ')');
      lg.addColorStop(1, 'rgba(122,158,188,' + ga + ')');
      ctx.strokeStyle = lg;
      ctx.beginPath(); ctx.moveTo(vpx, vpy); ctx.lineTo(ex, H + 6); ctx.stroke();
    }
    // 横向档线
    const RUNGS = 7;
    for (let i = 1; i <= RUNGS; i++) {
      const f = Math.pow(i / RUNGS, 2.1);
      const y = vpy + (H - vpy) * f;
      const ga = (0.022 + 0.09 * f + energy * 0.03) * Math.min(1, f * 2.6);
      ctx.strokeStyle = 'rgba(122,158,188,' + ga + ')';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();

    // 墙灯
    const lit = 0.55 + energy * 0.45;
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const spread = 0.30 - t * 0.19;
      const y = vpy - H * 0.16 * (1 - t) - H * 0.02;
      const ww = W * (0.052 - t * 0.026);
      const hh = Math.max(2.2, H * 0.013 * (1 - t * 0.4));
      [vpx - W * spread, vpx + W * spread].forEach((cx) => {
        const g = ctx.createLinearGradient(cx - ww / 2, 0, cx + ww / 2, 0);
        g.addColorStop(0, 'rgba(150,196,230,0)');
        g.addColorStop(0.5, 'rgba(150,196,230,' + (0.26 - t * 0.14) * lit + ')');
        g.addColorStop(1, 'rgba(150,196,230,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - ww / 2, y, ww, hh);
      });
    }

    // 天花板筒灯
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const y = H * (0.035 + t * 0.075);
      const len = W * (0.46 - t * 0.24);
      const th = Math.max(1.4, H * 0.013 * (1 - t * 0.5));
      const a = (0.52 - t * 0.26) * lit;
      const g = ctx.createLinearGradient(vpx - len / 2, 0, vpx + len / 2, 0);
      g.addColorStop(0, 'rgba(198,224,255,0)');
      g.addColorStop(0.5, 'rgba(198,224,255,' + (a * 0.3) + ')');
      g.addColorStop(1, 'rgba(198,224,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(vpx - len / 2, y - th * 2.6, len, th * 6.2);
      const tube = ctx.createLinearGradient(0, y, 0, y + th);
      tube.addColorStop(0, 'rgba(240,248,255,' + a + ')');
      tube.addColorStop(1, 'rgba(206,226,248,' + (a * 0.5) + ')');
      ctx.fillStyle = tube;
      roundRect(ctx, vpx - len / 2, y, len, th, th / 2);
      ctx.fill();
    }

    // 地平线亮线
    const hz = ctx.createLinearGradient(0, vpy - 1, 0, vpy + 1.5);
    hz.addColorStop(0, 'rgba(190,214,240,0)');
    hz.addColorStop(0.5, 'rgba(190,214,240,' + 0.2 * lit + ')');
    hz.addColorStop(1, 'rgba(190,214,240,0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, vpy - 1, W, 2.5);

    // 暗角
    const vg = ctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.34, W / 2, H * 0.46, Math.max(W, H) * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.40)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------- 气口 ---------- */
  function drawPorts(geo, energy) {
    const R = Math.min(H * 0.34, 132);
    const cy = geo.cy;
    const rx = R * 0.44, ry = R * 1.0;
    const lit = 0.55 + energy * 0.45;
    [{ x: -R * 0.26, dir: 1 }, { x: W + R * 0.26, dir: -1 }].forEach((v) => {
      const cx = v.x;
      // 孔外辉光
      const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, ry * 1.5);
      glow.addColorStop(0, 'rgba(176,214,244,' + 0.20 * lit + ')');
      glow.addColorStop(0.35, 'rgba(140,182,220,' + 0.075 * lit + ')');
      glow.addColorStop(1, 'rgba(120,164,204,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - ry * 1.6, cy - ry * 1.6, ry * 3.2, ry * 3.2);
      // 体积光锥
      const coneLen = W * 0.52;
      const cone = ctx.createLinearGradient(cx, 0, cx + v.dir * coneLen, 0);
      cone.addColorStop(0, 'rgba(196,226,250,' + 0.085 * lit + ')');
      cone.addColorStop(0.3, 'rgba(150,192,228,' + 0.03 * lit + ')');
      cone.addColorStop(1, 'rgba(140,182,220,0)');
      ctx.beginPath();
      ctx.moveTo(cx, cy - ry * 0.92); ctx.lineTo(cx, cy + ry * 0.92);
      ctx.lineTo(cx + v.dir * coneLen, cy + ry * 1.35);
      ctx.lineTo(cx + v.dir * coneLen, cy - ry * 1.35);
      ctx.closePath();
      ctx.fillStyle = cone;
      ctx.fill();
      // 金属环
      const ringW = Math.max(3, rx * 0.3);
      const ring = ctx.createLinearGradient(cx - ringW, cy - ry, cx + ringW, cy + ry);
      ring.addColorStop(0, 'rgba(96,112,130,.92)');
      ring.addColorStop(0.35, 'rgba(48,58,72,.95)');
      ring.addColorStop(0.7, 'rgba(78,92,108,.9)');
      ring.addColorStop(1, 'rgba(26,32,42,.95)');
      ctx.strokeStyle = ring;
      ctx.lineWidth = ringW;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx + ringW / 2, ry + ringW / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(226,240,255,' + 0.55 * lit + ')';
      ctx.lineWidth = Math.max(0.8, ringW * 0.28);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx + ringW / 2, ry + ringW / 2, 0, Math.PI * 1.05, Math.PI * 1.85);
      ctx.stroke();
      // 内芯
      const inner = ctx.createRadialGradient(cx, cy, 1, cx, cy, rx * 1.25);
      inner.addColorStop(0, 'rgba(255,255,255,' + 0.98 * lit + ')');
      inner.addColorStop(0.22, 'rgba(222,240,255,' + 0.80 * lit + ')');
      inner.addColorStop(0.62, 'rgba(150,196,236,' + 0.34 * lit + ')');
      inner.addColorStop(1, 'rgba(96,140,190,0)');
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 1.22, ry * 0.98, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /* ---------- 底座与倒影 ---------- */
  function drawPedestal(geo) {
    const rx = geo.hx * geo.scale * 1.32;
    const ry = Math.max(3, rx * 0.21);
    const y = geo.baseY, ph = geo.pedestalH;
    const side = ctx.createLinearGradient(0, y, 0, y + ph);
    side.addColorStop(0, 'rgba(44,50,60,.96)');
    side.addColorStop(1, 'rgba(13,16,21,.96)');
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.ellipse(geo.cx, y + ph, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,214,150,.20)';
    ctx.beginPath();
    ctx.ellipse(geo.cx, y, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawReflection(geo, moving) {
    const rows = geo.rows;
    const modelH = (rows.length - 1) * geo.gap * geo.scale + geo.hy * geo.scale * 2;
    for (let i = rows.length - 1; i >= 0; i--) {
      const yang = rows[i] === 1;
      const y = ((rows.length - 1) / 2 - i) * geo.gap;
      const isMov = moving.indexOf(rows.length - i) >= 0;
      const yScreen = geo.cy - y * geo.scale;
      const depth = Math.max(0, geo.floorY - yScreen);
      const fade = 0.26 * Math.max(0.05, 1 - depth / Math.max(1, modelH * 0.95));
      if (fade < 0.012) continue;
      const segs = yang ? [[-geo.hx, geo.hx]] : [[-geo.hx, -13], [13, geo.hx]];
      for (let k = 0; k < segs.length; k++) {
        drawYao(geo, segs[k][0], segs[k][1], y, 0.2, isMov, fade, 1);
      }
    }
  }

  /* ---------- 丝缕 ---------- */
  function spawnPart(geo) {
    const R = Math.min(H * 0.34, 132);
    const fromLeft = Math.random() < 0.5;
    const px = fromLeft ? -R * 0.26 : W + R * 0.26;
    const a = (Math.random() - 0.5) * 2.2;
    const rr = Math.sqrt(Math.random());
    parts.push({
      x: px + Math.cos(a) * R * 0.44 * rr,
      y: geo.cy + Math.sin(a) * R * 1.0 * rr,
      lane: Math.random() * 2 - 1,
      spread: H * 0.33 * (0.82 + Math.random() * 0.36),
      z: (Math.random() * 2 - 1) * 0.85,
      dir: fromLeft ? 1 : -1,
      swirl: Math.random() < 0.5 ? 1 : -1,
      age: 0, life: 170 + Math.random() * 230,
      w: 0.4 + Math.random() * 0.85,
      gold: Math.random() * 0.42,
      trail: []
    });
  }

  function updateParts(dt, geo) {
    const k = dt / 16.7;
    filT += dt;
    const F = 0.0052, E = 2.0;
    const mcx = geo.cx, mcy = geo.cy;
    const modelHalfH = (geo.gap * (geo.rows.length - 1) * geo.scale * 0.5) + geo.hy * geo.scale + 10;
    const tOff = filT * 0.0011;
    const turbK = 0.55 + high * 0.85;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age++;
      if (p.age > p.life || p.x < -W * 0.4 || p.x > W * 1.4) { parts.splice(i, 1); continue; }
      const dx = p.x - mcx, dy = p.y - mcy;
      const dist = Math.hypot(dx, dy) + 1;
      const tanX = -dy / dist, tanY = dx / dist;
      const near = Math.max(0, 1 - dist / (W * 0.40));
      const waist = Math.exp(-Math.pow((p.x - mcx) / (W * 0.30), 2));
      const inner = modelHalfH * 0.94;
      const outer = inner + Math.max(0, p.spread - inner) * (1 - waist);
      const off = inner + (outer - inner) * Math.abs(p.lane);
      const yT = mcy + (p.lane >= 0 ? -off : off);
      let vx = p.dir * (1.9 + level * 2.4);
      let vy = (yT - p.y) * 0.062;
      const swirl = near * near * 1.15 * p.swirl;
      vx += tanX * swirl;
      vy += tanY * swirl * 0.5;
      const n0 = fbm(p.x * F, p.y * F + tOff, 3);
      const nx = fbm((p.x + E) * F, p.y * F + tOff, 3);
      const ny = fbm(p.x * F, (p.y + E) * F + tOff, 3);
      let cx = (ny - n0) / E * 900, cy = -(nx - n0) / E * 900;
      cx = Math.max(-2.4, Math.min(2.4, cx));
      cy = Math.max(-2.4, Math.min(2.4, cy));
      vx += cx * turbK * 1.05;
      vy += cy * turbK * 1.05;
      p.x += vx * k;
      p.y += vy * k;
      p.z += (Math.random() - 0.5) * 0.016 + p.dir * 0.0018;
      const ps = 1 / (1 + p.z * 0.11);
      p.trail.push(mcx + (p.x - mcx) * ps, mcy + (p.y - mcy) * ps);
      if (p.trail.length > 14) p.trail.splice(0, 2);
    }
  }

  /** 绘制丝缕（pass: 'behind' | 'front'） */
  function drawParts(geo, pass) {
    if (!parts.length) return;
    const back = pass === 'behind';
    // 辉光层画进离屏画布（1/3 分辨率），再放大回插 → 等效一次模糊
    if (!fogLayer && !fogUnsupported) {
      try {
        fogLayer = wx.createOffscreenCanvas({ type: '2d', width: 8, height: 8 });
        fogCtx = fogLayer.getContext('2d');
      } catch (e) {
        // 基础库不支持离屏画布 → 辉光直接画主画布（少了柔化，其余照常）
        fogUnsupported = true;
      }
    }
    if (fogUnsupported) {
      drawPartsDirect(geo, back, pass);
      return;
    }
    const scale = 1 / 3;
    const lw = Math.max(2, Math.round(W * scale)), lh = Math.max(2, Math.round(H * scale));
    if (fogLayer.width !== lw || fogLayer.height !== lh) { fogLayer.width = lw; fogLayer.height = lh; }
    const g = fogCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, lw, lh);
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const cores = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if ((p.z < 0) !== back) continue;
      const t = p.trail;
      if (t.length < 4) continue;
      const fadeIn = Math.min(1, p.age / 20);
      const fadeOut = Math.min(1, (p.life - p.age) / 45);
      const near = Math.max(0, 1 - Math.hypot(p.x - geo.cx, p.y - geo.cy) / (geo.hx * geo.scale * 2.8));
      const gAmt = Math.max(0, Math.min(1, near * near * 1.5 + p.gold * 0.20));
      const r = Math.round(198 + gAmt * 57), gg = Math.round(232 - gAmt * 46), b = Math.round(255 - gAmt * 140);
      const depthK = back ? 0.34 : 1;
      const a = intro * fadeIn * fadeOut * depthK * (0.019 + 0.032 * level) * p.w * (0.75 + near * 1.25);
      if (a < 0.003) continue;
      g.strokeStyle = 'rgba(' + r + ',' + gg + ',' + b + ',' + a + ')';
      g.lineWidth = (7.5 + p.w * 13.5) * (back ? 0.68 : 1);
      g.beginPath();
      g.moveTo(t[0], t[1]);
      for (let k = 2; k < t.length; k += 2) g.lineTo(t[k], t[k + 1]);
      g.stroke();
      cores.push([t, r, gg, b, a, p, back]);
    }
    // 辉光层叠回（放大回插即柔化）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(fogLayer, 0, 0, W, H);
    ctx.restore();
    // 芯层：细而亮，画在主画布上
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < cores.length; i++) {
      const c = cores[i];
      ctx.strokeStyle = 'rgba(' + c[1] + ',' + c[2] + ',' + c[3] + ',' + (c[4] * 0.85) + ')';
      ctx.lineWidth = (0.6 + c[5].w * 1.3) * (c[6] ? 0.65 : 1);
      ctx.beginPath();
      ctx.moveTo(c[0][0], c[0][1]);
      for (let k = 2; k < c[0].length; k += 2) ctx.lineTo(c[0][k], c[0][k + 1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 降级：无离屏画布时，辉光直接画在主画布上 */
  function drawPartsDirect(geo, back, pass) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if ((p.z < 0) !== back) continue;
      const t = p.trail;
      if (t.length < 4) continue;
      const fadeIn = Math.min(1, p.age / 20);
      const fadeOut = Math.min(1, (p.life - p.age) / 45);
      const near = Math.max(0, 1 - Math.hypot(p.x - geo.cx, p.y - geo.cy) / (geo.hx * geo.scale * 2.8));
      const gAmt = Math.max(0, Math.min(1, near * near * 1.5 + p.gold * 0.20));
      const r = Math.round(198 + gAmt * 57), gg = Math.round(232 - gAmt * 46), b = Math.round(255 - gAmt * 140);
      const depthK = back ? 0.34 : 1;
      const a = intro * fadeIn * fadeOut * depthK * (0.014 + 0.024 * level) * p.w * (0.75 + near * 1.25);
      if (a < 0.003) continue;
      ctx.strokeStyle = 'rgba(' + r + ',' + gg + ',' + b + ',' + a + ')';
      ctx.lineWidth = (4 + p.w * 6) * (back ? 0.68 : 1);
      ctx.beginPath();
      ctx.moveTo(t[0], t[1]);
      for (let k = 2; k < t.length; k += 2) ctx.lineTo(t[k], t[k + 1]);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(' + r + ',' + gg + ',' + b + ',' + (a * 0.85) + ')';
      ctx.lineWidth = (0.6 + p.w * 1.3) * (back ? 0.65 : 1);
      ctx.beginPath();
      ctx.moveTo(t[0], t[1]);
      for (let k = 2; k < t.length; k += 2) ctx.lineTo(t[k], t[k + 1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- 对外 ---------- */
  return {
    /** 初始化画布 */
    init(canvas, dprScale) {
      ctx = canvas.getContext('2d');
      dpr = dprScale || 1;
      W = canvas.width; H = canvas.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    },
    resize(w, h) { W = w; H = h; },
    /** 设置卦象（rows: 0/1 数组，moving: 动爻位） */
    setHex(rows, moving) {
      model = buildModel(rows || [1, 0, 1, 0, 1, 0]);
      model.moving = moving || [];
    },
    /** 喂入频谱（Float32Array）与播放状态 */
    feed(spectrum, isPlaying) {
      if (spectrum) spec = spectrum;
      playing = isPlaying;
      // 归一派生量
      let lo = 0, hi = 0;
      const n = spec.length;
      for (let i = 0; i < n * 0.22; i++) lo += spec[i];
      for (let i = Math.floor(n * 0.72); i < n; i++) hi += spec[i];
      low = lo / Math.max(1, n * 0.22);
      high = hi / Math.max(1, n * 0.28);
      let s = 0;
      for (let i = 0; i < n; i++) s += spec[i];
      level = Math.min(1, (s / n) * 1.6);
      bass = low;
    },
    /** 主绘制 */
    draw(dt) {
      if (!ctx || !model) return;
      const energy = Math.min(1, level * 1.4 + bass * 0.6);
      intro = playing ? Math.min(1, intro + dt / 2000) : Math.max(0, intro - dt / 600);
      drawRoom(model, energy);
      drawPorts(model, energy);
      drawPedestal(model);
      drawReflection(model, model.moving || []);
      if (playing) {
        updateParts(dt, model);
        if (parts.length < 260) spawnPart(model);
      }
      drawParts(model, 'behind');
      // 卦体
      const rows = model.rows;
      for (let i = rows.length - 1; i >= 0; i--) {
        const yang = rows[i] === 1;
        const y = ((rows.length - 1) / 2 - i) * model.gap;
        const isMov = (model.moving || []).indexOf(rows.length - i) >= 0;
        const e = 0.2 + energy * 0.5;
        const segs = yang ? [[-model.hx, model.hx]] : [[-model.hx, -13], [13, model.hx]];
        for (let k = 0; k < segs.length; k++) {
          drawYao(model, segs[k][0], segs[k][1], y, e, isMov, 1, 0);
        }
      }
      drawParts(model, 'front');
      // 卦体的暖金辉光
      const bloomR = model.hx * model.scale * 2.8;
      const bloom = ctx.createRadialGradient(model.cx, model.cy, 4, model.cx, model.cy, bloomR);
      bloom.addColorStop(0, 'rgba(255,198,124,' + 0.115 * (0.45 + energy * 0.75) + ')');
      bloom.addColorStop(0.4, 'rgba(255,172,104,' + 0.04 * (0.45 + energy * 0.75) + ')');
      bloom.addColorStop(1, 'rgba(255,160,90,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = bloom;
      ctx.fillRect(model.cx - bloomR, model.cy - bloomR, bloomR * 2, bloomR * 2);
      ctx.restore();
    },
    /** 由 player 的 genPos 推算频谱 */
    spectrumFrom(genPos, bins) {
      if (!genPos) return new Float32Array(bins || 48);
      return spectrumFromScore(genPos.score, genPos.elapsed, bins || 48);
    },
    stats() { return { parts: parts.length, level: level, intro: intro }; }
  };
}

module.exports = { createStage, spectrumFromScore };
