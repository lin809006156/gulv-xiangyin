/**
 * 古律象音 · 波形台渲染核心（跨端共用）
 * ---------------------------------------------------------------
 * 网页版与微信小程序端**共用这一份**画面代码 —— 以前两端各写一套，
 * 结果小程序的效果永远追不上网页、且改一处忘一处，故抽出成本模块。
 *
 * 画面构成（与参考图 1:1）：
 *   · 暗调展厅：尽头柔光池、透视格线地面、两侧墙灯、天花板筒灯、暗角
 *   · 灭点藏在卦象脚下略上方，地面辐线自灭点淡出 → 画面里找不到聚焦点
 *   · 卦体：**正交三面**的青铜金属板（正面矩形 + 顶面/端面平行四边形），
 *     绝不因透视被拉成梯形
 *   · 湍流丝缕云雾：自左右气口涌入，在卦象处收腰分瓣（固定「轨道位」）
 *   · 镜面地面：卦体倒影 + 雾影 + 模型暖光带
 *
 * 平台无关性（本模块只用标准 Canvas 2D 路径 API）：
 *   · 无 ctx.filter、无离屏画布、无 drawImage → 两端像素级一致
 *   · 雾的体积感用「多层递减宽描边」实现（宽而淡的柔光），
 *     不依赖任何平台特有 API
 *   · 频谱由调用方注入（网页用 AnalyserNode，小程序由乐谱推算）
 *   · 动画循环由调用方驱动（本模块只管画）
 *
 * 用法：
 *   const stage = ICVizStage.createStage();
 *   stage.setHex(rows, moving);          // rows 自上而下，0=阴 1=阳
 *   stage.setSignal({ bins, low, mid, high, level, energy, bassTarget });
 *   stage.setPlaying(true);
 *   stage.draw(ctx, dt);                 // dt 单位：秒
 */

