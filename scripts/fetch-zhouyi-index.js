/**
 * 从 ctext 周易目录页取出六十四卦的真实链接（六个拼音键被两卦共用，
 * 必须按页面上的卦符逐一取，不能靠拼音猜）
 * 输出：scripts/.cache/zhouyi-urls.json  [ { n, name, key, url } × 64 ]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const OUT = path.join(__dirname, '.cache', 'zhouyi-urls.json');

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
  const browser = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=9275', '--user-data-dir=' + path.join(require('os').tmpdir(), 'zc-' + Date.now()),
    'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { proc.kill(); } catch (e) { /* noop */ } });

  let target = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9275/json/list', (r2) => {
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

  await cdp.send('Page.navigate', { url: 'https://ctext.org/book-of-changes/zh' });
  await new Promise((r) => setTimeout(r, 3500));
  const r = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const out = [];
      document.querySelectorAll('a').forEach(a => {
        const t = (a.innerText || '').trim();
        const h = a.getAttribute('href') || '';
        if (/book-of-changes\\//.test(h) && /[\\u4e00-\\u9fa5]/.test(t)) {
          out.push({ text: t, href: h });
        }
      });
      return out;
    })()`,
    returnByValue: true
  });
  const list = (r.result && r.result.value) || [];
  console.log('links:', list.length);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(list, null, 1), 'utf8');
  console.log(JSON.stringify(list.slice(0, 8), null, 1));
  console.log('...');
  console.log(JSON.stringify(list.slice(-4), null, 1));
  cdp.close();
  process.exit(0);
})();