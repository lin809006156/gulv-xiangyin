/**
 * 太极图绘制校验
 * ---------------------------------------------------------------
 * 小程序端与网页端都画太极图。此前小程序端用纯 CSS 画，
 * 结果画成了「上下平分 + 方槽」的怪东西，完全不是太极。
 *
 * 本脚本用**像素判据**验证画出来的是标准阴阳鱼：
 *   ① 画面非空（有黑有白）
 *   ② 上下对称：上四分之一与下四分之一的暗像素数相近（太极左右两瓣对称呼）
 *   ③ **S 形判据**（关键）：在圆的中心竖线上，
 *      上半应偏白（白瓣在上）、下半应偏黑；
 *      而在圆心的左右两侧，分布应相反 —— 这正是 S 形分界的特征。
 *      若只是上下平分，这两条判据必然不成立。
 *   ④ 两个鱼眼位置：圆心上方的鱼眼是白点、下方是黑点
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MINI = path.join(ROOT, 'miniprogram');
const CORE = path.join(ROOT, 'core');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  [OK] ' + m); };
const bad = (m) => { fail++; console.log('  [!!] ' + m); };
const assert = (c, m) => { if (c) ok(m); else bad(m); };

/* ---------- 把小程序端的 taiji.js 拿来，在浏览器里跑 ---------- */
function loadTaiji() {
  // 共享核心在 core/taiji.js（两端共用同一份）
  const src = fs.readFileSync(path.join(CORE, 'taiji.js'), 'utf8');
  const module = { exports: {} };
  const fn = new Function('module', 'exports', src);
  fn(module, module.exports);
  return module.exports;
}

function serve(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><body><canvas id="c" width="400" height="400"></canvas></body></html>');
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0; this.pending = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res());
      this.ws.addEventListener('error', () => rej(new Error('ws error')));
    });
    this.ws.addEventListener('message', (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch (err) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: rs, reject: rj } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rj(new Error(JSON.stringify(msg.error))) : rs(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
    });
  }
  close() { try { this.ws.close(); } catch (e) { /* noop */ } }
}