/* __IC_IIFE__ */
(function () {
'use strict';

/* ---------- 常量 ---------- */

/** 方位角：略偏右 → 露出一线右端面（参考图的比例） */
const VIZ_YAW = 0.17;
/** 仰角：轻俯 → 露出一线顶面，不多不少 */
const VIZ_PITCH = 0.26;

/** 画质档：性能模式降丝量与细节层，低配手机更稳 */
const VIZ_QUALITY = {
  high: { glow: 1.0, reflect: 1.0, ceiling: 1.0, fil: 820, filTrail: 7, steps: 3 },
  perf: { glow: 0.72, reflect: 0.55, ceiling: 0.6, fil: 300, filTrail: 6, steps: 2 }
};

/** 主心音的丝缕样式（其余音层由调用方注入） */
const CORE_LAYER = {
  key: 'main', name: '心音', color: '40,74,96', fog: '112,162,206'
};

/** 渐入秒数：雾气自两端缓缓浮现、汇聚 */
const FLOW_INTRO = 2.0;
/** 排空渐弱秒数 */
const FLOW_DRAIN_FADE = 1.6;

/* ---------- 工具 ---------- */

/** 确定性伪随机（同一参数恒得同一值） */
function hash01(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/** 值噪声 */
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash01(xi, yi), b = hash01(xi + 1, yi);
  const c = hash01(xi, yi + 1), d = hash01(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** 分形噪声 */
function fbm(x, y, oct) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < (oct || 3); i++) {
    s += amp * noise2(x * f, y * f);
    f *= 2.03; amp *= 0.5;
  }
  return s;
}

/**
 * 椭圆路径
 * ---------------------------------------------------------------
 * 优先用 ctx.ellipse；旧基础库没有该方法时，
 * 用「缩放 + 圆弧」等价实现（save/scale/arc/restore）。
 * 一旦这里抛错，整帧绘制中断 —— 画面就是一片空白。
 */
function ellipsePath(ctx, cx, cy, rx, ry, rot, a0, a1, ccw) {
  if (typeof ctx.ellipse === 'function') {
    ctx.ellipse(cx, cy, rx, ry, rot || 0, a0, a1, !!ccw);
    return;
  }
  /* 降级实现：绕圆心做「缩放 + 旋转」，再用圆弧画。
   * 注意**不能**用 save/restore 包住 —— 那会把调用方已经 beginPath()
   * 建立的路径一并丢弃，图形就画不出来了。
   * 故这里只变换坐标系，路径仍在同一坐标系下累积。 */
  ctx.save();
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  ctx.scale(1, ry / rx);
  // 在变换后的坐标系里画圆弧：圆心回到原点、半径为 rx
  ctx.arc(0, 0, rx, a0, a1, !!ccw);
  ctx.restore();
}

/**
 * 圆角矩形路径（用 arcTo 实现，不依赖 ctx.roundRect —— 小程序未必有）
 */
function roundRectPath(ctx, x, y, w, h, r) {
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

/** 把 Uint8Array（0..255）归一为 0..1；Float32Array 视为已是 0..1 */
function normBins(bins) {
  if (!bins || !bins.length) return null;
  if (bins instanceof Uint8Array || bins instanceof Uint8ClampedArray) {
    const out = new Float32Array(bins.length);
    for (let i = 0; i < bins.length; i++) out[i] = bins[i] / 255;
    return out;
  }
  return bins;
}

/* ===============================================================
 * 波形台
 * =============================================================== */

function createStage(options) {
  const opt = options || {};

  /* ---------- 状态 ---------- */
  let ctx = null;
  let W = 0, H = 0;
  let rows = [1, 0, 1, 0, 1, 0];    // 自上而下
  let moving = [];
  let model = null;                  // 卦体几何
  let parts = [];                    // 丝缕粒子
  let filT = 0;                      // 湍流场时间
  let filAcc = 0;                    // 生成累加器
  let filAdapt = 1;                  // 帧率自适应系数
  let filFrameAcc = 0, filFrameN = 0;
  let quality = 'high';
  let layers = [];                   // 外部注入的音层
  let flowMode = 'idle';             // idle | playing | paused | drain
  let intro = 0;                     // 渐入进度 0..1
  let drainT = 0;                    // 排空计时
  let bass = 0;                      // 低频鼓点包络（平滑后）
  let signal = {
    bins: null, low: 0, mid: 0, high: 0, level: 0, energy: 0, bassTarget: 0
  };
  // 包络平滑（起音快、回落慢）——放在 core 内，两端手感一致
  let envLow = 0, envMid = 0, envHigh = 0, envLevel = 0, envEnergy = 0;
  let bandsProvided = false;   // 调用方是否自带 bands（网页版自带，避免双重平滑）

  /** 包络跟随：起音快、回落慢 */
  function envFollow(cur, target, dt, upT, downT) {
    const k = target > cur
      ? 1 - Math.pow(0.001, dt / upT)
      : 1 - Math.pow(0.001, dt / downT);
    return cur + (target - cur) * k;
  }

  function q() { return VIZ_QUALITY[quality] || VIZ_QUALITY.high; }

  /* ---------- 几何 ---------- */

  /** 模型尺寸与鼓点缩放（含圆形金属底座） */
  function buildModel() {
    const barH = 12, gap = 23;
    const totalH = (rows.length - 1) * gap + barH + 14;
    const scale = Math.min(W / 340, (H * 0.52) / totalH);
    // 鼓点缩放：播放中随低频起伏，停止后由 release 缓慢归位
    const s = scale * (1 + bass * 0.11 + signal.energy * 0.035);
    const cy = H * 0.47;
    // 底座：卦象立于一枚圆形金属底座上；镜面地面在底座前缘
    const bottomEdge = cy + ((rows.length - 1) / 2) * gap * s + (barH / 2) * s;
    const pedestalH = Math.max(5, H * 0.032);
    const baseY = bottomEdge + 1;                 // 底座顶面（卦象落座处）
    const floorY = baseY + pedestalH;             // 镜面地面线
    return {
      cx: W * 0.5,
      cy,
      baseY,
      floorY,
      pedestalH,
      scale: s,
      // 卦象：厚实长方体，古铜金属；动爻偏朱，边缘自带暖金自发光
      hx: 62, hy: barH / 2, hz: 13,
      gap, rows: rows.slice(),
      barRGB: [140, 104, 66], movRGB: [180, 102, 68], edgeRGB: [18, 12, 8],
      goldRGB: [255, 202, 132]
    };
  }

  /**
   * 左右气口的几何
   * 竖长椭圆孔洞，贴左右画面边缘（大半在画外），雾由此涌入。
   */
  function ports(geo) {
    const R = Math.min(H * 0.34, 132);
    const cy = geo.cy;
    return {
      R,
      l: { x: -R * 0.26, y: cy, rx: R * 0.44, ry: R * 1.00, dir: 1 },
      r: { x: W + R * 0.26, y: cy, rx: R * 0.44, ry: R * 1.00, dir: -1 }
    };
  }

  /* ---------- 卦体（正交三面） ---------- */

  /**
   * 画一块金属爻板。**正交画法**：
   *   · 正面 = 水平矩形（绝对平直，绝不因透视被拉成梯形）
   *   · 顶面 = 沿景深方向偏移的平行四边形（偏移 = 深度 × sin(仰角/方位角)）
   *   · 右端面 = 同理，一片薄薄的侧棱
   * 立体感完全来自「三个面 + 光照」，不靠投影除法。
   *
   * @param bar  {x0, x1, y}  段的世界 x 范围与世界 y（向上为正）
   * @param mirror 1 = 镜面地面上的倒影（沿 floorY 翻折）
   */
  function drawYao3D(ctx2, geo, bar, energy, isMov, fade, mirror) {
    const s = geo.scale;
    const hx = (bar.x1 - bar.x0) / 2;
    const cx0 = (bar.x0 + bar.x1) / 2;          // 本段在卦体中的横向中心（世界 x）
    const hy = geo.hy, hz = geo.hz;

    // 屏幕坐标：正面矩形
    const x0 = geo.cx + bar.x0 * s;
    const x1 = geo.cx + bar.x1 * s;
    let cy = geo.cy - bar.y * s;                // 世界 y 向上 → 屏幕 y 向下
    // 景深方向在屏幕上的偏移（背面相对正面）：上 + 左
    const ddx = -hz * Math.sin(VIZ_YAW) * s;
    let ddy = -hz * Math.sin(VIZ_PITCH) * s;
    if (mirror) { cy = 2 * geo.floorY - cy; ddy = -ddy; }

    const yTop = cy - hy * s, yBot = cy + hy * s;
    const bw = x1 - x0, bh = yBot - yTop;

    const base = isMov ? (geo.movRGB || [178, 58, 46]) : (geo.barRGB || [46, 74, 92]);
    const edge = geo.edgeRGB || (isMov ? [126, 38, 30] : [28, 48, 62]);
    const glow = Math.min(1, 0.30 + energy * 1.5 + (isMov ? 0.28 : 0));
    const lit = (k) => `rgba(${Math.round(Math.min(255, base[0] * k))},` +
      `${Math.round(Math.min(255, base[1] * k))},${Math.round(Math.min(255, base[2] * k))},${fade})`;

    /* 右端面（最暗，勾出厚度） */
    ctx2.fillStyle = lit(0.22 + glow * 0.08);
    ctx2.beginPath();
    ctx2.moveTo(x1, yTop);
    ctx2.lineTo(x1, yBot);
    ctx2.lineTo(x1 + ddx, yBot + ddy);
    ctx2.lineTo(x1 + ddx, yTop + ddy);
    ctx2.closePath();
    ctx2.fill();

    /* 顶面（受光面，最亮） */
    const gTop = ctx2.createLinearGradient(x0, yTop, x1, yTop + ddy);
    gTop.addColorStop(0, lit(1.45 + glow * 0.32));
    gTop.addColorStop(0.55, lit(1.06 + glow * 0.20));
    gTop.addColorStop(1, lit(0.72 + glow * 0.10));
    ctx2.fillStyle = gTop;
    ctx2.beginPath();
    ctx2.moveTo(x0, yTop);
    ctx2.lineTo(x1, yTop);
    ctx2.lineTo(x1 + ddx, yTop + ddy);
    ctx2.lineTo(x0 + ddx, yTop + ddy);
    ctx2.closePath();
    ctx2.fill();

    /* 正面（主体）：竖向渐变，模拟金属面由上到下的明暗过渡 */
    const gFront = ctx2.createLinearGradient(x0, yTop, x0 + bw * 0.30, yBot);
    gFront.addColorStop(0, lit(0.58 + glow * 0.22));
    gFront.addColorStop(0.22, lit(0.36 + glow * 0.13));
    gFront.addColorStop(0.66, lit(0.17 + glow * 0.07));
    gFront.addColorStop(1, lit(0.09 + glow * 0.04));
    ctx2.fillStyle = gFront;
    ctx2.fillRect(x0, yTop, bw, bh);

    /* 金属高光：一条窄而亮的镜面反光带（金属的高光是收紧的，不是漫反射） */
    ctx2.save();
    ctx2.beginPath();
    ctx2.rect(x0, yTop, bw, bh);
    ctx2.clip();

    /* 拉丝：金属表面的细密横向纹理（各向异性反射的来源） */
    const seed = Math.round(cy * 13 + hx * 7 + cx0 * 3);
    const STREAKS = 18;
    for (let i = 0; i < STREAKS; i++) {
      const yy = yTop + (bh * (i + 0.5)) / STREAKS + (hash01(seed, i) - 0.5) * bh * 0.05;
      const a = (0.025 + hash01(seed, i + 40) * 0.085) * fade;
      ctx2.strokeStyle = hash01(seed, i + 80) > 0.48
        ? `rgba(255,248,232,${a})`
        : `rgba(26,16,8,${a * 1.1})`;
      ctx2.lineWidth = 0.5 + hash01(seed, i + 120) * 1.2;
      ctx2.beginPath();
      ctx2.moveTo(x0 - 2, yy);
      ctx2.lineTo(x1 + 2, yy);
      ctx2.stroke();
    }

    /* 磨损：几道细划痕（金属用久了的样子） */
    for (let i = 0; i < 4; i++) {
      const sx = x0 + bw * (0.10 + hash01(seed, 200 + i) * 0.80);
      const sy = yTop + bh * (0.16 + hash01(seed, 220 + i) * 0.68);
      const len = bw * (0.04 + hash01(seed, 240 + i) * 0.11);
      ctx2.strokeStyle = `rgba(255,250,236,${(0.08 + hash01(seed, 260 + i) * 0.15) * fade})`;
      ctx2.lineWidth = 0.7;
      ctx2.beginPath();
      ctx2.moveTo(sx, sy);
      ctx2.lineTo(sx + len, sy - len * 0.16);
      ctx2.stroke();
    }

    const ms = ctx2.createLinearGradient(x0, yTop + bh * 0.10, x0 + bw * 0.62, yBot);
    ms.addColorStop(0, 'rgba(255,255,255,0)');
    ms.addColorStop(0.40, `rgba(255,246,228,${(0.04 + energy * 0.08) * fade})`);
    ms.addColorStop(0.52, `rgba(255,252,242,${(0.10 + energy * 0.13) * fade})`);
    ms.addColorStop(0.64, 'rgba(255,255,255,0)');
    ctx2.fillStyle = ms;
    ctx2.fillRect(x0 - 2, yTop - 2, bw + 4, bh + 4);
    // 底部反光（环境光反弹），进一步柔化
    const rf = ctx2.createLinearGradient(0, yBot - bh * 0.42, 0, yBot);
    rf.addColorStop(0, 'rgba(255,250,240,0)');
    rf.addColorStop(1, `rgba(255,214,150,${0.14 * fade})`);
    ctx2.fillStyle = rf;
    ctx2.fillRect(x0 - 2, yTop - 2, bw + 4, bh + 4);
    ctx2.restore();

    /* 倒角：上缘一条亮棱、下缘一条暗棱 —— 金属的边缘最抓光 */
    ctx2.strokeStyle = `rgba(255,246,224,${(0.09 + energy * 0.10) * fade})`;
    ctx2.lineWidth = 1.1;
    ctx2.beginPath();
    ctx2.moveTo(x0, yTop);
    ctx2.lineTo(x1, yTop);
    ctx2.stroke();
    ctx2.strokeStyle = `rgba(10,6,3,${0.42 * fade})`;
    ctx2.lineWidth = 1.2;
    ctx2.beginPath();
    ctx2.moveTo(x0, yBot);
    ctx2.lineTo(x1, yBot);
    ctx2.stroke();

    /* 边缘暖金自发光：先一层柔光，再一条细亮线（微弱、不刺眼） */
    const gold = geo.goldRGB || [255, 202, 132];
    const goldCss = `${gold[0]},${gold[1]},${gold[2]}`;
    ctx2.save();
    ctx2.lineCap = 'round';
    ctx2.strokeStyle = `rgba(${goldCss},${(0.035 + energy * 0.065) * fade})`;
    ctx2.lineWidth = Math.max(2.2, bh * 0.38);
    ctx2.beginPath();
    ctx2.moveTo(x0, yBot - bh * 0.10);
    ctx2.lineTo(x1, yBot - bh * 0.10);
    ctx2.stroke();
    ctx2.restore();
    ctx2.strokeStyle = `rgba(${goldCss},${(0.15 + energy * 0.15) * fade})`;
    ctx2.lineWidth = Math.max(0.7, bh * 0.075);
    ctx2.lineCap = 'round';
    ctx2.beginPath();
    ctx2.moveTo(x0 + 1, yBot - bh * 0.10);
    ctx2.lineTo(x1 - 1, yBot - bh * 0.10);
    ctx2.stroke();

    /* 描边：金属暗边，兼作边缘微光的收束 */
    ctx2.strokeStyle = isMov
      ? `rgba(${Math.round(edge[0] * 1.4)},${Math.round(edge[1] * 1.4)},${Math.round(edge[2] * 1.4)},${0.55 * fade})`
      : `rgba(${edge[0]},${edge[1]},${edge[2]},${0.42 * fade})`;
    ctx2.lineWidth = 0.9;
    ctx2.strokeRect(x0, yTop, bw, bh);
  }

  /* ---------- 场景 ---------- */

  /** 天花板筒灯：多组长条形冷白灯，向灭点收敛（越远越短越密） */
  function drawCeilingLights(ctx2, w, h, vpx, lit) {
    const qq = q();
    const rws = 4;
    for (let i = 0; i < rws; i++) {
      const t = i / (rws - 1);                     // 0 最近，1 最远
      const y = h * (0.035 + t * 0.075);
      const len = w * (0.46 - t * 0.24);
      const th = Math.max(1.4, h * 0.013 * (1 - t * 0.5));
      const a = (0.52 - t * 0.26) * lit * qq.ceiling;
      // 灯管辉光
      const g = ctx2.createLinearGradient(vpx - len / 2, 0, vpx + len / 2, 0);
      g.addColorStop(0, 'rgba(198,224,255,0)');
      g.addColorStop(0.5, `rgba(198,224,255,${a * 0.30})`);
      g.addColorStop(1, 'rgba(198,224,255,0)');
      ctx2.fillStyle = g;
      ctx2.fillRect(vpx - len / 2, y - th * 2.6, len, th * 6.2);
      // 灯管本体
      const tube = ctx2.createLinearGradient(0, y, 0, y + th);
      tube.addColorStop(0, `rgba(240,248,255,${a})`);
      tube.addColorStop(1, `rgba(206,226,248,${a * 0.5})`);
      ctx2.fillStyle = tube;
      roundRectPath(ctx2, vpx - len / 2, y, len, th, th / 2);
      ctx2.fill();
    }
  }

  /**
   * 圆形金属底座：卦象落座之处（深色金属盘 + 暖金内环）
   */
  function drawPedestal(ctx2, geo) {
    const rx = geo.hx * geo.scale * 1.32;
    const ry = Math.max(3, rx * 0.21);
    const y = geo.baseY;
    const ph = geo.pedestalH;
    const gold = geo.goldRGB || [255, 202, 132];

    // 柱体侧面
    const side = ctx2.createLinearGradient(0, y, 0, y + ph);
    side.addColorStop(0, 'rgba(44,50,60,.96)');
    side.addColorStop(1, 'rgba(13,16,21,.96)');
    ctx2.fillStyle = side;
    ctx2.beginPath();
    ctx2.moveTo(geo.cx - rx, y);
    ctx2.lineTo(geo.cx - rx, y + ph);
    ellipsePath(ctx2, geo.cx, y + ph, rx, ry, 0, Math.PI, 0, true);
    ctx2.lineTo(geo.cx + rx, y);
    ctx2.closePath();
    ctx2.fill();

    // 顶面（金属盘）
    const top = ctx2.createLinearGradient(geo.cx - rx, y - ry, geo.cx + rx, y + ry);
    top.addColorStop(0, 'rgba(70,78,90,.96)');
    top.addColorStop(0.45, 'rgba(32,38,47,.96)');
    top.addColorStop(1, 'rgba(56,63,74,.96)');
    ctx2.fillStyle = top;
    ctx2.beginPath();
    ellipsePath(ctx2, geo.cx, y, rx, ry, 0, 0, Math.PI * 2);
    ctx2.fill();
    // 顶面高光环
    ctx2.strokeStyle = 'rgba(206,220,238,.26)';
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ellipsePath(ctx2, geo.cx, y, rx, ry, 0, 0, Math.PI * 2);
    ctx2.stroke();
    // 暖金内环（与爻的边缘自发光呼应）
    const ga = 0.16 + Math.min(1, signal.energy * 1.4 + bass * 0.6) * 0.22;
    ctx2.strokeStyle = `rgba(${gold[0]},${gold[1]},${gold[2]},${ga})`;
    ctx2.lineWidth = 1.1;
    ctx2.beginPath();
    ellipsePath(ctx2, geo.cx, y, rx * 0.80, ry * 0.80, 0, 0, Math.PI * 2);
    ctx2.stroke();
  }

  function drawRoom3D(ctx2, w, h, geo) {
    const energy = Math.min(1, signal.energy * 1.4 + bass * 0.6);

    /* 基底：深蓝灰空间，上浅下深 */
    const base = ctx2.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#151f29');
    base.addColorStop(0.52, '#0e161f');
    base.addColorStop(1, '#070b11');
    ctx2.fillStyle = base;
    ctx2.fillRect(0, 0, w, h);

    // 灭点：落在中轴上，但高度取「卦象脚下略上方」——
    //   ① 于是地平线在模型底部附近（俯视广角该有的样子）；
    //   ② 灭点被卦体与底座挡住，看不见；
    //   ③ 地面辐线在靠近灭点处淡出，不会聚成一个显眼的点。
    const vpx = geo.cx;
    const vpy = Math.max(geo.cy - h * 0.04, geo.floorY - (h - geo.floorY) * 0.58);

    /* 尽头光池：模型背后的柔光（风洞尽头的灯） */
    const pool = ctx2.createRadialGradient(vpx, vpy, 4, vpx, vpy, Math.max(w, h) * 0.72);
    pool.addColorStop(0, `rgba(96,140,180,${0.055 + energy * 0.05})`);
    pool.addColorStop(0.28, `rgba(86,124,158,${0.030 + energy * 0.03})`);
    pool.addColorStop(1, 'rgba(76,112,142,0)');
    ctx2.fillStyle = pool;
    ctx2.fillRect(0, 0, w, h);

    /* 地面：透视格线（纵向辐线由灭点散开 + 横向档线，越近越疏） */
    ctx2.save();
    ctx2.beginPath();
    ctx2.rect(0, vpy, w, h - vpy);
    ctx2.clip();
    const fg = ctx2.createLinearGradient(0, vpy, 0, h);
    fg.addColorStop(0, 'rgba(30,44,60,0)');
    fg.addColorStop(0.22, 'rgba(30,44,60,0.5)');
    fg.addColorStop(1, 'rgba(14,21,30,0.92)');
    ctx2.fillStyle = fg;
    ctx2.fillRect(0, vpy, w, h - vpy);

    ctx2.lineWidth = 1;
    for (let i = -7; i <= 7; i++) {
      if (i === 0) continue;
      const ex = vpx + i * (w * 0.19);
      // 辐线自灭点淡出：只留下向观者散开的纵深，灭点本身看不见
      const ga = 0.030 + energy * 0.024;
      const lg = ctx2.createLinearGradient(vpx, vpy, ex, h);
      lg.addColorStop(0, 'rgba(122,158,188,0)');
      lg.addColorStop(0.26, `rgba(122,158,188,${ga * 0.30})`);
      lg.addColorStop(1, `rgba(122,158,188,${ga})`);
      ctx2.strokeStyle = lg;
      ctx2.beginPath();
      ctx2.moveTo(vpx, vpy);
      ctx2.lineTo(ex, h + 6);
      ctx2.stroke();
    }
    const RUNGS = 7;
    for (let i = 1; i <= RUNGS; i++) {
      const f = Math.pow(i / RUNGS, 2.1);
      const y = vpy + (h - vpy) * f;
      // 越近地平线越淡（广角近景：远处的地面细节被压平）
      const ga = (0.022 + 0.090 * f + energy * 0.030) * Math.min(1, f * 2.6);
      ctx2.strokeStyle = `rgba(122,158,188,${ga})`;
      ctx2.beginPath();
      ctx2.moveTo(0, y);
      ctx2.lineTo(w, y);
      ctx2.stroke();
    }
    ctx2.restore();

    /* 两侧墙灯：沿灭点收敛的两列横向光带（像风洞壁上的灯） */
    const lit = 0.55 + energy * 0.45;
    for (let i = 0; i < 4; i++) {
      // 灯带沿墙面向灭点收缩：越远越靠近中轴、越窄
      const t = i / 3;
      const spread = 0.30 - t * 0.19;              // 距画面中心的比例
      const y = vpy - h * 0.16 * (1 - t) - h * 0.02;
      const ww = w * (0.052 - t * 0.026);
      const hh = Math.max(2.2, h * 0.013 * (1 - t * 0.4));
      [vpx - w * spread, vpx + w * spread].forEach((cxx) => {
        const g = ctx2.createLinearGradient(cxx - ww / 2, 0, cxx + ww / 2, 0);
        g.addColorStop(0, 'rgba(150,196,230,0)');
        g.addColorStop(0.5, `rgba(150,196,230,${(0.26 - t * 0.14) * lit})`);
        g.addColorStop(1, 'rgba(150,196,230,0)');
        ctx2.fillStyle = g;
        ctx2.fillRect(cxx - ww / 2, y, ww, hh);
      });
    }

    /* 地面光池：模型下方的两团椭圆光（灯打在地面的反照） */
    [vpx - w * 0.13, vpx + w * 0.13].forEach((cxx, i) => {
      const r = w * (0.10 + i * 0.02);
      const gy = geo.floorY + (h - geo.floorY) * 0.42;
      const g = ctx2.createRadialGradient(cxx, gy, 2, cxx, gy, r);
      g.addColorStop(0, `rgba(126,168,204,${0.13 * lit})`);
      g.addColorStop(1, 'rgba(126,168,204,0)');
      ctx2.save();
      ctx2.translate(cxx, gy);
      ctx2.scale(1, 0.30);
      ctx2.translate(-cxx, -gy);
      ctx2.fillStyle = g;
      ctx2.fillRect(cxx - r, gy - r, r * 2, r * 2);
      ctx2.restore();
    });

    /* ---------- 两侧墙面的孔洞：烟雾自此喷出 ---------- */
    drawVents(ctx2, w, h, geo, lit);

    /* ---------- 天花板筒灯 ---------- */
    drawCeilingLights(ctx2, w, h, vpx, lit);

    /* ---------- 镜面地面：地平线亮线 + 竖向镜面反光带 ---------- */
    const qq = q();
    // 后墙与地面的交界：一道冷白细线
    const hz = ctx2.createLinearGradient(0, vpy - 1, 0, vpy + 1.5);
    hz.addColorStop(0, 'rgba(190,214,240,0)');
    hz.addColorStop(0.5, `rgba(190,214,240,${0.20 * lit})`);
    hz.addColorStop(1, 'rgba(190,214,240,0)');
    ctx2.fillStyle = hz;
    ctx2.fillRect(0, vpy - 1, w, 2.5);
    // 镜面竖向反光带（天花板灯在地面上的倒影）
    const bandW = w * 0.16;
    const band = ctx2.createLinearGradient(vpx - bandW, 0, vpx + bandW, 0);
    band.addColorStop(0, 'rgba(150,190,230,0)');
    band.addColorStop(0.5, `rgba(150,190,230,${0.07 * lit * qq.reflect})`);
    band.addColorStop(1, 'rgba(150,190,230,0)');
    ctx2.fillStyle = band;
    ctx2.fillRect(vpx - bandW, vpy, bandW * 2, h - vpy);

    /* 暗角：把视线收回中心 */
    const vg = ctx2.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.34, w / 2, h * 0.46, Math.max(w, h) * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.40)');
    ctx2.fillStyle = vg;
    ctx2.fillRect(0, 0, w, h);
  }

  /**
   * 两侧墙面的出气孔洞
   * ---------------------------------------------------------------
   * 每侧一个竖长亮孔：孔内是强光，孔外有一圈辉光与一道向内的光锥，
   * 地上还留着孔光洒下的亮斑 —— 雾气即由此处喷出。
   */
  function drawVents(ctx2, w, h, geo, lit) {
    const ps = ports(geo);
    [ps.l, ps.r].forEach((v) => {
      const cx = v.x, cy = v.y;

      /* 孔外辉光 */
      const glow = ctx2.createRadialGradient(cx, cy, 2, cx, cy, v.ry * 1.5);
      glow.addColorStop(0, `rgba(176,214,244,${0.20 * lit})`);
      glow.addColorStop(0.35, `rgba(140,182,220,${0.075 * lit})`);
      glow.addColorStop(1, 'rgba(120,164,204,0)');
      ctx2.fillStyle = glow;
      ctx2.fillRect(cx - v.ry * 1.6, cy - v.ry * 1.6, v.ry * 3.2, v.ry * 3.2);

      /* 向内的光锥（体积光）：从孔口斜射向画面深处 */
      const coneLen = w * 0.52;
      const cone = ctx2.createLinearGradient(cx, 0, cx + v.dir * coneLen, 0);
      cone.addColorStop(0, `rgba(196,226,250,${0.085 * lit})`);
      cone.addColorStop(0.3, `rgba(150,192,228,${0.030 * lit})`);
      cone.addColorStop(1, 'rgba(140,182,220,0)');
      ctx2.save();
      ctx2.beginPath();
      ctx2.moveTo(cx, cy - v.ry * 0.92);
      ctx2.lineTo(cx, cy + v.ry * 0.92);
      ctx2.lineTo(cx + v.dir * coneLen, cy + v.ry * 1.35);
      ctx2.lineTo(cx + v.dir * coneLen, cy - v.ry * 1.35);
      ctx2.closePath();
      ctx2.fillStyle = cone;
      ctx2.fill();
      ctx2.restore();

      /* 金属环：拉丝钢的环体（外圈暗、内缘亮） */
      const ringW = Math.max(3, v.rx * 0.30);
      const ring = ctx2.createLinearGradient(cx - ringW, cy - v.ry, cx + ringW, cy + v.ry);
      ring.addColorStop(0, 'rgba(96,112,130,.92)');
      ring.addColorStop(0.35, 'rgba(48,58,72,.95)');
      ring.addColorStop(0.7, 'rgba(78,92,108,.9)');
      ring.addColorStop(1, 'rgba(26,32,42,.95)');
      ctx2.save();
      ctx2.lineWidth = ringW;
      ctx2.strokeStyle = ring;
      ctx2.beginPath();
      ellipsePath(ctx2, cx, cy, v.rx + ringW / 2, v.ry + ringW / 2, 0, 0, Math.PI * 2);
      ctx2.stroke();
      /* 环上的高光弧（上缘一条亮线，像被顶灯打亮） */
      ctx2.lineWidth = Math.max(0.8, ringW * 0.28);
      ctx2.strokeStyle = `rgba(226,240,255,${0.55 * lit})`;
      ctx2.beginPath();
      ellipsePath(ctx2, cx, cy, v.rx + ringW / 2, v.ry + ringW / 2, 0, Math.PI * 1.05, Math.PI * 1.85);
      ctx2.stroke();
      ctx2.restore();

      /* 孔内：强光核心 + 一点虹膜环 */
      const inner = ctx2.createRadialGradient(cx, cy, 1, cx, cy, v.rx * 1.25);
      inner.addColorStop(0, `rgba(255,255,255,${0.98 * lit})`);
      inner.addColorStop(0.22, `rgba(222,240,255,${0.80 * lit})`);
      inner.addColorStop(0.62, `rgba(150,196,236,${0.34 * lit})`);
      inner.addColorStop(1, 'rgba(96,140,190,0)');
      ctx2.fillStyle = inner;
      ctx2.beginPath();
      ellipsePath(ctx2, cx, cy, v.rx * 1.22, v.ry * 0.98, 0, 0, Math.PI * 2);
      ctx2.fill();
      /* 虹膜：几道同心细弧，给出「机械舱门」的科技感 */
      ctx2.save();
      ctx2.strokeStyle = `rgba(255,255,255,${0.16 * lit})`;
      ctx2.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        ctx2.beginPath();
        ellipsePath(ctx2, cx, cy, v.rx * (0.30 + i * 0.24), v.ry * (0.22 + i * 0.24), 0, 0, Math.PI * 2);
        ctx2.stroke();
      }
      ctx2.restore();

      /* 地上的孔光亮斑 */
      const gy = geo.floorY + (h - geo.floorY) * 0.30;
      const sx = cx + v.dir * w * 0.06;
      const spot = ctx2.createRadialGradient(sx, gy, 2, sx, gy, w * 0.13);
      spot.addColorStop(0, `rgba(160,200,232,${0.18 * lit})`);
      spot.addColorStop(1, 'rgba(160,200,232,0)');
      ctx2.save();
      ctx2.translate(sx, gy);
      ctx2.scale(1, 0.24);
      ctx2.translate(-sx, -gy);
      ctx2.fillStyle = spot;
      ctx2.fillRect(sx - w * 0.13, gy - w * 0.13, w * 0.26, w * 0.26);
      ctx2.restore();
    });
  }

  /** 模型落座处：地面上的柔光池（灯打在地面的反照）与一点接触暗影 */
  function drawFloorShadow(ctx2, geo) {
    const rx = geo.hx * geo.scale * 1.5;
    const ry = Math.max(6, rx * 0.22);
    const cy = geo.floorY;
    ctx2.save();
    ctx2.translate(geo.cx, cy);
    ctx2.scale(1, ry / rx);
    ctx2.translate(-geo.cx, -cy);
    // 外圈：极淡的暗影，把模型「压」在地面上
    const sh = ctx2.createRadialGradient(geo.cx, cy, 2, geo.cx, cy, rx * 1.15);
    sh.addColorStop(0, 'rgba(0,0,0,0.34)');
    sh.addColorStop(0.6, 'rgba(0,0,0,0.12)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx2.fillStyle = sh;
    ctx2.fillRect(geo.cx - rx * 1.2, cy - rx * 1.2, rx * 2.4, rx * 2.4);
    // 内圈：冷色反照光（深色地面上唯一可见的「接地点」）
    const lit = 0.55 + Math.min(1, signal.energy * 1.4 + bass * 0.6) * 0.45;
    const gl = ctx2.createRadialGradient(geo.cx, cy, 2, geo.cx, cy, rx * 0.9);
    gl.addColorStop(0, `rgba(126,168,204,${0.13 * lit})`);
    gl.addColorStop(0.55, `rgba(126,168,204,${0.05 * lit})`);
    gl.addColorStop(1, 'rgba(126,168,204,0)');
    ctx2.fillStyle = gl;
    ctx2.fillRect(geo.cx - rx, cy - rx, rx * 2, rx * 2);
    ctx2.restore();
  }

  /** 地面倒影：把爻板沿镜面镜像一份，越远越淡 */
  function drawReflection(ctx2, geo, data, mov) {
    const rs = geo.rows;
    const floorY = geo.floorY;         // 镜面地面线
    const modelH = (rs.length - 1) * geo.gap * geo.scale + geo.hy * geo.scale * 2;
    for (let i = rs.length - 1; i >= 0; i--) {
      const yang = rs[i] === 1;
      // +y 朝上（屏幕 y = cy - yv），故上爻取正、下爻取负
      const y = ((rs.length - 1) / 2 - i) * geo.gap;
      const isMov = mov.indexOf(rs.length - i) >= 0;
      const band = Math.floor((i / 6) * (data ? data.length * 0.62 : 1));
      let e = 0.16;
      if (data) {
        for (let k = 0; k < 7; k++) e += data[Math.min(data.length - 1, band + k * 3)];
        e = e / 7;
      }
      e = Math.min(1, e);
      // 该爻离地面的距离 → 倒影沉入地面多深 → 越深越淡
      const yScreen = geo.cy - y * geo.scale;
      const depth = Math.max(0, floorY - yScreen);
      const fade = 0.26 * Math.max(0.05, 1 - depth / Math.max(1, modelH * 0.95));
      if (fade < 0.012) continue;
      const segs = yang ? [[-geo.hx, geo.hx]] : [[-geo.hx, -13], [13, geo.hx]];
      segs.forEach(([x0, x1]) => {
        drawYao3D(ctx2, geo, { x0, x1, y }, e, isMov, fade, 1);
      });
    }
  }

  /* ---------- 丝缕系统 ---------- */

  /** 生成一条丝缕 */
  function filSpawn(geo, kind, st) {
    const ps = ports(geo);
    const fromLeft = Math.random() < 0.5;
    const p0 = fromLeft ? ps.l : ps.r;
    const a = (Math.random() - 0.5) * 2.2;          // 椭圆内散布
    const rr = Math.sqrt(Math.random());
    parts.push({
      x: p0.x + Math.cos(a) * p0.rx * rr,
      y: p0.y + Math.sin(a) * p0.ry * rr,
      // lane：这条丝在羽流里的位置（-1 下缘 … +1 上缘），全程不变 ——
      // 参考图里那股羽流自两侧涌入、在卦象处收腰分瓣，靠的就是这个固定的「轨道位」。
      lane: (Math.random() * 2 - 1),
      spread: H * 0.33 * (0.82 + Math.random() * 0.36),
      z: (Math.random() * 2 - 1) * 0.85,           // 深度：负在后景
      dir: fromLeft ? 1 : -1,                       // 推进方向（向右为 1）
      swirl: Math.random() < 0.5 ? 1 : -1,          // 绕行方向：上绕 / 下绕
      age: 0,
      life: 190 + Math.random() * 240,
      w: 0.4 + Math.random() * 0.85,               // 粗细权重
      gold: Math.random() * 0.42,                   // 暖金倾向
      kind, st,
      trail: []
    });
  }

  /**
   * 丝缕系统的推进：生成 + 湍流平流 + 绕行 + 深度投影
   */
  function filUpdate(dt, geo) {
    const qq = q();
    if (!W || !H) return;
    filT += dt;
    const k = dt / 0.0167;            // dt 单位是秒 → 折算成「帧倍数」

    /* 帧率自适应：连续 30 帧的平均耗时决定丝的数量上限 */
    filFrameAcc += dt; filFrameN++;
    if (filFrameN >= 30) {
      const avg = filFrameAcc / filFrameN;
      if (avg > 0.034) filAdapt = Math.max(0.34, filAdapt * 0.86);
      else if (avg < 0.020) filAdapt = Math.min(1, filAdapt * 1.06);
      filFrameAcc = 0; filFrameN = 0;
    }
    const filCap = Math.max(40, Math.floor(qq.fil * filAdapt));

    /* 生成：演奏中按能量补充；停止后不再生成（余雾自行散尽） */
    if (flowMode === 'playing' && intro > 0.02) {
      filAcc += k * (filCap / 190) * (0.42 + 0.78 * signal.level) * intro;
      let guard = 0;
      while (filAcc >= 1 && guard++ < 60) {
        filAcc -= 1;
        if (parts.length >= filCap) break;
        if (layers.length && Math.random() < 0.42) {
          const st = layers[(Math.random() * layers.length) | 0];
          filSpawn(geo, st.key, st);
        } else {
          filSpawn(geo, 'main', CORE_LAYER);
        }
      }
    }

    /* 平流：主流 + 切向绕行 + 旋度噪声湍流 + 卦象排斥 + 中轴收束 */
    const F = 0.0052, E = 2.0;
    const mcx = geo.cx, mcy = geo.cy;
    const modelHalfH = (geo.gap * (geo.rows.length - 1) * geo.scale * 0.5) + geo.hy * geo.scale + 10;
    const tOff = filT * 0.0011;
    const turbK = 0.55 + signal.high * 0.85;

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age++;
      if (p.age > p.life || p.x < -W * 0.4 || p.x > W * 1.4) { parts.splice(i, 1); continue; }

      const dx = p.x - mcx, dy = p.y - mcy;
      const dist = Math.hypot(dx, dy) + 1;
      const tanX = -dy / dist, tanY = dx / dist;
      const near = Math.max(0, 1 - dist / (W * 0.40));

      /* ---- 目标轨道：宽羽流 → 卦象处收腰 → 贴着卦体上下缘走 ---- */
      const waist = Math.exp(-Math.pow((p.x - mcx) / (W * 0.30), 2));   // 1 = 中心
      const inner = modelHalfH * 0.94;                                 // 卦体外缘
      const outer = inner + Math.max(0, p.spread - inner) * (1 - waist);
      const off = inner + (outer - inner) * Math.abs(p.lane);
      const yT = mcy + (p.lane >= 0 ? -off : off);

      // 主流：向对侧推进
      let vx = p.dir * (1.9 + signal.level * 2.4);
      // 弹性回归轨道（形由轨道定，湍流只做质感）
      let vy = (yT - p.y) * 0.062;

      // 切向绕行：靠近卦象时被推开，形成包裹感
      const swirl = near * near * 1.15 * p.swirl;
      vx += tanX * swirl;
      vy += tanY * swirl * 0.5;

      // 湍流：旋度噪声（无散度 → 自然的卷曲与分叉）
      const n0 = fbm(p.x * F, p.y * F + tOff, 3);
      const nx = fbm((p.x + E) * F, p.y * F + tOff, 3);
      const ny = fbm(p.x * F, (p.y + E) * F + tOff, 3);
      let cx = (ny - n0) / E * 900;
      let cy = -(nx - n0) / E * 900;
      cx = Math.max(-2.4, Math.min(2.4, cx));
      cy = Math.max(-2.4, Math.min(2.4, cy));
      vx += cx * turbK * 1.05;
      vy += cy * turbK * 1.05;

      p.x += vx * k;
      p.y += vy * k;
      p.z += (Math.random() - 0.5) * 0.016 + p.dir * 0.0018;

      // 深度投影：越远越向灭点收、体积越小
      const ps = 1 / (1 + p.z * 0.11);
      p.trail.push(mcx + (p.x - mcx) * ps, mcy + (p.y - mcy) * ps);
      const maxTrail = qq.filTrail * 2;
      if (p.trail.length > maxTrail) p.trail.splice(0, 2);
    }
  }

  /**
   * 绘制丝缕
   * ---------------------------------------------------------------
   * 体积感用「多层递减宽描边」实现 —— 每条丝描 N 遍：
   *   最宽最淡的一遍当辉光（体积），最窄最亮的一遍当芯（丝感）。
   * 这不依赖 ctx.filter / 离屏画布，两端表现完全一致。
   *
   * @param pass 'behind'（模型之后）| 'front'（模型之前）
   */
  function filDraw(ctx2, w, h, pass, globalFade) {
    const fade = globalFade * intro;
    if (fade <= 0.012 || !parts.length) return;
    const geo = model;
    if (!geo) return;
    const qq = q();
    const level = Math.min(1, signal.level);
    const back = pass === 'behind';

    // 收集可见丝缕，算好颜色与透明度
    const items = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const isBack = p.z < 0;
      if (isBack !== back) continue;
      const t = p.trail;
      if (t.length < 4) continue;

      const fadeIn = Math.min(1, p.age / 20);
      const fadeOut = Math.min(1, (p.life - p.age) / 45);
      // 近模型程度 → 暖金内核；远 → 冰白体积雾
      const near = Math.max(0, 1 - Math.hypot(p.x - geo.cx, p.y - geo.cy) / (geo.hx * geo.scale * 2.8));
      const gAmt = Math.max(0, Math.min(1, near * near * 1.5 + p.gold * 0.20));
      const r = Math.round(198 + gAmt * 57);
      const gg = Math.round(232 - gAmt * 46);
      const b = Math.round(255 - gAmt * 140);
      const depthK = isBack ? 0.34 : 1;
      const a = fade * fadeIn * fadeOut * depthK * (0.016 + 0.028 * level) * p.w * (0.75 + near * 1.25);
      if (a < 0.003) continue;
      items.push({ t, r, gg, b, a, w: p.w, isBack });
    }
    if (!items.length) return;

    ctx2.save();
    ctx2.globalCompositeOperation = 'lighter';
    ctx2.lineCap = 'round';
    ctx2.lineJoin = 'round';

    /* --- 辉光层：多层递减宽描边（体积） ---
     * 每条丝描若干遍，由宽到窄、alpha 由淡到浓 ——
     * 宽的一遍当柔光晕（近似模糊后的弥散），窄的一遍当雾体的密度。
     * 这样无需 ctx.filter / 离屏画布，两端表现完全一致。 */
    const layersDef = qq.steps >= 3
      ? [{ w: 13.0, a: 0.10 }, { w: 7.5, a: 0.15 }, { w: 3.6, a: 0.26 }]
      : [{ w: 11.0, a: 0.13 }, { w: 5.5, a: 0.24 }];
    for (const L of layersDef) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        ctx2.strokeStyle = `rgba(${it.r},${it.gg},${it.b},${it.a * L.a})`;
        ctx2.lineWidth = (L.w + it.w * 9) * (it.isBack ? 0.68 : 1);
        ctx2.beginPath();
        ctx2.moveTo(it.t[0], it.t[1]);
        for (let k = 2; k < it.t.length; k += 2) ctx2.lineTo(it.t[k], it.t[k + 1]);
        ctx2.stroke();
      }
    }

    /* --- 芯层：细而亮的描边（丝感），直接画在主画布上 --- */
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      ctx2.strokeStyle = `rgba(${it.r},${it.gg},${it.b},${it.a * 0.85})`;
      ctx2.lineWidth = (0.6 + it.w * 1.3) * (it.isBack ? 0.65 : 1);
      ctx2.beginPath();
      ctx2.moveTo(it.t[0], it.t[1]);
      for (let k = 2; k < it.t.length; k += 2) ctx2.lineTo(it.t[k], it.t[k + 1]);
      ctx2.stroke();
    }
    ctx2.restore();
  }

  /**
   * 镜面地面上的雾影：把丝缕沿镜面翻转、压淡
   */
  function filReflect(ctx2, w, h, globalFade) {
    const fade = globalFade * intro;
    const qq = q();
    if (fade <= 0.02 || !parts.length || !model) return;
    const floorY = model.floorY;
    const step = qq.steps >= 3 ? 1 : 2;
    ctx2.save();
    ctx2.beginPath();
    ctx2.rect(0, floorY, w, h - floorY);
    ctx2.clip();
    ctx2.globalCompositeOperation = 'lighter';
    ctx2.lineCap = 'round';
    ctx2.lineJoin = 'round';
    for (let i = 0; i < parts.length; i += step) {
      const p = parts[i];
      const t = p.trail;
      if (t.length < 4) continue;
      const lastY = t[t.length - 1];
      if (lastY > floorY) continue;               // 只有地面之上的雾才有倒影
      const fadeIn = Math.min(1, p.age / 20);
      const fadeOut = Math.min(1, (p.life - p.age) / 45);
      const a = fade * fadeIn * fadeOut * 0.045 * qq.reflect * p.w;
      if (a < 0.003) continue;
      ctx2.strokeStyle = `rgba(186,216,244,${a})`;
      ctx2.lineWidth = 1.2 + p.w * 2.4;
      ctx2.beginPath();
      ctx2.moveTo(t[0], 2 * floorY - t[1]);
      for (let k = 2; k < t.length; k += 2) ctx2.lineTo(t[k], 2 * floorY - t[k + 1]);
      ctx2.stroke();
    }
    ctx2.restore();
  }

  /**
   * 音层名标注：贴在每层最靠前的那条丝上
   */
  function filLabels(ctx2, w, h, globalFade) {
    const fade = globalFade * intro;
    if (fade < 0.06 || !parts.length) return;
    const best = {};
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.kind === 'main') continue;
      const t = p.trail;
      if (t.length < 4) continue;
      const prog = p.dir > 0 ? p.x : (w - p.x);
      const b = best[p.kind];
      if (!b || prog > b.prog) {
        best[p.kind] = { prog, x: t[t.length - 2], y: t[t.length - 1], st: p.st };
      }
    }
    ctx2.save();
    ctx2.font = '600 9.5px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx2.textBaseline = 'middle';
    ctx2.textAlign = 'center';
    Object.keys(best).forEach((key) => {
      const b = best[key];
      if (!b.st) return;
      if (b.x < 30 || b.x > w - 30) return;
      if (b.y < 12 || b.y > h - 8) return;
      const tw = ctx2.measureText(b.st.name).width;
      ctx2.fillStyle = `rgba(10,16,23,${0.62 * fade})`;
      roundRectPath(ctx2, b.x - tw / 2 - 4, b.y - 8.5, tw + 8, 12.5, 4);
      ctx2.fill();
      ctx2.fillStyle = `rgba(${b.st.color},${0.98 * fade})`;
      ctx2.fillText(b.st.name, b.x, b.y - 2.2);
    });
    ctx2.textAlign = 'left';
    ctx2.restore();
  }

  /* ---------- 主绘制 ---------- */

  function drawScene(ctx2, w, h, dt) {
    const geo = model;

    /* 深色展厅：空间 → 底座 → 倒影 → 卦体 */
    drawRoom3D(ctx2, w, h, geo);
    drawPedestal(ctx2, geo);
    drawFloorShadow(ctx2, geo);

    /* 镜面地面：模型暖光的倒影 */
    {
      const en = Math.min(1, signal.energy * 1.4 + bass * 0.6);
      const rh = (h - geo.floorY) * 0.62;
      const rg = ctx2.createLinearGradient(0, geo.floorY, 0, geo.floorY + rh);
      rg.addColorStop(0, `rgba(255,196,120,${0.085 * (0.4 + en)})`);
      rg.addColorStop(0.45, `rgba(255,176,104,${0.028 * (0.4 + en)})`);
      rg.addColorStop(1, 'rgba(255,170,96,0)');
      ctx2.save();
      ctx2.globalCompositeOperation = 'lighter';
      ctx2.fillStyle = rg;
      ctx2.fillRect(geo.cx - geo.hx * geo.scale * 1.1, geo.floorY, geo.hx * geo.scale * 2.2, rh);
      ctx2.restore();
    }
    drawReflection(ctx2, geo, signal.bins, moving);

    /* 丝缕系统：推进 → 地面雾影 → 后景丝缕 */
    filUpdate(dt, geo);
    filReflect(ctx2, w, h, 1);
    filDraw(ctx2, w, h, 'behind', 1);

    // 自下而上绘制：上方各爻的顶面才不会盖住下方爻身
    for (let i = geo.rows.length - 1; i >= 0; i--) {
      const yang = geo.rows[i] === 1;
      // +y 朝上（屏幕 y = cy - yv），故上爻取正、下爻取负
      const y = ((geo.rows.length - 1) / 2 - i) * geo.gap;
      const isMov = moving.indexOf(geo.rows.length - i) >= 0;   // rows 自上而下 → 爻位 rows.length - i

      // 各爻取不同频段：上爻高频、下爻低频
      const data = signal.bins;
      const band = Math.floor((i / 6) * (data ? data.length * 0.62 : 1));
      let e = 0.16;
      if (data) {
        for (let k = 0; k < 7; k++) e += data[Math.min(data.length - 1, band + k * 3)];
        e = e / 7;
      }
      e = Math.min(1, e);

      const segs = yang ? [[-geo.hx, geo.hx]] : [[-geo.hx, -13], [13, geo.hx]];
      segs.forEach(([x0, x1]) => {
        drawYao3D(ctx2, geo, { x0, x1, y }, e, isMov, 1, 0);
      });

      /* 动爻标记：右侧一枚朱红圆点，随鼓点点亮 */
      if (isMov) {
        const px = geo.cx + (geo.hx + 20) * geo.scale;
        const py = geo.cy - y * geo.scale;
        const pulse = 0.45 + 0.55 * Math.min(1, bass * 2.2 + 0.25);
        ctx2.fillStyle = `rgba(232,120,96,${pulse})`;
        ctx2.beginPath();
        ctx2.arc(px, py, 3.6, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = `rgba(232,120,96,${pulse * 0.22})`;
        ctx2.beginPath();
        ctx2.arc(px, py, 7.5, 0, Math.PI * 2);
        ctx2.fill();
      }
    }

    /* 面前的雾 */
    filDraw(ctx2, w, h, 'front', 1);

    /* 卦象的暖金辉光：光溢到四周的雾上（模型是这场景里的光源） */
    const energy2 = Math.min(1, signal.energy * 1.4 + bass * 0.6);
    const bloomR = geo.hx * geo.scale * 2.8;
    const bloom = ctx2.createRadialGradient(geo.cx, geo.cy, 4, geo.cx, geo.cy, bloomR);
    bloom.addColorStop(0, `rgba(255,198,124,${0.115 * (0.45 + energy2 * 0.75)})`);
    bloom.addColorStop(0.40, `rgba(255,172,104,${0.040 * (0.45 + energy2 * 0.75)})`);
    bloom.addColorStop(1, 'rgba(255,160,90,0)');
    ctx2.save();
    ctx2.globalCompositeOperation = 'lighter';
    ctx2.fillStyle = bloom;
    ctx2.fillRect(geo.cx - bloomR, geo.cy - bloomR, bloomR * 2, bloomR * 2);
    ctx2.restore();

    /* 镜头横向耀斑：模型高度上的一道水平光（科技感的一笔） */
    {
      const sw = w * 0.44;
      const sg = ctx2.createLinearGradient(geo.cx - sw, 0, geo.cx + sw, 0);
      sg.addColorStop(0, 'rgba(255,224,186,0)');
      sg.addColorStop(0.5, `rgba(255,236,208,${0.085 * (0.4 + energy2)})`);
      sg.addColorStop(1, 'rgba(255,224,186,0)');
      ctx2.save();
      ctx2.globalCompositeOperation = 'lighter';
      ctx2.fillStyle = sg;
      ctx2.fillRect(geo.cx - sw, geo.cy - 0.8, sw * 2, 1.6);
      ctx2.globalAlpha = 0.35;
      ctx2.fillRect(geo.cx - sw, geo.cy - 5, sw * 2, 10);
      ctx2.restore();
    }

    filLabels(ctx2, w, h, 1);
  }

  /* ---------- 对外 ---------- */

  return {
    /** 设置画布尺寸（CSS 像素） */
    resize(w, h) {
      W = w; H = h;
      model = buildModel();
    },

    /** 直接指定上下文与尺寸（一次到位） */
    attach(ctx2, w, h) {
      ctx = ctx2; W = w; H = h;
      model = buildModel();
    },

    /** 设置卦象（rows 自上而下，0=阴 1=阳；moving 为动爻爻位） */
    setHex(r, mov) {
      rows = (r && r.length) ? r.slice() : [1, 0, 1, 0, 1, 0];
      moving = (mov || []).slice();
      model = buildModel();
    },

    /** 设置音层（雾的来源之一，同时用于标注） */
    setLayers(l) { layers = (l || []).slice(); },

    /** 画质档：'high' | 'perf' */
    setQuality(name) { quality = VIZ_QUALITY[name] ? name : 'high'; },

    /**
     * 注入频谱信号
     * @param sig { bins, low, mid, high, level, energy, bassTarget }
     *   bins —— 频段强度（Uint8Array 0..255 或 Float32Array 0..1）
     *   其余 —— 0..1 的标量
     */
    setSignal(sig) {
      signal.bins = normBins(sig ? sig.bins : null);
      bandsProvided = !!(sig && sig.bands);
      if (bandsProvided) {
        const b = sig.bands;
        signal.low = b.low || 0;
        signal.mid = b.mid || 0;
        signal.high = b.high || 0;
        signal.level = b.level || 0;
        signal.energy = b.energy || 0;
      }
      signal.bassTarget = sig ? (sig.bassTarget || 0) : 0;
    },

    /**
     * 播放状态机（与网页版同一套）
     *   'playing' —— 演奏中：雾生成、推进、卦体随鼓点呼吸
     *   'paused'  —— 暂停：完全定格（雾不推进、不消散）
     *   'drain'   —— 停止：雾渐弱散尽
     *   'idle'    —— 未播：画面静止
     */
    setFlowState(mode) {
      if (mode === 'playing') {
        if (flowMode !== 'playing') drainT = 0;
        flowMode = 'playing';
      } else if (mode === 'paused') {
        flowMode = 'paused';
      } else if (mode === 'drain') {
        if (flowMode === 'playing') drainT = FLOW_DRAIN_FADE;
        flowMode = 'drain';
      } else {
        flowMode = 'idle';
      }
    },

    /** 取当前几何（供测试与外部读取） */
    geo() {
      return model ? {
        scale: model.scale, gap: model.gap, cy: model.cy,
        barH: model.hy * 2, rows: model.rows.length,
        floorY: model.floorY, baseY: model.baseY,
        cx: model.cx, hx: model.hx
      } : null;
    },

    /** 取完整模型（含 rows 数组与配色，供外部计算用） */
    model() { return model; },

    /** 取丝缕系统状态（供测试） */
    stats() {
      return {
        n: parts.length,
        intro,
        playing: flowMode === 'playing',
        flowMode,
        sample: parts.length ? {
          x: Math.round(parts[0].x), y: Math.round(parts[0].y),
          z: +parts[0].z.toFixed(2), trail: parts[0].trail.length
        } : null
      };
    },

    /** 所有丝缕的横坐标（供测试） */
    filXs() { return parts.map((p) => p.x); },

    /**
     * 画一帧
     * @param ctx2  Canvas 2D 上下文（坐标系须已是 CSS 像素）
     * @param dt    距上一帧的秒数
     */
    draw(ctx2, dt) {
      if (!ctx2) return;
      ctx = ctx2;
      const d = Math.max(0, Math.min(0.05, dt || 0));

      /* 渐入 / 排空（暂停时完全定格） */
      if (flowMode === 'playing') {
        intro = Math.min(1, intro + d / FLOW_INTRO);
      } else if (flowMode === 'drain') {
        drainT -= d;
        intro = Math.max(0, intro - d / 0.6);
        if (drainT <= 0) { drainT = 0; parts.length = 0; }
      } else if (flowMode === 'idle') {
        intro = Math.max(0, intro - d / 0.6);
      }
      // 'paused' —— 什么都不做，画面定格

      /* 频段包络：调用方未自带 bands 时，core 自行推算并平滑
       * （小程序无 AnalyserNode，这条路径是它唯一的信号来源） */
      if (!bandsProvided) {
        const a = signal.bins ? analyze(signal.bins)
          : { low: 0, mid: 0, high: 0, level: 0, energy: 0, bassTarget: 0 };
        signal.low = envFollow(envLow, a.low, d, 0.05, 0.30); envLow = signal.low;
        signal.mid = envFollow(envMid, a.mid, d, 0.04, 0.22); envMid = signal.mid;
        signal.high = envFollow(envHigh, a.high, d, 0.02, 0.14); envHigh = signal.high;
        signal.level = envFollow(envLevel, a.level, d, 0.04, 0.26); envLevel = signal.level;
        signal.energy = envEnergy * 0.78 + a.energy * 0.22; envEnergy = signal.energy;
        if (!signal.bassTarget) signal.bassTarget = a.bassTarget;
      }

      /* 鼓点包络：低频能量上升快、回落慢 —— 停止后缓缓停下 */
      const target = signal.bassTarget;
      const k = target > bass
        ? 1 - Math.pow(0.001, d / 0.045)
        : 1 - Math.pow(0.001, d / 0.42);
      bass += (target - bass) * k;

      // 模型每帧重建：卦体随鼓点缩放（与参考图的「呼吸」一致）
      model = buildModel();
      // 供端到端测试读取真实几何（避免测试里写死常量而随改动腐化）
      if (typeof window !== 'undefined') {
        window.__gxVizGeo = {
          scale: model.scale, gap: model.gap, cy: model.cy,
          barH: model.hy * 2, rows: model.rows.length,
          floorY: model.floorY, baseY: model.baseY
        };
      }
      drawScene(ctx2, W, H, d);
    }
  };
}

