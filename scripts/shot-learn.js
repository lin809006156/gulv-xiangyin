/**
 * 截取「学易栏 → 六十四卦详情」各部分的版式截图，用于人工验收
 * 用法：node scripts/shot-learn.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const OUT = path.join(__dirname, '..', 'shots');
const PORT = 8123;
const CDP_PORT = 9295;

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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 45000);
    });
  }
  close() { try { this.ws.close(); } catch (e) { /* noop */ } }
}

(async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn(process.execPath, ['-e',
    `require('http').createServer((q,s)=>{const f=require('path').join(${JSON.stringify(path.join(__dirname, '..', 'web'))}, q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]);s.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');require('fs').createReadStream(f).on('error',()=>{s.statusCode=404;s.end()}).pipe(s)}).listen(${PORT})`
  ], { stdio: 'ignore' });
  process.on('exit', () => { try { server.kill(); } catch (e) { /* noop */ } });
  await new Promise((r) => setTimeout(r, 900));

  const browser = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + path.join(require('os').tmpdir(), 'sl-' + Date.now()),
    '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { proc.kill(); } catch (e) { /* noop */ } });

  let target = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:' + CDP_PORT + '/json/list', (r2) => {
          let d = ''; r2.on('data', (c) => { d += c; });
          r2.on('end', () => resolve(JSON.parse(d)));
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
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });

  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await new Promise((r) => setTimeout(r, 3200));

  async function shot(name, full) {
    if (full) {
      const m = await cdp.send('Page.getLayoutMetrics');
      const h = Math.min(Math.ceil(m.cssContentSize.height), 5200);
      await cdp.send('Emulation.setDeviceMetricsOverride',
        { width: 430, height: h, deviceScaleFactor: 2, mobile: true });
      await new Promise((r) => setTimeout(r, 400));
    }
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
    console.log('  saved', name + '.png');
    if (full) {
      await cdp.send('Emulation.setDeviceMetricsOverride',
        { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  /* 打开地天泰详解 */
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('.tabbtn[data-page="learn"]').click();
      const sec = document.querySelector('.lsec[data-key="hexagrams"]');
      const t = sec.querySelector('.lsec-head'); if (t && !sec.classList.contains('is-open')) t.click();
      return true;
    })()`,
    returnByValue: true
  });
  await new Promise((r) => setTimeout(r, 700));
  await shot('learn-1-hex64-list');

  await cdp.send('Runtime.evaluate', {
    expression: `(() => { document.querySelector('.hex64-cell[data-n="11"]').click(); return true; })()`,
    returnByValue: true
  });
  await new Promise((r) => setTimeout(r, 700));
  await shot('learn-2-detail-top');

  /* 逐爻表 */
  await cdp.send('Runtime.evaluate', {
    expression: `(() => { const el = document.querySelector('.h64d-yao'); el.scrollIntoView({block:'center'}); return true; })()`,
    returnByValue: true
  });
  await new Promise((r) => setTimeout(r, 500));
  await shot('learn-3-yao-table');

  /* 八宫信息 */
  await cdp.send('Runtime.evaluate', {
    expression: `(() => { const el = document.querySelector('.h64d-pal'); el.scrollIntoView({block:'center'}); return true; })()`,
    returnByValue: true
  });
  await new Promise((r) => setTimeout(r, 500));
  await shot('learn-4-palace');

  /* 整页长图 */
  await cdp.send('Runtime.evaluate', {
    expression: `(() => { const el = document.querySelector('#hex64Detail'); el.scrollIntoView({block:'start'}); return true; })()`,
    returnByValue: true
  });
  await new Promise((r) => setTimeout(r, 400));
  await shot('learn-5-detail-full', true);

  cdp.close();
  server.kill();
  try { proc.kill(); } catch (e) { /* noop */ }
  process.exit(0);
})();