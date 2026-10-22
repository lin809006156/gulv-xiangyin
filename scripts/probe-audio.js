/**
 * 临时验收：APP 内叠加音层是否真的听得见变化
 * ① 浏览器里挂钩 AudioContext，量测 app 自己的分析器时域 RMS：
 *    关闭音层 vs 开启音层，验证「开了就听得见」
 * ② Node 里用假 Web Audio 上下文检查音层总线增益节点
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
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

/* 在页面脚本执行前挂钩音频上下文 */
const HOOK = `
(() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { window.__hooked = false; return; }
  window.__ctxs = [];
  const origAnalyser = AC.prototype.createAnalyser;
  AC.prototype.createAnalyser = function () {
    const node = origAnalyser.call(this);
    window.__ctxs.push({ ctx: this, analyser: node });
    return node;
  };
  window.__hooked = true;
})();
`;

(async function main() {
  const browser = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!fs.existsSync(browser)) { console.log('no browser'); process.exit(0); }
  const PORT = 8921;
  const srv = await serve(PORT);
  const userDir = path.join(require('os').tmpdir(), 'gx-aud-' + Date.now());
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=9245',
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
        http.get('http://127.0.0.1:9245/json/list', (res2) => {
          let d = '';
          res2.on('data', (chunk) => { d += chunk; });
          res2.on('end', () => resolve(JSON.parse(d)));
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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await new Promise((r) => setTimeout(r, 3000));

  const r = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      document.querySelector('.tabbtn[data-page=music]').click();
      await sleep(600);

      const setLayers = (on) => {
        document.querySelector('#ambSolfChips .amb-chip[data-freq="528"]').click();
        ['rain','birds','fire','wind','stream'].forEach(k => {
          const c = document.querySelector('#ambNatureChips .amb-chip[data-nature="'+k+'"]');
          if (c && c.classList.contains('is-on') !== on) c.click();
        });
      };
      const clickNature = (k, want) => {
        const c = document.querySelector('#ambNatureChips .amb-chip[data-nature="'+k+'"]');
        if (c && c.classList.contains('is-on') !== want) c.click();
      };

      // 关掉全部音层后播放（AudioContext 在播放时才懒建，故先点播放）
      const clr = document.querySelector('#ambSolfClear');
      if (clr) clr.click();
      await sleep(300);
      setLayers(false);
      await sleep(500);
      document.querySelector('#btnPlay').click();
      await sleep(4500);

      const an = window.__ctxs && window.__ctxs[window.__ctxs.length - 1];
      if (!an) return { error: 'no analyser hook', hooked: !!window.__hooked, count: (window.__ctxs || []).length };
      const probe = async (ms) => {
        const buf = new Float32Array(an.analyser.fftSize);
        let s = 0, n = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          an.analyser.getFloatTimeDomainData(buf);
          for (let i = 0; i < buf.length; i++) { s += buf[i] * buf[i]; n++; }
          await sleep(50);
        }
        return n ? Math.sqrt(s / n) : 0;
      };

      const off = await probe(1400);
      // 打开全部音层（应立即生效，不需等下一段）
      setLayers(true);
      await sleep(700);
      const on = await probe(1400);
      // 只开雨声
      setLayers(false);
      await sleep(500);
      clickNature('rain', true);
      await sleep(700);
      const rain = await probe(1200);

      document.querySelector('#btnPlay').click();
      return {
        off: +off.toFixed(5),
        on: +on.toFixed(5),
        rain: +rain.toFixed(5),
        gainAll: +(on / Math.max(1e-6, off)).toFixed(3),
        gainRain: +(rain / Math.max(1e-6, off)).toFixed(3)
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log(JSON.stringify(r.result && r.result.value, null, 2));

  cdp.close();
  cleanup();
  process.exit(0);
})();