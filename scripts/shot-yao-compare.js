/**
 * 卦象方向目视核对
 * ---------------------------------------------------------------
 * 立同一个卦（如地天泰），把起卦栏的六爻图与波形台的立体卦体
 * 各截一张，并排对照用肉眼判断方向是否一致。
 *
 * 用法：node scripts/shot-yao-compare.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const SHOTS = path.join(ROOT, 'screenshots');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

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
  const PORT = 8919;
  const srv = await serve(PORT);
  const userDir = path.join(require('os').tmpdir(), 'gx-yao-' + Date.now());
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=9247',
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
        http.get('http://127.0.0.1:9247/json/list', (r) => {
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

  const evalJS = async (expression, awaitPromise) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) console.log('ERR', JSON.stringify(r.exceptionDetails.text));
    return r.result && r.result.value;
  };
  const shotEl = async (sel, name, pad) => {
    const clip = await evalJS(`(() => {
      const el = document.querySelector('${sel}');
      // 先把元素滚到视口正中，避开固定顶栏
      let r = el.getBoundingClientRect();
      window.scrollBy(0, r.top - window.innerHeight / 2 + r.height / 2);
      r = el.getBoundingClientRect();
      const p = ${pad || 8};
      return { x: r.x - p, y: r.y + window.scrollY - p, width: r.width + p * 2, height: r.height + p * 2, scale: 2 };
    })()`);
    const s = await cdp.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(s.data, 'base64'));
    console.log('[OK]', name);
  };

  // 地天泰：下乾三连阳、上坤三连阴
  const info = await evalJS(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    window.__gxCastHexagram(11);
    document.querySelector('.tabbtn[data-page="cast"]').click();
    await sleep(300);

    const fig = Array.from(document.querySelectorAll('#yaoFigure .yao')).map(r =>
      r.querySelector('.yao-line.solid') ? '1' : '0').join('');
    return { name: document.querySelector('#resultName').textContent, fig,
      structure: document.querySelector('#resultStructure').textContent };
  })()`, true);
  console.log('卦：', info.name, '|', info.structure, '| 六爻图自上而下', info.fig);
  await shotEl('.result-head', 'yao-cast-tai.png', 6);

  await evalJS(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    document.querySelector('.tabbtn[data-page="music"]').click();
    await sleep(500);

    return true;
  })()`, true);
  console.log('波形台自上而下', await evalJS('window.__gxVizRows'));
  await shotEl('#viz', 'yao-viz-tai.png', 4);

  cdp.close();
  cleanup();
  process.exit(0);
})();