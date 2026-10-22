/**
 * 临时视觉验收：真三维卦体 + 风洞流线
 * 依次截图：未播放（静止模型）、播放中（流线包裹）、停止后（排空渐隐）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const SHOTS = path.join(ROOT, 'screenshots');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serve(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const full = path.join(WEB, p);
      if (!full.startsWith(WEB) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      fs.createReadStream(full).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 60000);
    });
  }
  close() { try { this.ws.close(); } catch (e) { /* noop */ } }
}

(async function main() {
  const browser = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!fs.existsSync(browser)) { console.log('no browser'); process.exit(0); }
  const PORT = 8911;
  const srv = await serve(PORT);
  const userDir = path.join(require('os').tmpdir(), 'gx-viz-' + Date.now());
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=9235',
    `--user-data-dir=${userDir}`, 'about:blank'], { stdio: 'ignore' });
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
        http.get('http://127.0.0.1:9235/json/list', (r) => {
          let d = ''; r.on('data', (c) => d += c); r.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      target = res.find((t) => t.type === 'page');
      if (target) break;
    } catch (e) { /* retry */ }
  }
  if (!target) { console.log('no target'); process.exit(1); }

  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await new Promise((r) => setTimeout(r, 3000));

  const errors = [];
  cdp.send('Log.enable').catch(() => {});
  const evalJS = async (expression, awaitPromise) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) errors.push(JSON.stringify(r.exceptionDetails.text) + ' ' + (r.exceptionDetails.exception || {}).description);
    return r.result && r.result.value;
  };
  const shotCanvas = async (name) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png', clip: await evalJS(`(() => { const r = document.querySelector('#viz').getBoundingClientRect(); return { x: r.x - 6, y: r.y - 30, width: r.width + 12, height: r.height + 36, scale: 2 }; })()`) });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(s.data, 'base64'));
    console.log('[OK]', name);
  };

  await evalJS(`document.querySelector('.tabbtn[data-page=music]').click()`);
  await new Promise((r) => setTimeout(r, 900));
  await shotCanvas('viz-1-idle.png');

  // 开音层后播放
  await evalJS(`
    document.querySelector('#ambSolfChips .amb-chip[data-freq="528"]').click();
    document.querySelector('#ambNatureChips .amb-chip[data-nature="rain"]').click();
    document.querySelector('#ambNatureChips .amb-chip[data-nature="birds"]').click();
    document.querySelector('#btnPlay').click();
  `);
  await new Promise((r) => setTimeout(r, 3500));
  await shotCanvas('viz-2-playing.png');
  await new Promise((r) => setTimeout(r, 2500));
  await shotCanvas('viz-3-playing2.png');

  // 停止 → 排空
  await evalJS(`document.querySelector('#btnPlay').click()`);
  await new Promise((r) => setTimeout(r, 350));
  await shotCanvas('viz-4-drain.png');
  await new Promise((r) => setTimeout(r, 3000));
  await shotCanvas('viz-5-stopped.png');

  console.log('errors:', errors.length ? errors : 'none');
  cdp.close();
  cleanup();
  process.exit(0);
})();