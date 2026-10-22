/**
 * 外观皮肤验收截图
 * ---------------------------------------------------------------
 * 依次切到 纸本 / 流光 / 夜航 三套皮肤，各截音乐栏与起卦栏，
 * 用于核对换肤是否即时生效、对比度是否足够。
 *
 * 用法：node scripts/shot-skins.js
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
  const PORT = 8915;
  const srv = await serve(PORT);
  const userDir = path.join(require('os').tmpdir(), 'gx-skin-' + Date.now());
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=9241',
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
        http.get('http://127.0.0.1:9241/json/list', (r) => {
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
  await new Promise((r) => setTimeout(r, 3200));

  const evalJS = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) console.log('ERR', JSON.stringify(r.exceptionDetails.text));
    return r.result && r.result.value;
  };
  const shot = async (name) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(s.data, 'base64'));
    console.log('[OK]', name);
  };

  for (const key of ['paper', 'shine', 'night']) {
    await evalJS(`(() => {
      document.querySelector('.tabbtn[data-page="music"]').click();
      const b = document.querySelector('#skinList .skin-opt[data-key="${key}"]');
      if (b) b.click();
      return document.documentElement.getAttribute('data-skin');
    })()`);
    await new Promise((r) => setTimeout(r, 700));
    await shot(`skin-${key}-music.png`);
  }

  // 设置面板：顶栏齿轮进入
  await evalJS(`(() => {
    document.querySelector('#skinList .skin-opt[data-key="paper"]').click();
    document.querySelector('#btnSettings').click();
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  await shot('skin-sheet-paper.png');

  for (const key of ['shine', 'night']) {
    await evalJS(`document.querySelector('#skinList .skin-opt[data-key="${key}"]').click()`);
    await new Promise((r) => setTimeout(r, 450));
    await shot(`skin-sheet-${key}.png`);
  }

  // 设置页下半部分：「我」与「关于」
  {
    const clip = await evalJS(`(() => {
      document.querySelector('#skinList .skin-opt[data-key="night"]').click();
      document.querySelector('#fontRow .seg[data-font="m"]').click();
      const body = document.querySelector('#settingsSheet .sheet-body');
      body.scrollTop = body.scrollHeight;
      const r = document.querySelector('#settingsSheet').getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 2 };
    })()`);
    await new Promise((r) => setTimeout(r, 500));
    const sc = await cdp.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
    fs.writeFileSync(path.join(SHOTS, 'skin-sheet-me.png'), Buffer.from(sc.data, 'base64'));
    console.log('[OK]', 'skin-sheet-me.png');
  }

  // 大字号
  await evalJS(`(() => {
    document.querySelector('#skinList .skin-opt[data-key="night"]').click();
    document.querySelector('#fontRow .seg[data-font="l"]').click();
  })()`);
  await new Promise((r) => setTimeout(r, 500));
  await shot('skin-sheet-font-large.png');
  await evalJS(`document.querySelector('#fontRow .seg[data-font="m"]').click()`);

  cdp.close();
  cleanup();
  process.exit(0);
})();
