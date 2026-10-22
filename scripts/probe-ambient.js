/**
 * 实时音层总线探针（真实浏览器）
 * ---------------------------------------------------------------
 * 验证：播放即兴连播时，切换音层是否真的让声音发生变化。
 * 做法：给 player._ambBus 单独挂一个 AnalyserNode，
 *      分别量测「音层全关 / 开雨声 / 再开 528Hz」时该总线的 RMS。
 *      总线只承载音层，与五声旋律无关，故 RMS 变化即音层真实发声的证据。
 *
 * 用法：node scripts/probe-ambient.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  [OK] ${m}`); };
const err = (m) => { fail++; console.log(`  [!!] ${m}`); };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wav': 'audio/wav'
};

function serve(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const full = path.join(WEB, p);
      if (!full.startsWith(WEB) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(full);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(full).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

function findBrowser() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', () => reject(new Error('WebSocket 错误')));
    });
    this.ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (e2) { return; }
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
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP 超时: ' + method));
        }
      }, 90000);
    });
  }
  close() { try { this.ws.close(); } catch (e) { /* noop */ } }
}

(async function main() {
  console.log('=== 实时音层总线探针（真实浏览器） ===\n');

  const browser = findBrowser();
  if (!browser) { console.log('  [跳过] 未找到 Edge/Chrome'); process.exit(0); }

  const PORT = 8901;
  const srv = await serve(PORT);
  const userDir = path.join(require('os').tmpdir(), 'gx-amb-' + Date.now());
  const proc = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=9224',
    `--user-data-dir=${userDir}`,
    'about:blank'
  ], { stdio: 'ignore' });

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
        http.get('http://127.0.0.1:9224/json/list', (r) => {
          let d = ''; r.on('data', (c) => d += c); r.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      target = res.find((t) => t.type === 'page');
      if (target) break;
    } catch (e) { /* 继续等 */ }
  }
  if (!target) { err('无法连接浏览器'); cleanup(); process.exit(1); }

  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await new Promise((r) => setTimeout(r, 3500));

  /* ---- 1. 开始即兴连播 ---- */
  console.log('\n【1】即兴连播');
  const play = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const btn = document.querySelector('#btnPlay');
      btn.click();
      await new Promise(r => setTimeout(r, 2500));
      const p = window.__gxPlayer;
      return {
        hasPlayer: !!p,
        gen: !!(p && p._gen),
        ctxState: p && p._ctx ? p._ctx.state : 'none',
        ambBus: !!(p && p._ambBus),
        rounds: p && p._gen ? p._gen.rounds.length : 0
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const pv = play.result.value;
  pv.hasPlayer && pv.gen ? ok(`即兴连播已开始（ctx=${pv.ctxState}，已排 ${pv.rounds} 轮）`)
    : err(`播放未开始：${JSON.stringify(pv)}`);
  pv.ambBus ? ok('音层总线已建立') : err('音层总线未建立');

  /* ---- 2. 挂探针：量测 ambBus 的 RMS ---- */
  const measure = async (label) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `(async () => {
        const p = window.__gxPlayer;
        if (!p || !p._ambBus) return { error: 'no bus' };
        const ctx = p._ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 2048;
        p._ambBus.connect(an);
        const buf = new Float32Array(an.fftSize);
        // 采样 1.4 秒：peak 抓瞬峰，tail 取最后 0.5 秒的均值（避开 0.3s 淡入淡出）
        let peak = 0, sum = 0, n = 0, tailSum = 0, tailN = 0;
        const t0 = performance.now();
        const TAIL_FROM = 900;
        while (performance.now() - t0 < 1400) {
          await new Promise(r => setTimeout(r, 50));
          an.getFloatTimeDomainData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          const rms = Math.sqrt(s / buf.length);
          if (rms > peak) peak = rms;
          sum += rms; n++;
          if (performance.now() - t0 >= TAIL_FROM) { tailSum += rms; tailN++; }
        }
        try { p._ambBus.disconnect(an); } catch (e) { /* noop */ }
        const gn = p._ambNodes ? {
          sol: +p._ambNodes.solGain.gain.value.toFixed(4),
          rain: +p._ambNodes.nature.rain.gain.gain.value.toFixed(4),
          birds: +p._ambNodes.nature.birds.gain.gain.value.toFixed(4),
          fire: +p._ambNodes.nature.fire.gain.gain.value.toFixed(4),
          wind: +p._ambNodes.nature.wind.gain.gain.value.toFixed(4),
          stream: +p._ambNodes.nature.stream.gain.gain.value.toFixed(4),
          rainVca: +p._ambNodes.nature.rain.vca.gain.value.toFixed(3)
        } : null;
        return {
          label: ${JSON.stringify(label)},
          peak: +peak.toFixed(5),
          avg: +(sum / Math.max(1, n)).toFixed(5),
          tail: +(tailSum / Math.max(1, tailN)).toFixed(5),
          state: p.ambientState,
          genAmb: p._gen ? {
            level: p._gen.ambient ? p._gen.ambient.level : 'null',
            sol: p._gen.ambient && p._gen.ambient.solfeggio ? p._gen.ambient.solfeggio.freq : 0,
            nature: p._gen.ambient ? Object.keys(p._gen.ambient.nature || {}).filter((k) => p._gen.ambient.nature[k]) : []
          } : null,
          gains: gn
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    return r.result.value;
  };

  console.log('\n【2】先把默认开着的疗愈频率关掉，建立全关基线');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      // 点当前高亮的那颗疗愈频率芯片 = 关闭（再点一次即取消）
      const chip = document.querySelector('#ambSolfChips .amb-chip.is-on');
      if (chip) chip.click();
      return chip ? chip.dataset.freq : 'none';
    })()`,
    returnByValue: true
  });
  const off = await measure('off');
  console.log(`    RMS peak=${off.peak} tail=${off.tail}  gains=${JSON.stringify(off.gains)}`);
  off.tail < 0.002 ? ok('音层全关时总线静音（tail RMS≈0）') : err(`音层全关却有输出：${off.tail}`);

  console.log('\n【3】开启「雨声」后的总线输出');
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('#ambNatureChips .amb-chip[data-nature="rain"]').click()`,
    returnByValue: true
  });
  const rain = await measure('rain');
  console.log(`    RMS peak=${rain.peak} tail=${rain.tail}  gains=${JSON.stringify(rain.gains)}  nature=${JSON.stringify(rain.state.nature)}`);
  rain.tail > off.tail + 0.02
    ? ok(`雨声实时进入总线（tail RMS ${off.tail} → ${rain.tail}）`)
    : err(`雨声未实时生效（${off.tail} → ${rain.tail}）`);

  console.log('\n【4】切到 528Hz 疗愈频率（频率切换应即时生效）');
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('#ambSolfChips .amb-chip[data-freq="528"]').click()`,
    returnByValue: true
  });
  const sol = await measure('sol');
  console.log(`    RMS peak=${sol.peak} tail=${sol.tail}  solf=${sol.state.solfeggio}`);
  sol.state.solfeggio === 528
    ? ok('528Hz 频率切换即时生效')
    : err(`528Hz 未生效（freq=${sol.state.solfeggio}）`);

  console.log('\n【5】切换频率到 396Hz（应即时改变）');
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('#ambSolfChips .amb-chip[data-freq="396"]').click()`,
    returnByValue: true
  });
  const sol2 = await measure('sol2');
  sol2.state.solfeggio === 396
    ? ok(`频率切换即时生效（528Hz → 396Hz）`)
    : err(`频率未切换：${sol2.state.solfeggio}`);

  console.log('\n【6】音层总量滑杆降到 0（淡出后应静音）');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const lv = document.querySelector('#ambLevel');
      lv.value = '0';
      lv.dispatchEvent(new Event('input'));
    })()`,
    returnByValue: true
  });
  const zero = await measure('zero');
  console.log(`    RMS peak=${zero.peak} tail=${zero.tail} gains=${JSON.stringify(zero.gains)} genAmb=${JSON.stringify(zero.genAmb)}`);
  zero.tail < 0.002
    ? ok('总量归零、淡出结束后总线静音')
    : err(`总量归零仍有输出：${zero.tail}`);

  console.log('\n【7】恢复总量到 100%（应恢复）');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const lv = document.querySelector('#ambLevel');
      lv.value = '100';
      lv.dispatchEvent(new Event('input'));
    })()`,
    returnByValue: true
  });
  const back = await measure('back');
  back.tail > 0.02
    ? ok(`总量恢复后音层回来（tail RMS ${back.tail}）`)
    : err(`总量恢复后仍静音：${back.tail}`);

  console.log('\n【8】关闭雨声（应只剩疗愈频率，RMS 明显下降）');
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('#ambNatureChips .amb-chip[data-nature="rain"]').click()`,
    returnByValue: true
  });
  const noRain = await measure('noRain');
  noRain.state.nature.length === 0 && noRain.tail < back.tail * 0.7 && noRain.tail > 0.003
    ? ok(`关闭雨声后仅剩疗愈层（tail RMS ${back.tail} → ${noRain.tail}）`)
    : err(`关闭雨声异常：nature=${JSON.stringify(noRain.state.nature)} tail=${noRain.tail}`);

  console.log('\n【9】主音量滑杆（应真实改变总输出音量）');
  const outRms = async () => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `(async () => {
        const p = window.__gxPlayer;
        const an = p._analyser;                 // 压缩器之后：总输出的汇点
        const buf = new Float32Array(an.fftSize);
        let sum = 0, n = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < 900) {
          await new Promise(r => setTimeout(r, 40));
          an.getFloatTimeDomainData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          sum += Math.sqrt(s / buf.length); n++;
        }
        return {
          rms: +((sum / Math.max(1, n))).toFixed(5),
          master: +p._master.gain.value.toFixed(3)
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    return r.result.value;
  };
  await cdp.send('Runtime.evaluate', {
    expression: `(() => { const v = document.querySelector('#volume'); v.value = '100'; v.dispatchEvent(new Event('input')); })()`,
    returnByValue: true
  });
  const loud = await outRms();
  await cdp.send('Runtime.evaluate', {
    expression: `(() => { const v = document.querySelector('#volume'); v.value = '20'; v.dispatchEvent(new Event('input')); })()`,
    returnByValue: true
  });
  const quiet = await outRms();
  console.log(`    主增益：${loud.master} → ${quiet.master}；总输出 RMS：${loud.rms} → ${quiet.rms}`);
  // 主增益节点是主音量通道的落点：它变了，才说明滑杆真正接到了声音上
  (Math.abs(loud.master - 1) < 0.02 && Math.abs(quiet.master - 0.2) < 0.02)
    ? ok(`主音量滑杆真实作用于声音通道（增益 ${loud.master} → ${quiet.master}）`)
    : err(`主音量滑杆无效（增益 ${loud.master} → ${quiet.master}）`);
  quiet.rms < loud.rms * 0.85
    ? ok(`总输出随之下降（RMS ${loud.rms} → ${quiet.rms}）`)
    : err(`总输出未随主音量下降（RMS ${loud.rms} → ${quiet.rms}）`);

  cdp.close();
  cleanup();

  console.log(`\n=== 探针完成：通过 ${pass} 项，失败 ${fail} 项 ===`);
  process.exit(fail ? 1 : 0);
})();