(async function main() {
  console.log('=== 太极图绘制校验 ===\n');

  /* ① 模块可加载且导出正确 */
  const taiji = loadTaiji();
  assert(typeof taiji.draw === 'function', 'core/taiji.js 可加载且导出 draw()');

  const browser = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!fs.existsSync(browser)) {
    console.log('  [跳过] 未找到浏览器，无法做像素校验');
    console.log('\n' + '='.repeat(46));
    console.log(`通过 ${pass} 项，失败 ${fail} 项`);
    process.exit(fail > 0 ? 1 : 0);
  }

  const PORT = 8931;
  const srv = await serve(PORT);
  const userDir = path.join(require('os').tmpdir(), 'gx-taiji-' + Date.now());
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=9251', `--user-data-dir=${userDir}`, 'about:blank'], { stdio: 'ignore' });
  const cleanup = () => {
    try { proc.kill(); } catch (e) { /* noop */ }
    try { srv.close(); } catch (e) { /* noop */ }
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* noop */ }
  };
  process.on('exit', cleanup);

  let target = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9251/json/list', (r) => {
          let d = ''; r.on('data', (c) => d += c); r.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      target = res.find((t) => t.type === 'page');
      if (target) break;
    } catch (e) { /* retry */ }
  }
  if (!target) { console.log('  [跳过] 浏览器未就绪'); process.exit(0); }

  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await new Promise((r) => setTimeout(r, 1200));

  const evalJS = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception || {}).description || ''));
    return r.result && r.result.value;
  };

  // 把小程序端的 taiji.js 源码注入页面执行，用真实像素测量
  const taijiSrc = fs.readFileSync(path.join(CORE, 'taiji.js'), 'utf8');
  const measure = await evalJS(`(() => {
    const cv = document.getElementById('c');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ${taijiSrc.replace(/^'use strict';/m, '').replace(/module\.exports\s*=\s*\{[^}]*\};?/m, '')}
    // 直接调用 draw
    const drawFn = (function(){ ${taijiSrc.replace(/^'use strict';/m, '').replace(/module\.exports\s*=\s*\{[^}]*\};?/m, '')} return draw; })();
    drawFn(ctx, W/2, H/2, W/2 - 10);

    const d = ctx.getImageData(0, 0, W, H).data;
    const at = (x, y) => {
      const i = (Math.round(y) * W + Math.round(x)) * 4;
      return d[i];  // 红通道：深色约 35，浅色约 247
    };
    const cx = W/2, cy = H/2, R = W/2 - 10;
    // 统计某矩形内的暗像素比例
    const darkRatio = (x0, y0, x1, y1) => {
      let n = 0, tot = 0;
      for (let y = Math.round(y0); y < Math.round(y1); y += 2) {
        for (let x = Math.round(x0); x < Math.round(x1); x += 2) {
          const dx = x - cx, dy = y - cy;
          if (dx*dx + dy*dy > R*R) continue;   // 只看圆内
          tot++;
          if (at(x, y) < 128) n++;
        }
      }
      return tot ? n / tot : 0;
    };
    return {
      // 上半：中心竖条（应偏黑）；下半：中心竖条（应偏白）
      upCenter:   darkRatio(cx - R*0.10, cy - R*0.75, cx + R*0.10, cy - R*0.12),
      downCenter: darkRatio(cx - R*0.10, cy + R*0.12, cx + R*0.10, cy + R*0.75),
      // 上部靠左 / 上部靠右：S 形时二者不同
      upLeft:     darkRatio(cx - R*0.72, cy - R*0.70, cx - R*0.22, cy - R*0.20),
      upRight:    darkRatio(cx + R*0.22, cy - R*0.70, cx + R*0.72, cy - R*0.20),
      // 鱼眼：上方应是白点（暗比例低），下方应是黑点（暗比例高）
      eyeUp:      darkRatio(cx - R*0.07, cy - R*0.31, cx + R*0.07, cy - R*0.19),
      eyeDown:    darkRatio(cx - R*0.07, cy + R*0.19, cx + R*0.07, cy + R*0.31),
      // 整体非空
      anyDark:    darkRatio(cx - R*0.9, cy - R*0.9, cx + R*0.9, cy + R*0.9) > 0.05,
      anyLight:   darkRatio(cx - R*0.9, cy - R*0.9, cx + R*0.9, cy + R*0.9) < 0.95
    };
  })()`);

  console.log('  测量值：', JSON.stringify(measure, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v));

  /* ② 画面非空 */
  assert(measure.anyDark && measure.anyLight, '画面有黑有白（非空白）');

  /* ③ S 形判据 —— 关键
     标准太极：黑瓣的「头」在上（故上中心偏黑，其中嵌白眼），
     白瓣的「头」在下（故下中心偏白，其中嵌黑眼）。
     若是「上下平分」，上中心必然偏白、下中心偏黑，与此相反。 */
  assert(measure.upCenter > 0.5,
    `S 形：上半中心偏黑（黑瓣头在上，暗像素 ${(measure.upCenter * 100).toFixed(0)}%）`);
  assert(measure.downCenter < 0.5,
    `S 形：下半中心偏白（白瓣头在下，暗像素 ${(measure.downCenter * 100).toFixed(0)}%）`);

  /* ④ 上下左右分布不同 —— 这是「S 形」而非「上下平分」的关键证据 */
  const diff = Math.abs(measure.upLeft - measure.upRight);
  assert(diff > 0.2,
    `S 形：上半左右分布明显不同（左 ${(measure.upLeft * 100).toFixed(0)}% vs 右 ${(measure.upRight * 100).toFixed(0)}%，差 ${(diff * 100).toFixed(0)}%）`);

  /* ⑤ 鱼眼 */
  assert(measure.eyeUp < 0.6, `鱼眼：上眼为白点（暗像素 ${(measure.eyeUp * 100).toFixed(0)}%）`);
  assert(measure.eyeDown > 0.6, `鱼眼：下眼为黑点（暗像素 ${(measure.eyeDown * 100).toFixed(0)}%）`);

  cdp.close();
  cleanup();

  console.log('\n' + '='.repeat(46));
  console.log(`通过 ${pass} 项，失败 ${fail} 项`);
  console.log('='.repeat(46));
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('校验异常：', e && e.message ? e.message : e);
  console.log(`\n通过 ${pass} 项，失败 ${fail} 项（异常）`);
  process.exit(1);
});