/* ===============================================================
 * 频谱推算（小程序无 AnalyserNode 时用）
 * ---------------------------------------------------------------
 * 由乐谱与播放位置推算频段强度 —— 确定、不失真。
 * =============================================================== */

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

/**
 * 由频谱算出标量信号（两端同源，保证观感一致）
 * @param bins Uint8Array(0..255) 或 Float32Array(0..1)
 */
function analyze(bins) {
  const b = normBins(bins);
  if (!b) return { low: 0, mid: 0, high: 0, level: 0, energy: 0, bassTarget: 0 };
  let sum = 0;
  for (let i = 0; i < b.length; i++) sum += b[i] * b[i];
  const e = Math.sqrt(sum / b.length);
  const band = (a, z) => {
    let s = 0, n = 0;
    for (let i = a; i < z && i < b.length; i++) { s += b[i]; n++; }
    return n ? s / n : 0;
  };
  // 频段划分（与网页版 Analyser 的 fftSize=512 对齐，bin ≈ 86Hz）
  const lo = band(1, 4);
  const md = band(4, 24);
  const hi = band(24, 140);
  let lo2 = 0;
  const loN = Math.min(b.length, 6);
  for (let i = 1; i < loN; i++) lo2 += b[i];
  lo2 = lo2 / Math.max(1, loN - 1);
  return {
    low: Math.min(1, Math.pow(lo, 0.72) * 1.5),
    mid: Math.min(1, Math.pow(md, 0.85) * 1.7),
    high: Math.min(1, Math.pow(hi, 0.90) * 2.1),
    level: Math.min(1, Math.pow(e, 0.80) * 2.0),
    energy: e,
    bassTarget: Math.min(1, Math.pow(lo2, 0.78) * 1.35)
  };
}

const API = { createStage, spectrumFromScore, analyze, VIZ_QUALITY };

/* 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else {
  window.ICVizStage = API;
}

})();
