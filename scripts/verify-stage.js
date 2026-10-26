/**
 * 波形台共享渲染核心 · 跨端渲染校验
 * ---------------------------------------------------------------
 * 网页版与微信小程序端共用 core/viz-stage.js，
 * 故须保证它在「小程序式」环境下（无 AnalyserNode、走乐谱推算频谱）
 * 也能正常出图 —— 否则小程序端的波形台会一片空白。
 *
 * 检查项：
 *   ① 模块可加载、无异常
 *   ② 乐谱推算频谱有能量
 *   ③ 丝缕正常生成、渐入完成
 *   ④ 画面非空（不是一张白纸）
 *   ⑤ 卦体区有金属暖色像素（金属板真的画出来了）
 *
 * 用法：node scripts/verify-stage.js
 * ---------------------------------------------------------------
 * 小程序 Canvas 2D（type="2d"）兼容 H5 Canvas 2D API，
 * 但没有 AnalyserNode、没有 document —— 故此处：
 *   ① 用 OffscreenCanvas 造一个「类小程序」的上下文（无 window 依赖）
 *   ② 走「乐谱推算频谱」那条路径（小程序唯一的信号来源）
 *   ③ 检查是否真的画出了东西（像素非空、卦体位置有金属色）
 *
 * 用法：node .tmp-mp-canvas-check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

(async () => {
  const fails = [];
  const ok = (m) => console.log('  [OK] ' + m);
  const bad = (m) => { fails.push(m); console.log('  [!!] ' + m); };

  // ---- 造一个离屏画布（Node 18+ 无 canvas，用 CDP 里的浏览器更靠谱）----
  // 这里改用：起一个 headless 浏览器，把 core/viz-stage.js 注入页面执行
  const http = require('http');
  const { spawn } = require('child_process');
  const ROOT = path.resolve(__dirname, '..');
  const PORT = 8925;
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const fp = path.join(ROOT, p);
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(fp);
    res.writeHead(200, { 'Content-Type': ext === '.js' ? 'text/javascript' : 'text/html' });
    res.end(fs.readFileSync(fp));
  });
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));

  const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--remote-debugging-port=9351', '--disable-gpu',
    '--no-first-run', '--user-data-dir=' + path.join(ROOT, '.tmp-chrome-prof-stage')
  ], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));

  const list = await new Promise((resolve) => {
    http.get('http://127.0.0.1:9351/json', (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    });
  });
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise(res => {
    const i = ++id; pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/web/index.html` });
  await new Promise(r => setTimeout(r, 2500));

  const src = fs.readFileSync(path.join(ROOT, 'core/viz-stage.js'), 'utf-8');
  const expr = `(async () => {
    const out = { errors: [] };
    // 在页面里加载 core/viz-stage.js（模拟小程序 require）
    try {
      ${src}
      const Viz = window.ICVizStage;
      out.hasModule = !!Viz;
      if (!Viz) return out;

      // —— 模拟小程序：无 AnalyserNode，走乐谱推算频谱 ——
      const W = 320, H = 150, DPR = 3;
      const canvas = document.createElement('canvas');
      canvas.width = W * DPR; canvas.height = H * DPR;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      const stage = Viz.createStage();
      stage.attach(ctx, W, H);
      stage.setHex([1,0,1,0,1,0], [3]);
      stage.setFlowState('playing');

      // 乐谱 → 频谱（小程序路径）
      const score = { notes: [
        { time: 0, dur: 1.5, midi: 48, vel: 1 },
        { time: 0, dur: 1.5, midi: 55, vel: 0.8 },
        { time: 0.2, dur: 1.0, midi: 64, vel: 0.7 },
        { time: 0.5, dur: 1.0, midi: 67, vel: 0.6 }
      ] };
      const bins = Viz.spectrumFromScore(score, 0.5, 64);
      let mx = 0; for (let i = 0; i < bins.length; i++) if (bins[i] > mx) mx = bins[i];
      out.specMax = +mx.toFixed(3);
      out.hasEnergy = mx > 0.5;

      // 跑 120 帧
      for (let i = 0; i < 120; i++) {
        stage.setSignal({ bins });
        stage.draw(ctx, 1 / 60);
      }
      out.stats = stage.stats();
      out.geo = stage.geo();

      // 像素检查：画面不是空的
      const px = ctx.getImageData(0, 0, W * DPR, H * DPR).data;
      let nonEmpty = 0, warm = 0;
      for (let i = 0; i < px.length; i += 4 * 37) {
        if (px[i] + px[i+1] + px[i+2] > 30) nonEmpty++;
        if (px[i] > px[i+2] + 30) warm++;   // 金属卦体偏暖
      }
      out.sampled = Math.floor(px.length / (4 * 37));
      out.nonEmpty = nonEmpty;
      out.warmPixels = warm;

      // 卦体区域应有暖色像素（金属板）：扫卦体所在的纵向范围
      const x0 = Math.round((out.geo.cx - out.geo.hx * out.geo.scale) * DPR);
      const x1 = Math.round((out.geo.cx + out.geo.hx * out.geo.scale) * DPR);
      const y0 = Math.round((out.geo.cy - 45) * DPR);
      const y1 = Math.round((out.geo.cy + 45) * DPR);
      const bd = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      let warmRow = 0, sampled2 = 0;
      for (let i = 0; i < bd.length; i += 4) { sampled2++; if (bd[i] > bd[i+2] + 25) warmRow++; }
      out.warmRow = warmRow;
      out.warmSampled = sampled2;
    } catch (e) {
      out.errors.push(String(e && e.stack ? e.stack : e).slice(0, 600));
    }
    return out;
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  const v = r.result?.result?.value;
  if (!v) { console.log('  [!!] 无返回值', JSON.stringify(r.result).slice(0, 400)); }
  else {
    console.log(JSON.stringify(v, null, 2));
    if (v.errors && v.errors.length) bad('执行异常：' + v.errors[0]);
    else ok('无异常');
    if (v.hasModule) ok('模块加载成功'); else bad('模块未加载');
    if (v.hasEnergy) ok('乐谱推算频谱有能量 ' + v.specMax); else bad('频谱无能量');
    if (v.stats && v.stats.n > 20) ok('丝缕生成 ' + v.stats.n + ' 条'); else bad('丝缕过少：' + (v.stats && v.stats.n));
    if (v.stats && v.stats.intro >= 0.99) ok('渐入完成 ' + v.stats.intro.toFixed(2)); else bad('渐入未完成');
    if (v.nonEmpty > v.sampled * 0.5) ok('画面非空 ' + v.nonEmpty + '/' + v.sampled); else bad('画面近乎空白');
    if (v.warmRow > v.warmSampled * 0.05) ok('卦体区有金属暖色像素 ' + v.warmRow + '/' + v.warmSampled); else bad('卦体区无暖色像素：' + v.warmRow + '/' + v.warmSampled);
  }
  srv.close();
  try { browser.kill(); } catch (e) {}
  console.log('\n' + (fails.length ? '失败 ' + fails.length + ' 项' : '全部通过'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
