/**
 * 补抓缺失的《周易》卦页（六个拼音键被两卦共用，故有 qian1 / bi1 … 形式的备用键）
 * ---------------------------------------------------------------
 * 增量写回 scripts/.cache/zhouyi-raw.json，不覆盖已有内容。
 * 用法：node scripts/fetch-zhouyi-fix.js [key ...]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const RAW = path.join(__dirname, '.cache', 'zhouyi-raw.json');
const URLS = path.join(__dirname, '.cache', 'zhouyi-urls.json');

const DEFAULT_KEYS = ['qian1', 'bi1', 'yi1', 'kun1', 'jian1', 'lu1', 'jie1', 'lv'];

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

const EXTRACT = `(() => {
  const cands = Array.from(document.querySelectorAll('.ctp, .doc, .content, div[id^=content]'));
  let best = '', bestLen = 0;
  cands.forEach(e => {
    const t = e.innerText || '';
    if (t.length > bestLen) { bestLen = t.length; best = t; }
  });
  if (!best) best = document.body ? document.body.innerText : '';
  return { title: document.title, text: best };
})()`;

(async function main() {
  const extra = process.argv.slice(2);
  const links = JSON.parse(fs.readFileSync(URLS, 'utf8'));
  const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));

  /* 目标：64 个卦页里 raw 缺失或标题不是「易經」的 */
  const hexKeys = [];
  const seen = new Set();
  links.forEach((l) => {
    if (!/[\u4DC0-\u4DFF]/.test((l.text || '').trim())) return;
    const k = l.href.replace(/^\//, '').split('/')[1];
    if (seen.has(k)) return;
    seen.add(k);
    hexKeys.push(k);
  });
  const targets = hexKeys.filter((k) => !raw[k] || !/易經/.test(raw[k].title || ''));
  if (extra.length) targets.push(...extra);

  if (!targets.length) { console.log('无缺失，', Object.keys(raw).length, '卦齐备'); process.exit(0); }
  console.log('待抓', targets.length, '页：', targets.join(' '));

  const browser = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!fs.existsSync(browser)) { console.log('no browser'); process.exit(1); }
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=9285', '--user-data-dir=' + path.join(require('os').tmpdir(), 'zyf-' + Date.now()),
    'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { proc.kill(); } catch (e) { /* noop */ } });

  let target = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9285/json/list', (r2) => {
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

  const got = [];
  for (let i = 0; i < targets.length; i++) {
    const key = targets[i];
    try {
      await cdp.send('Page.navigate', { url: `https://ctext.org/book-of-changes/${key}/zh` });
      await new Promise((r) => setTimeout(r, 2600));
      const r = await cdp.send('Runtime.evaluate', { expression: EXTRACT, returnByValue: true });
      const v = r.result && r.result.value;
      if (v && v.text && v.text.length > 120) {
        raw[key] = { n: 0, title: v.title, text: v.text };
        got.push(key);
        process.stdout.write('.');
      } else {
        console.log('\n[miss]', key, v ? v.text.length : 0);
        process.stdout.write('x');
      }
    } catch (e) {
      console.log('\n[err]', key, e.message);
      process.stdout.write('x');
    }
  }
  console.log('');
  fs.writeFileSync(RAW, JSON.stringify(raw, null, 1), 'utf8');
  console.log('抓到', got.length, '页；raw 现有', Object.keys(raw).length, '页 →', RAW);
  cdp.close();
  process.exit(0);
})();