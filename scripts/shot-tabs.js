/**
 * 临时视觉验收脚本：截取音乐栏 / 学易栏 / 卦象详情
 * 用法：node scripts/shot-tabs.js
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
  const PORT = 8901;
  const srv = await serve(PORT);
  const userDir = path.join(require('os').tmpdir(), 'gx-shot-' + Date.now());
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=9225',
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
        http.get('http://127.0.0.1:9225/json/list', (r) => {
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

  const shot = async (name) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(s.data, 'base64'));
    console.log('[OK]', name);
  };

  // 起卦栏（含今日之卦）
  await shot('web-cast.png');

  // 音乐栏（先播放，截即兴连播状态）
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.tabbtn[data-page=music]').click()` });
  await new Promise((r) => setTimeout(r, 800));
  await shot('web-music.png');
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#btnPlay').click()` });
  await new Promise((r) => setTimeout(r, 4200));
  await shot('web-music-playing.png');
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#btnPlay').click()` });
  await new Promise((r) => setTimeout(r, 300));

  // 播放控制区（含新的暂停/继续按钮）单独截一张
  {
    const clip = (await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const card = document.querySelector('#playerCard');
        const r = card.getBoundingClientRect();
        window.scrollBy(0, r.top - 40);
        const r2 = card.getBoundingClientRect();
        return { x: r2.x - 6, y: r2.y + window.scrollY - 6, width: r2.width + 12, height: r2.height + 12, scale: 2 };
      })()`,
      returnByValue: true
    })).result.value;
    const sc = await cdp.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
    fs.writeFileSync(path.join(SHOTS, 'web-player-controls.png'), Buffer.from(sc.data, 'base64'));
    console.log('[OK] web-player-controls.png');
  }

  // 音层面板（疗愈九频 + 自然音层）
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#ambSolfChips .amb-chip[data-freq=\"528\"]').click(); document.querySelector('#ambNatureChips .amb-chip[data-nature=\"rain\"]').click(); document.querySelector('#ambNatureChips .amb-chip[data-nature=\"fire\"]').click();` });
  await new Promise((r) => setTimeout(r, 300));
  await shot('web-music-ambient.png');

  // 起卦栏：铜钱卦（掷三爻看看状态）
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.tabbtn[data-page=cast]').click()` });
  await new Promise((r) => setTimeout(r, 500));
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#castTabs .tab[data-mode=coin]').click()` });
  await new Promise((r) => setTimeout(r, 300));
  for (let i = 0; i < 3; i++) {
    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#btnCoinToss').click()` });
    await new Promise((r) => setTimeout(r, 800));
  }
  await new Promise((r) => setTimeout(r, 300));
  await shot('web-cast-coin.png');

  // 学易栏（默认折叠态）
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.tabbtn[data-page=learn]').click()` });
  await new Promise((r) => setTimeout(r, 600));
  await shot('web-learn-top.png');
  // 展开「易之生成」：看修正后的四象图
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.lsec[data-key=origin] .lsec-head').click()` });
  await new Promise((r) => setTimeout(r, 500));
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.taiji-fig').scrollIntoView({block:'center'})` });
  await new Promise((r) => setTimeout(r, 300));
  await shot('web-learn-taiji.png');
  // 上下卦找卦 + 卦详情
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.lsec[data-key=hexagrams] .lsec-head').click()` });
  await new Promise((r) => setTimeout(r, 400));
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#hexFindUpper').value='zhen'; document.querySelector('#hexFindLower').value='li'; document.querySelector('#hexFindBtn').click()` });
  await new Promise((r) => setTimeout(r, 700));
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#hex64Detail').scrollIntoView({block:'center'})` });
  await new Promise((r) => setTimeout(r, 300));
  await shot('web-learn-hex.png');

  cdp.close();
  cleanup();
  console.log('done');
  process.exit(0);
})();
