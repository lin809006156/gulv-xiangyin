/**
 * 抓取《周易》六十四卦原文（卦辞、六爻爻辞、象曰小象）
 * ---------------------------------------------------------------
 * 数据源：中国哲学书电子化计划（ctext.org）「周易·易經」各卦页，
 *          属公有领域古籍（先秦）。每卦一个页面，逐页取结构化文本。
 * 输出：scripts/.cache/zhouyi-raw.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const OUT = path.join(__dirname, '.cache', 'zhouyi-raw.json');

/* ctext 上 64 卦的拼音 key（与《周易》通行卦序一致） */
const KEYS = [
  'qian', 'kun', 'zhun', 'meng', 'xu', 'song', 'shi', 'bi',
  'xiao-xu', 'lu', 'tai', 'pi', 'tong-ren', 'da-you', 'qian', 'yu',
  'sui', 'gu', 'lin', 'guan', 'shi-he', 'bi', 'bo', 'fu',
  'wu-wang', 'da-xu', 'yi', 'da-guo', 'kan', 'li', 'xian', 'heng',
  'dun', 'da-zhuang', 'jin', 'ming-yi', 'jia-ren', 'kui', 'jian', 'jie',
  'sun', 'yi', 'guai', 'gou', 'cui', 'sheng', 'kun', 'jing',
  'ge', 'ding', 'zhen', 'gen', 'jian', 'gui-mei', 'feng', 'lv',
  'xun', 'dui', 'huan', 'jie', 'zhong-fu', 'xiao-guo', 'ji-ji', 'wei-ji'
];

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
  if (!fs.existsSync(browser)) { console.log('no browser'); process.exit(1); }
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=9265', '--user-data-dir=' + path.join(require('os').tmpdir(), 'zy-' + Date.now()),
    'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { proc.kill(); } catch (e) { /* noop */ } });

  let target = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9265/json/list', (r2) => {
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

  const out = {};
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i];
    const url = `https://ctext.org/book-of-changes/${key}/zh`;
    let ok = false;
    try {
      await cdp.send('Page.navigate', { url });
      await new Promise((r) => setTimeout(r, 2200));
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          // ctext 的经文正文在 .ctp 或 .doc 或 #content 里；取最大的文本块
          const cands = Array.from(document.querySelectorAll('.ctp, .doc, .content, div[id^=content]'));
          let best = '', bestLen = 0;
          cands.forEach(e => {
            const t = e.innerText || '';
            if (t.length > bestLen) { bestLen = t.length; best = t; }
          });
          if (!best) best = document.body ? document.body.innerText : '';
          return { title: document.title, text: best };
        })()`,
        returnByValue: true
      });
      const v = r.result && r.result.value;
      if (v && v.text && v.text.length > 120) {
        out[key] = { n: i + 1, title: v.title, text: v.text };
        ok = true;
      } else {
        console.log('[miss]', key, v ? v.text.length : 0);
      }
    } catch (e) {
      console.log('[err]', key, e.message);
    }
    if (ok) process.stdout.write('.');
    else process.stdout.write('x');
    if ((i + 1) % 8 === 0) console.log(' ' + (i + 1));
  }
  console.log('');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
  console.log('saved', Object.keys(out).length, '/', KEYS.length, '→', OUT);
  cdp.close();
  process.exit(0);
})();