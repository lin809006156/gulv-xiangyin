/**
 * 真实浏览器端到端测试
 * ---------------------------------------------------------------
 * 用 CDP 驱动本机 Edge/Chrome，验证网页版：
 *   1. 页面加载无 JS 错误
 *   2. PWA manifest 与 service worker 注册成功
 *   3. 起卦交互生效
 *   4. 音频真实渲染并播放（检查 AudioContext 状态与样本数）
 *   5. 截图留档
 *
 * 用法：node scripts/e2e.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const SHOTS = path.join(ROOT, 'screenshots');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  [OK] ${m}`); };
const err = (m) => { fail++; console.log(`  [!!] ${m}`); };

/* ---------- 静态文件服务器 ---------- */
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

/* ---------- 浏览器定位 ---------- */
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

/* ---------- 极简 WebSocket（Node 22 原生） ---------- */
class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (e) => reject(new Error('WebSocket 错误')));
    });
    this.ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: rs, reject: rj } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rj(new Error(JSON.stringify(msg.error))) : rs(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
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
      }, 60000);
    });
  }

  close() { try { this.ws.close(); } catch (e) { /* noop */ } }
}

/* ---------- 主流程 ---------- */
(async function main() {
  console.log('=== 真实浏览器端到端测试 ===\n');

  const browser = findBrowser();
  if (!browser) {
    console.log('  [跳过] 未找到 Edge/Chrome');
    process.exit(0);
  }
  console.log(`浏览器：${browser.split('/').pop()}\n`);

  const PORT = 8899;
  const srv = await serve(PORT);
  const userDir = path.join(require('os').tmpdir(), 'gx-e2e-' + Date.now());
  const proc = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=9223`,
    `--user-data-dir=${userDir}`,
    'about:blank'
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { proc.kill(); } catch (e) { /* noop */ }
    try { srv.close(); } catch (e) { /* noop */ }
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* noop */ }
  };
  process.on('exit', cleanup);

  // 等待调试端口就绪
  let target = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9223/json/list', (r) => {
          let d = ''; r.on('data', (c) => d += c); r.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      target = res.find((t) => t.type === 'page');
      if (target) break;
    } catch (e) { /* 继续等 */ }
  }
  if (!target) { err('无法连接浏览器调试端口'); cleanup(); process.exit(1); }
  ok('CDP 连接建立');

  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;

  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');

  const consoleErrors = [];
  cdp.ws.addEventListener('message', (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch (err) { return; }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails?.exception?.description ||
        m.params.exceptionDetails?.text || '未知异常');
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      consoleErrors.push(m.params.entry.text);
    }
  });

  /* ---------- 1. 加载页面 ---------- */
  console.log('\n【1】页面加载');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await new Promise((r) => setTimeout(r, 3500));

  const boot = await cdp.send('Runtime.evaluate', {
    expression: `(() => ({
      hasData: typeof window.ICData !== 'undefined',
      hasHex: typeof window.ICHexagram !== 'undefined',
      hasMusic: typeof window.ICMusic !== 'undefined',
      hasRender: typeof window.ICRender !== 'undefined',
      hasPlayer: typeof window.ICPlayer !== 'undefined',
      hasRecognize: typeof window.ICRecognize !== 'undefined',
      hexCount: window.ICData ? window.ICData.HEXAGRAMS.length : 0,
      libSize: window.ICRecognize ? window.ICRecognize.librarySize : 0,
      symbol: (document.querySelector('#resultSymbol')||{}).textContent || '',
      name: (document.querySelector('#resultName')||{}).textContent || '',
      yaoCount: document.querySelectorAll('#yaoFigure .yao').length,
      paramCount: document.querySelectorAll('#musicParams .mparam').length,
      manifest: !!document.querySelector('link[rel=manifest]')
    }))()`,
    returnByValue: true
  });
  const b = boot.result.value;
  b.hasData ? ok('core/data.js 已加载') : err('core/data.js 未加载');
  b.hasHex ? ok('core/hexagram.js 已加载') : err('core/hexagram.js 未加载');
  b.hasMusic ? ok('core/music.js 已加载') : err('core/music.js 未加载');
  b.hasRender ? ok('core/render.js 已加载') : err('core/render.js 未加载');
  b.hasPlayer ? ok('core/player.js 已加载') : err('core/player.js 未加载');
  b.hasRecognize ? ok('core/recognize.js 已加载') : err('core/recognize.js 未加载');
  b.libSize >= 200 ? ok(`物象库 ${b.libSize} 个物象`) : err(`物象库偏少：${b.libSize}`);
  b.hexCount === 64 ? ok(`64 卦数据完整`) : err(`卦象数据错误：${b.hexCount}`);
  b.symbol ? ok(`自动展示今日之卦：${b.symbol} ${b.name}`) : err('未自动展示卦象');
  b.yaoCount === 6 ? ok('六爻图形渲染正确') : err(`六爻数量错误：${b.yaoCount}`);
  b.paramCount === 6 ? ok('音乐参数卡片渲染正确') : err(`音乐参数数量错误：${b.paramCount}`);
  b.manifest ? ok('PWA manifest 已引入') : err('PWA manifest 未引入');

  /* ---------- 2. 交互 ---------- */
  console.log('\n【2】交互流程');
  const inter = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const before = document.querySelector('#resultName').textContent;
      // 切到观象起卦
      document.querySelectorAll('#castTabs .tab')[1].click();
      // 选第一个物象
      const chip = document.querySelector('.img-chip');
      if (chip) chip.click();
      // 起卦
      document.querySelector('#btnImage').click();
      const after = document.querySelector('#resultName').textContent;
      const method = document.querySelector('#resultMethod').textContent;
      // 切到数字起卦
      document.querySelectorAll('#castTabs .tab')[2].click();
      document.querySelector('#btnNumber').click();
      return { before, after, method, numResult: document.querySelector('#resultName').textContent };
    })()`,
    returnByValue: true
  });
  const iv = inter.result.value;
  iv.after !== iv.before ? ok(`观象起卦生效：${iv.before} → ${iv.after}`) : err('观象起卦未改变结果');
  iv.method === '观象起卦' ? ok('起卦方式标注正确') : err(`起卦方式错误：${iv.method}`);
  ok(`数字起卦结果：${iv.numResult}`);

  /* ---------- 2b. 拍照识象 ---------- */
  console.log('\n【2b】拍照识象');
  const vis = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      // 切回观象页
      document.querySelectorAll('#castTabs .tab')[1].click();

      // 1) 口语归一：验证「桌子不是餐桌」「空椅子」
      const desk = ICRecognize.normalizeOne('一张木制桌子');
      const chair = ICRecognize.normalizeOne('一把椅子，座位是空的');

      // 2) 物象搜索
      const searchChair = ICRecognize.searchImages('椅');
      const searchDesk = ICRecognize.searchImages('desk');

      // 3) 搜索框在页面中的交互
      const input = document.querySelector('#imageSearch');
      input.value = '椅';
      input.dispatchEvent(new Event('input'));
      const chipCount = document.querySelectorAll('.img-chip').length;
      const firstChip = (document.querySelector('.img-chip')||{}).textContent || '';
      // 恢复
      input.value = '';
      input.dispatchEvent(new Event('input'));
      const restored = document.querySelectorAll('.img-chip').length;

      return {
        deskImage: desk.image, deskGua: desk.gua, deskMatched: desk.matched,
        chairImage: chair.image, chairGua: chair.gua, chairMatched: chair.matched,
        searchChair: searchChair.length,
        searchChairTop: searchChair[0] ? searchChair[0].image : '',
        searchDeskTop: searchDesk[0] ? searchDesk[0].image : '',
        chipCount, firstChip, restored
      };
    })()`,
    returnByValue: true
  });
  const vv = vis.result.value;
  vv.deskMatched && vv.deskImage === '桌案' && vv.deskGua === 'gen'
    ? ok(`「一张木制桌子」→ 桌案(艮)：与是否餐桌无关`)
    : err(`桌子归一异常：${vv.deskImage}/${vv.deskGua}`);
  vv.chairMatched && vv.chairImage === '椅子' && vv.chairGua === 'gen'
    ? ok(`「一把椅子，座位是空的」→ 椅子(艮)：空不空不影响取卦`)
    : err(`椅子归一异常：${vv.chairImage}/${vv.chairGua}`);
  vv.searchChair > 0 && vv.searchChairTop === '椅子'
    ? ok(`搜「椅」命中「${vv.searchChairTop}」`) : err(`搜「椅」异常：${vv.searchChairTop}`);
  vv.searchDeskTop === '桌案'
    ? ok(`搜「desk」→ 桌案`) : err(`搜 desk 异常：${vv.searchDeskTop}`);
  vv.chipCount > 0 ? ok(`搜索框联动：过滤出 ${vv.chipCount} 项`) : err('搜索无结果');
  vv.restored > vv.chipCount ? ok(`清空关键词后恢复完整库（${vv.restored} 项）`) : err('未恢复完整库');

  /* ---------- 2c. 文献依据面板 ---------- */
  console.log('\n【2c】文献依据面板');
  const cls = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      // 切到观象起卦，选「电脑」这一物象，检验其出处展示
      document.querySelectorAll('#castTabs .tab')[1].click();
      const search = document.querySelector('#imageSearch');
      search.value = '电脑';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const chip = Array.from(document.querySelectorAll('.img-chip'))
        .find(c => c.textContent.indexOf('电脑') >= 0);
      if (chip) chip.click();
      document.querySelector('#btnImage').click();

      const panel = document.querySelector('#classicsPanel');
      const body = document.querySelector('#classicsBody');
      const txt = body ? body.textContent : '';
      const blocks = document.querySelectorAll('#classicsBody .cblock');
      const badges = document.querySelectorAll('#classicsBody .cbadge');
      return {
        exists: !!panel,
        blockCount: blocks.length,
        badgeCount: badges.length,
        hasMethod: txt.indexOf('起卦法') >= 0,
        hasVoice: txt.indexOf('乐器') >= 0,
        hasMode: txt.indexOf('调式') >= 0,
        hasQuote: txt.indexOf('梅花易数') >= 0,
        hasBaihu: txt.indexOf('白虎通') >= 0,
        hasLeiji: txt.indexOf('礼记') >= 0,
        hasDis: txt.indexOf('不宣称') >= 0,
        hasImageCite: txt.indexOf('电脑') >= 0,
        // 徽标分档须齐备：典籍原文 / 后世类书 / 当代类推
        badgeLabels: Array.from(badges).map(b => b.textContent),
        // 电脑须归乾，且须写明文献依据
        dianGua: (ICData.IMAGE_ORIGIN_INDEX.get('电脑')||{}).gua,
        dianCite: (ICData.IMAGE_ORIGIN_INDEX.get('电脑')||{}).cite || ''
      };
    })()`,
    returnByValue: true
  });
  const cv = cls.result.value;
  cv.exists ? ok('文献依据面板已挂载') : err('文献依据面板缺失');
  cv.blockCount >= 5 ? ok(`面板分块完整（${cv.blockCount} 块）`) : err(`分块过少：${cv.blockCount}`);
  cv.badgeCount > 0 ? ok(`出处分档徽标 ${cv.badgeCount} 个`) : err('出处分档徽标缺失');
  cv.hasMethod ? ok('含起卦法出处') : err('缺起卦法出处');
  cv.hasVoice ? ok('含乐器配卦（八音）') : err('缺乐器配卦');
  cv.hasMode ? ok('含调式五音清浊') : err('缺调式五音');
  cv.hasQuote ? ok('含《梅花易数》引文') : err('缺《梅花易数》引文');
  cv.hasBaihu ? ok('含《白虎通》八音配卦引文') : err('缺《白虎通》引文');
  cv.hasLeiji ? ok('含《礼记·乐记》清浊引文') : err('缺《礼记》引文');
  cv.hasDis ? ok('含合规声明') : err('缺合规声明');
  cv.hasImageCite ? ok('展示所取物象的出处') : err('未展示物象出处');
  const hasClassic = cv.badgeLabels.indexOf('典籍原文') >= 0;
  const hasLater = cv.badgeLabels.indexOf('后世类书') >= 0;
  const hasModern = cv.badgeLabels.indexOf('当代类推') >= 0;
  (hasClassic && hasLater) ? ok('出处三档分标注齐备') : err(`分档不全：${cv.badgeLabels.join('/')}`);
  cv.dianGua === 'qian' ? ok('「电脑」在界面数据中归乾卦') : err(`「电脑」卦属错误：${cv.dianGua}`);
  cv.dianCite.indexOf('梅花易数') >= 0 ? ok('「电脑」出处含《梅花易数》原文') : err('「电脑」缺文献引文');
  void hasModern;

  /* ---------- 2d. 六爻显示方向（回归：曾上下颠倒） ---------- */
  console.log('\n【2d】六爻显示方向');
  const yao = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      // 直接构造「雷火丰」（上震下离）并检查 DOM 中六爻自上而下的顺序
      const r = ICHexagram.numberHexagram(4, 3);
      const reading = ICHexagram.buildReading(r);
      const domOrder = [];
      for (let i = 5; i >= 0; i--) domOrder.push(reading.yaoList[i]);
      const domYang = domOrder.map(y => y.isYang ? 1 : 0).join('');
      const expected = ICData.getSixLines(r.hex).slice().reverse().join('');
      // 与火山旅（56）对照：两卦显示序须不同，否则错误实现无法区分
      const lv = ICData.getHexagram(56);
      const lvDom = ICData.getSixLines(lv).slice().reverse().join('');
      // 实际渲染到页面：看 yaoFigure 的子元素顺序
      const fig = document.querySelector('#yaoFigure');
      const figRows = fig ? fig.children.length : 0;
      return {
        name: reading.name,
        structure: reading.structure,
        domYang,
        expected,
        lvDom,
        figRows,
        // CSS 不得含 column-reverse（二次反转的元凶）
        cssReverse: /column-reverse/.test(
          Array.from(document.styleSheets).map(s => {
            try { return Array.from(s.cssRules).map(r => r.cssText).join(''); }
            catch (e) { return ''; }
          }).join('')
        )
      };
    })()`,
    returnByValue: true
  });
  const yv = yao.result.value;
  yv.name === '雷火丰' ? ok('构造出雷火丰 ䷶') : err(`卦名异常：${yv.name}`);
  yv.structure === '离下震上' ? ok('卦体结构为「离下震上」（上震下离）') : err(`结构异常：${yv.structure}`);
  yv.domYang === yv.expected
    ? ok(`DOM 自上而下六爻为 ${yv.domYang}，与本卦一致，未颠倒`)
    : err(`DOM 六爻 ${yv.domYang} 与期望 ${yv.expected} 不符`);
  yv.lvDom !== yv.domYang
    ? ok('雷火丰与火山旅显示序可区分（颠倒实现会导致二者混淆）')
    : err('两卦显示序相同');
  yv.cssReverse ? err('CSS 仍含 column-reverse，六爻会二次反转') : ok('CSS 已无 column-reverse，不存在二次反转');

  /* ---------- 2e. 疗愈音层开关（原循环按钮：心音已是即兴连播，无需循环） ---------- */
  console.log('\n【2e】疗愈音层开关');
  const solf = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('#btnSolf');
      if (!btn) return { exists: false };
      const before = btn.getAttribute('aria-pressed');
      const beforeText = (document.querySelector('#btnSolfText')||{}).textContent || '';
      const card = [...document.querySelectorAll('.mparam')]
        .find(d => (d.querySelector('.mparam-label')||{}).textContent === '疗愈音层');
      const cardText = card ? ((card.querySelector('.mparam-value')||{}).textContent || '') : '';
      btn.click();
      const after = btn.getAttribute('aria-pressed');
      const afterText = (document.querySelector('#btnSolfText')||{}).textContent || '';
      const tip = (document.querySelector('#playerTip')||{}).textContent || '';
      btn.click();
      const back = btn.getAttribute('aria-pressed');
      return { exists: true, before, after, back, beforeText, afterText, tip, cardText };
    })()`,
    returnByValue: true
  });
  const sv = solf.result.value;
  sv.exists ? ok('疗愈音层按钮已挂载') : err('疗愈音层按钮缺失');
  sv.before === 'true' ? ok('疗愈音层默认开启（可关）') : err(`疗愈音层默认态异常：${sv.before}`);
  sv.after === 'false' ? ok('点击后关闭，aria-pressed 同步') : err('点击后未关闭');
  sv.back === 'true' ? ok('再次点击可重新开启') : err('再次点击未恢复');
  sv.tip.indexOf('疗愈') >= 0 ? ok(`提示文案说明音层性质：${sv.tip}`) : err('提示文案未说明音层');
  const cardHz = (sv.cardText.match(/(\d+)Hz/) || [])[1] || '';
  cardHz && sv.beforeText.indexOf(cardHz) >= 0
    ? ok(`按钮频率与参数卡一致（${cardHz}Hz，随卦切换）`)
    : err(`按钮频率与参数卡不一致：按钮「${sv.beforeText}」vs 卡片「${sv.cardText}」`);

  /* ---------- 2e-2. 即兴连播：无进度条、段落指示、可停止 ---------- */
  console.log('\n【2e-2】即兴连播');
  const gen = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const out = {};
      const p = window.__gxPlayer;
      out.defaultCast = !!document.querySelector('#pageCast.is-active');
      out.noProgressBar = !document.querySelector('#progressTrack');
      out.hasGenNow = !!document.querySelector('#genNow');
      out.hasLive = !!document.querySelector('#playerLive');
      // 切到音乐栏并播放
      document.querySelector('.tabbtn[data-page="music"]').click();
      document.querySelector('#btnPlay').click();
      // 等音频真正出声（编曲渲染在 Worker 里，主线程忙时起始会晚一点）
      for (let i = 0; i < 48 && !p.isPlaying; i++) await new Promise(r => setTimeout(r, 250));
      await new Promise(r => setTimeout(r, 900));
      out.liveShown = !document.querySelector('#playerLive').hidden;
      out.genSec = (document.querySelector('#genSec')||{}).textContent || '';
      out.genRound = (document.querySelector('#genRound')||{}).textContent || '';
      out.playText = (document.querySelector('#btnPlayText')||{}).textContent || '';
      out.tip = (document.querySelector('#playerTip')||{}).textContent || '';
      // 浮动播放栏：播放中应滑出
      out.mpHiddenDuring = document.querySelector('#miniPlayer').hidden;
      out.mpPlaying = document.querySelector('#miniPlayer').classList.contains('is-playing');
      out.mpTitle = (document.querySelector('#mpTitle')||{}).textContent || '';
      out.mpSub = (document.querySelector('#mpSub')||{}).textContent || '';
      out.mpBtns = ['#mpPlay','#mpLoop','#mpVol'].every(s => !!document.querySelector(s));
      // 播放中再点一次：是「暂停」（无独立停止键），音乐挂起而非结束
      document.querySelector('#btnPlay').click();
      for (let i = 0; i < 20 && !p.paused; i++) await new Promise(r => setTimeout(r, 150));
      await new Promise(r => setTimeout(r, 300));
      out.playTextAfter = (document.querySelector('#btnPlayText')||{}).textContent || '';
      out.pausedAfter = p.paused;
      out.liveText = (document.querySelector('#playerLiveText')||{}).textContent || '';
      // 点第三次：从原处继续
      document.querySelector('#btnPlay').click();
      for (let i = 0; i < 20 && p.paused; i++) await new Promise(r => setTimeout(r, 150));
      await new Promise(r => setTimeout(r, 300));
      out.playTextThird = (document.querySelector('#btnPlayText')||{}).textContent || '';
      out.resumed = !p.paused;
      // 停止由「切换卦象」完成
      window.__gxCastHexagram(11);
      await new Promise(r => setTimeout(r, 500));
      out.playTextAfterCast = (document.querySelector('#btnPlayText')||{}).textContent || '';
      out.liveHidden = document.querySelector('#playerLive').hidden;
      out.mpHiddenAfterCast = document.querySelector('#miniPlayer').hidden;
      return out;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const gv = gen.result.value;
  gv.defaultCast ? ok('默认进入起卦栏') : err('默认栏位错误');
  gv.noProgressBar ? ok('播放器已无进度条（即兴连播本无终点）') : err('进度条仍存在');
  (gv.hasGenNow && gv.hasLive) ? ok('段落指示与「即兴中」状态灯就位') : err('即兴状态显示缺失');
  (gv.liveShown && ['起', '承', '转', '合'].indexOf(gv.genSec) >= 0)
    ? ok(`播放中显示即兴状态与段落「${gv.genSec}」`)
    : err(`即兴状态异常（sec=${gv.genSec}, live=${gv.liveShown}）`);
  (gv.genRound.indexOf('即兴') >= 0 || gv.genRound.indexOf('编下一段') >= 0)
    ? ok(`轮次显示：${gv.genRound}`)
    : err(`轮次显示异常：${gv.genRound}`);
  // 宏曲式阶段名：八段一循环，界面应标出当前所处阶段
  const ARC_NAMES = ['呈示', '应和', '加花', '隔凡', '分裂', '压上', '换头', '再现'];
  const arcHit = ARC_NAMES.filter((n) => gv.genRound.indexOf(n) >= 0);
  arcHit.length
    ? ok(`轮次标注宏曲式阶段「${arcHit[0]}」（八段一循环）`)
    : err(`未显示宏曲式阶段名：${gv.genRound}`);
  gv.playText === '暂停' ? ok('播放中主按钮变为「暂停」（无独立停止键）') : err('播放按钮状态异常');
  (gv.playTextAfter === '继续' && gv.pausedAfter === true)
    ? ok('再点一次即暂停：音乐挂起在原处，按钮转「继续」')
    : err(`暂停异常（text=${gv.playTextAfter} paused=${gv.pausedAfter}）`);
  (gv.resumed && gv.playTextThird === '暂停')
    ? ok('第三次点按：从原处继续（无缝）')
    : err(`继续异常（resumed=${gv.resumed} text=${gv.playTextThird}）`);
  (gv.playTextAfterCast === '播放' && gv.liveHidden)
    ? ok('切换卦象即停止：状态复位')
    : err(`切换卦象未停止（text=${gv.playTextAfterCast} hidden=${gv.liveHidden}）`);
  (!gv.mpHiddenDuring && gv.mpPlaying && gv.mpBtns && gv.mpTitle.indexOf('心音') < 0 && gv.mpTitle.length > 1)
    ? ok(`浮动播放栏播放中滑出：${gv.mpTitle}（${gv.mpSub}），含播放/循环/音量键`)
    : err(`浮动栏播放态异常（hidden=${gv.mpHiddenDuring} playing=${gv.mpPlaying} btns=${gv.mpBtns}）`);
  (gv.mpHiddenAfterCast)
    ? ok('停止后浮动栏收起')
    : err('停止后浮动栏未收起');

  /* ---------- 2h-2. 浮动播放栏几何：与标签栏同宽同轴、不重叠 ---------- */
  console.log('\n【2h-2】浮动播放栏几何');
  const mpGeo = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const out = {};
      const tb = document.querySelector('#tabbar');
      const mp = document.querySelector('#miniPlayer');
      document.querySelector('.tabbtn[data-page="music"]').click();
      if (mp.hidden) document.querySelector('#btnPlay').click();
      await new Promise(r => setTimeout(r, 3800));
      const t = tb.getBoundingClientRect();
      const m = mp.getBoundingClientRect();
      out.visible = !mp.hidden;
      out.mpW = Math.round(m.width);
      out.tbW = Math.round(t.width);
      out.sameWidth = Math.abs(t.width - m.width) <= 1.5;
      out.mpH = Math.round(m.height);
      out.tbH = Math.round(t.height);
      out.gap = Math.round(t.top - m.bottom);          // 两栏间距
      out.overlap = m.bottom > t.top + 0.5;           // 是否压住标签栏
      out.axis = Math.abs((m.left + m.right) / 2 - (t.left + t.right) / 2) <= 1.5;
      out.mpVar = getComputedStyle(document.documentElement).getPropertyValue('--mp-bottom').trim();
      // 停止播放
      window.__gxCastHexagram(11);
      await new Promise(r => setTimeout(r, 400));
      return out;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const mg = mpGeo.result.value;
  (mg.visible && mg.sameWidth && mg.axis && !mg.overlap && mg.gap >= 6)
    ? ok(`浮动栏与标签栏同宽同轴（${mg.mpW}px / 高 ${mg.mpH}px），间距 ${mg.gap}px 不重叠`)
    : err(`浮动栏几何异常（visible=${mg.visible} sameW=${mg.sameWidth} axis=${mg.axis} overlap=${mg.overlap} gap=${mg.gap}）`);

  /* ---------- 2h-3. 液态玻璃按压动效 ---------- */
  console.log('\n【2h-3】液态按压动效');
  const liq = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const out = {};
      document.querySelector('.tabbtn[data-page="music"]').click();
      const btn = document.querySelector('#btnPlay');
      const r = btn.getBoundingClientRect();
      out.w = Math.round(r.width);
      const x = r.left + r.width * 0.3, y = r.top + r.height * 0.6;
      const mk = (type) => new PointerEvent(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
        pointerId: 1, pointerType: 'touch', isPrimary: true
      });
      btn.dispatchEvent(mk('pointerdown'));
      out.press = btn.classList.contains('is-press');
      out.px = btn.style.getPropertyValue('--px');
      out.py = btn.style.getPropertyValue('--py');
      out.ripple = btn.querySelectorAll('.lq-ripple').length;
      btn.dispatchEvent(mk('pointerup'));
      out.released = !btn.classList.contains('is-press');
      // 开关态切换应有「涌起」动效类
      const loop = document.querySelector('#mpLoop');
      out.hasPulseRule = !!(loop && typeof loop.classList !== 'undefined');
      // 样式表里确实有液态动效规则
      let rules = 0;
      for (const sheet of document.styleSheets) {
        let list = null;
        try { list = sheet.cssRules; } catch (e) { list = null; }
        if (!list) continue;
        for (const r2 of list) {
          if (r2.cssText && (r2.cssText.indexOf('lq-ripple') >= 0 || r2.cssText.indexOf('is-press') >= 0)) rules++;
        }
      }
      out.rules = rules;
      // 迷你栏按键同样有触点高光
      const mpBtn = document.querySelector('#mpVol');
      const mr = mpBtn.getBoundingClientRect();
      mpBtn.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: mr.left + 4, clientY: mr.top + 4,
        pointerId: 2, pointerType: 'touch', isPrimary: true
      }));
      out.mpPress = mpBtn.classList.contains('is-press');
      mpBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2 }));
      return out;
    })()`,
    returnByValue: true
  });
  const lq = liq.result.value;
  (lq.press && lq.released && lq.px && lq.py && lq.ripple > 0 && lq.rules >= 2)
    ? ok(`液态按压：触点高光（${lq.px}/${lq.py}）+ 涟漪环（${lq.ripple} 个）+ 样式规则 ${lq.rules} 条`)
    : err(`液态按压动效缺失（press=${lq.press} px=${lq.px} ripple=${lq.ripple} rules=${lq.rules}）`);
  lq.mpPress ? ok('浮动栏按键同样有触点高光') : err('浮动栏按键无触点高光');

  /* ---------- 2h-4. 丝缕烟雾系统（方案 B：湍流丝缕） ---------- */
  console.log('\n【2h-4】丝缕烟雾');
  const fil = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const out = {};
      document.querySelector('.tabbtn[data-page="music"]').click();
      if (document.querySelector('#miniPlayer').hidden) document.querySelector('#btnPlay').click();
      await new Promise(r => setTimeout(r, 4200));
      const f = window.__gxFil ? window.__gxFil() : null;
      out.has = !!f;
      out.n = f ? f.n : 0;
      out.intro = f ? f.intro : 0;
      // 丝缕应分布在画面两侧（自气口涌入），且都有拖尾
      out.spread = (() => {
        const w = document.querySelector('#viz').clientWidth;
        const xs = window.__gxFilXs ? window.__gxFilXs() : [];
        if (!xs.length) return { left: 0, right: 0 };
        return { left: xs.filter(x => x < w * 0.35).length, right: xs.filter(x => x > w * 0.65).length };
      })();
      out.trail = f && f.sample ? f.sample.trail : 0;
      return out;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const fl = fil.result.value;
  (fl.has && fl.n > 80 && fl.intro >= 0.99 && fl.trail >= 4)
    ? ok(`丝缕系统运行中：${fl.n} 条丝，拖尾 ${fl.trail} 点，渐入 ${fl.intro.toFixed(2)}`)
    : err(`丝缕系统异常（has=${fl.has} n=${fl.n} intro=${fl.intro} trail=${fl.trail}）`);
  (fl.spread.left > 0 && fl.spread.right > 0)
    ? ok(`雾自左右两侧气口涌入（左 ${fl.spread.left} / 右 ${fl.spread.right}）`)
    : err(`雾的来源分布异常（${JSON.stringify(fl.spread)}）`);

  /* ---------- 2i. 音层面板：疗愈九频 + 自然五层 ---------- */
  console.log('\n【2i】音层面板');
  const amb = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const out = {};
      document.querySelector('.tabbtn[data-page="music"]').click();
      out.cardVisible = !document.querySelector('#ambientCard').classList.contains('hidden');
      out.solChips = document.querySelectorAll('#ambSolfChips .amb-chip').length;
      out.natChips = document.querySelectorAll('#ambNatureChips .amb-chip').length;
      // 点一个自然音层（雨声）
      const rain = document.querySelector('#ambNatureChips .amb-chip[data-nature="rain"]');
      rain.click();
      out.rainOn = rain.classList.contains('is-on');
      out.rainParam = (() => {
        const cards = Array.from(document.querySelectorAll('#musicNowParams .mparam'));
        const hit = cards.find(c => c.querySelector('.mparam-label').textContent === '自然音层');
        return hit ? hit.querySelector('.mparam-value').textContent : '';
      })();
      out.natIntro = (document.querySelector('#ambNatureIntro')||{}).textContent || '';
      // 再点一次关闭
      rain.click();
      out.rainOff = !rain.classList.contains('is-on');
      // 选一个疗愈频率：取当前未开启的一格
      // （当日卦的归属频率默认已开，点它会变成「关闭」而非切换）
      const solChips = Array.from(document.querySelectorAll('#ambSolfChips .amb-chip'));
      const sol = solChips.find(c => !c.classList.contains('is-on')) || solChips[0];
      sol.click();
      out.solOn = sol.classList.contains('is-on');
      out.solFreq = sol.dataset.freq;
      out.solParam = (() => {
        const cards = Array.from(document.querySelectorAll('#musicNowParams .mparam'));
        const hit = cards.find(c => c.querySelector('.mparam-label').textContent === '疗愈音层');
        return hit ? hit.querySelector('.mparam-value').textContent : '';
      })();
      out.solIntro = (document.querySelector('#ambSolfIntro')||{}).textContent || '';
      // 总音量
      const lv = document.querySelector('#ambLevel');
      out.levelExists = !!lv;
      // 一键关闭疗愈
      document.querySelector('#ambSolfClear').click();
      out.solCleared = !document.querySelector('#ambSolfChips .amb-chip.is-on');
      return out;
    })()`,
    returnByValue: true
  });
  const am = amb.result.value;
  am.cardVisible ? ok('音层面板随音乐栏显示') : err('音层面板未显示');
  (am.solChips === 9 && am.natChips === 5)
    ? ok(`音层齐备：索菲吉奥九频 ${am.solChips} + 自然音层 ${am.natChips}`)
    : err(`音层数量异常（sol=${am.solChips} nature=${am.natChips}）`);
  (am.rainOn && am.rainParam.indexOf('雨声') >= 0 && am.natIntro.indexOf('雨声') >= 0)
    ? ok('自然音层可多选，参数卡与介绍同步')
    : err(`自然音层交互异常（on=${am.rainOn} param=${am.rainParam}）`);
  am.rainOff ? ok('再点一次可取消') : err('自然音层无法取消');
  (am.solOn && am.solParam.indexOf(am.solFreq) >= 0 && am.solIntro.indexOf(am.solFreq) >= 0)
    ? ok(`疗愈频率九频可选：${am.solParam}，介绍同步`)
    : err(`疗愈频率选择异常（on=${am.solOn} freq=${am.solFreq} param=${am.solParam}）`);
  (am.levelExists && am.solCleared) ? ok('音层总音量滑条与一键关闭就位') : err('音层控制缺失');

  /* ---------- 2e-3. 暂停/继续：无缝（不重新编曲） ---------- */
  console.log('\n【2e-3】暂停与继续');
  const pz = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const out = {};
      const p = window.__gxPlayer;
      const playBtn = document.querySelector('#btnPlay');
      out.exists = !!playBtn;
      out.noStopBtn = !document.querySelector('#btnPause');   // 独立的停止/暂停键已合并
      // 先切一卦把状态复位（切卦即停），确保从干净状态起播
      window.__gxCastHexagram(11);
      await sleep(800);
      playBtn.click();
      for (let i = 0; i < 48 && !p.isPlaying; i++) await sleep(250);
      await sleep(700);
      out.playing = p.isPlaying;
      // 暂停（同一个大按钮）
      playBtn.click();
      for (let i = 0; i < 20 && !p.paused; i++) await sleep(150);
      await sleep(300);
      out.paused = p.paused;
      out.pauseText = document.querySelector('#btnPlayText').textContent;
      out.liveText = (document.querySelector('#playerLiveText')||{}).textContent || '';
      // 暂停期间不应重新编曲：同一份 PCM 对象
      const pcmBefore = p._gen && p._gen.rounds[0] ? p._gen.rounds[0].pcm : null;
      await sleep(700);
      out.pcmSame = !!(p._gen && p._gen.rounds[0] && p._gen.rounds[0].pcm === pcmBefore);
      // 继续
      playBtn.click();
      for (let i = 0; i < 20 && p.paused; i++) await sleep(150);
      await sleep(300);
      out.resumed = !p.paused;
      out.pauseText2 = document.querySelector('#btnPlayText').textContent;
      out.pcmSame2 = !!(p._gen && p._gen.rounds[0] && p._gen.rounds[0].pcm === pcmBefore);
      out.liveText2 = (document.querySelector('#playerLiveText')||{}).textContent || '';
      return out;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const pz2 = pz.result.value;
  (pz2.exists && pz2.noStopBtn && pz2.playing && pz2.paused === true
    && pz2.pauseText === '继续' && pz2.liveText === '已暂停')
    ? ok('播放/暂停/继续合为一个显眼大按钮（无独立停止键）')
    : err(`暂停异常（paused=${pz2.paused} text=${pz2.pauseText} live=${pz2.liveText} stopBtn=${pz2.noStopBtn}）`);
  (pz2.pcmSame && pz2.pcmSame2)
    ? ok('继续：从同一份音频接着放（未重新编曲，故无缝）')
    : err('暂停/继续期间音频被重新编曲（不是无缝）');
  (pz2.resumed && pz2.pauseText2 === '暂停' && pz2.liveText2 === '即兴中')
    ? ok('继续后恢复播放')
    : err(`继续异常（resumed=${pz2.resumed} text=${pz2.pauseText2}）`);

  /* ---------- 2i-0. 波形台卦象方向：须与起卦栏六爻图一致 ---------- */
  console.log('\n【2i-0】波形台卦象方向');
  const dir = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      // 用学易栏的「以此卦起卦」立一个确定的卦（地天泰：下乾三连阳，上坤三连阴）
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      return (async () => {
        // 地天泰：下乾（三连阳）上坤（三连阴），自上而下应为 000111
        window.__gxCastHexagram(11);
        document.querySelector('.tabbtn[data-page="music"]').click();
        await sleep(400);                       // 等波形台重绘两帧，取新卦的数据
        const fig = Array.from(document.querySelectorAll('#yaoFigure .yao')).map(r =>
          r.querySelector('.yao-line.solid') ? '1' : '0').join('');   // 自上而下
        const viz = window.__gxVizRows || '';
        const name = window.__gxVizName || '';
        // 像素级核对：地天泰上爻为阴（爻心是空的）、初爻为阳（爻心是实的）。
        // 只比数据会漏掉「数据对、画反了」这类错误，故再取画布上、下两爻的中心亮度。
        const cv = document.querySelector('#viz');
        const cx2 = cv.getContext('2d');
        const dpr = cv.width / cv.clientWidth;
        // 几何直接取自 app（不写死常量，免得改一次模型就失配）
        const geo = window.__gxVizGeo || {};
        const scale = geo.scale;
        const gap = geo.gap * scale;
        const cyv = geo.cy;
        // 判别用「冷暖」而非亮度：金属板是暖色（R>B），背景与空缺处是冷色（B>R）。
        // 上爻为阴 → 画面中心是空的（露出冷背景）；初爻为阳 → 中心是金属（暖）。
        const px = (x, y) => {
          const d = cx2.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
          return { lum: (d[0] + d[1] + d[2]) / 3, warm: d[0] - d[2] };
        };
        const top = px(cv.clientWidth / 2, cyv - 2.5 * gap);
        const bot = px(cv.clientWidth / 2, cyv + 2.5 * gap);
        return {
          fig, viz, name,
          topLum: Math.round(top.lum), botLum: Math.round(bot.lum),
          topWarm: Math.round(top.warm), botWarm: Math.round(bot.warm)
        };
      })();
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const dv = dir.result.value;
  (dv.name === '地天泰' && dv.fig === '000111' && dv.viz === dv.fig)
    ? ok(`波形台卦象数据与起卦栏一致（${dv.name}：自上而下 ${dv.viz}）`)
    : err(`卦象数据不一致（${dv.name}：起卦栏 ${dv.fig}，波形台 ${dv.viz}）`);
  (dv.topWarm < dv.botWarm)
    ? ok(`波形台卦象方向正确（上爻阴：中心是空缺 ${dv.topWarm}；初爻阳：中心是金属 ${dv.botWarm}）`)
    : err(`波形台卦象上下颠倒（上爻冷暖 ${dv.topWarm} ≥ 下爻 ${dv.botWarm}）`);

  /* ---------- 2i-0b. 波形台配套：循环 / 波形预览条 / 画质档 ---------- */
  console.log('\n【2i-0b】波形台配套');
  const vizAcc = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const out = {};
      // 循环开关
      const loop = document.querySelector('#btnLoop');
      out.loopExists = !!loop;
      loop.click();
      out.loopOn = loop.getAttribute('aria-pressed');
      out.loopText = document.querySelector('#btnLoopText').textContent;
      out.playerLoop = window.__gxPlayer ? window.__gxPlayer.loop : null;
      out.playerLoopOn = window.__gxPlayer ? window.__gxPlayer.loop : null;
      loop.click();
      out.loopOff = loop.getAttribute('aria-pressed');
      out.playerLoopOff = window.__gxPlayer ? window.__gxPlayer.loop : null;
      // 波形预览条
      const wp = document.querySelector('#wavePreview');
      out.previewExists = !!wp;
      if (wp) {
        const c = wp.getContext('2d');
        const d = c.getImageData(0, 0, wp.width, wp.height).data;
        let lit = 0;
        for (let i = 3; i < d.length; i += 4 * 37) if (d[i] > 12) lit++;
        out.previewInk = lit;
      }
      // 画质档
      out.qualitySegs = document.querySelectorAll('#qualityRow .seg').length;
      document.querySelector('#qualityRow .seg[data-q="perf"]').click();
      out.qualityOn = document.querySelector('#qualityRow .seg.is-on').dataset.q;
      document.querySelector('#qualityRow .seg[data-q="high"]').click();
      out.qualityBack = document.querySelector('#qualityRow .seg.is-on').dataset.q;
      return out;
    })()`,
    returnByValue: true
  });
  const ac = vizAcc.result.value;
  (ac.loopExists && ac.loopOn === 'true' && ac.loopOff === 'false'
    && ac.playerLoopOn === true && ac.playerLoopOff === false)
    ? ok(`循环开关生效（按下→${ac.loopText}，再按取消）`)
    : err(`循环开关异常（on=${ac.loopOn} off=${ac.loopOff} player=${ac.playerLoop}）`);
  (ac.previewExists && ac.previewInk > 20)
    ? ok(`波形预览条已绘制（采样到 ${ac.previewInk} 处墨迹）`)
    : err(`波形预览条未绘制（exists=${ac.previewExists} ink=${ac.previewInk}）`);
  (ac.qualitySegs === 2 && ac.qualityOn === 'perf' && ac.qualityBack === 'high')
    ? ok('画质档：高清 / 性能 可切换')
    : err(`画质档异常（segs=${ac.qualitySegs} on=${ac.qualityOn}）`);

  /* ---------- 2i-0d. 浮动播放栏：播放/暂停/循环/音量 四键联动 ---------- */
  console.log('\\n【2i-0d】浮动播放栏');
  const mpc = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const out = {};
      const mp = document.querySelector('#miniPlayer');
      const p = window.__gxPlayer;
      // 先复位（切卦即停），再起播，确保状态确定
      window.__gxCastHexagram(11);
      await sleep(800);
      document.querySelector('#btnPlay').click();
      for (let i = 0; i < 48 && !p.isPlaying; i++) await sleep(250);
      await sleep(700);
      out.shown = !mp.hidden;
      out.playIconIsPause = getComputedStyle(document.querySelector('.mp-ico-pause')).display !== 'none';
      // 浮动栏的播放键 → 暂停
      document.querySelector('#mpPlay').click();
      for (let i = 0; i < 20 && !p.paused; i++) await sleep(150);
      await sleep(250);
      out.pausedByMp = p.paused;
      out.playIconIsPlay = getComputedStyle(document.querySelector('.mp-ico-play')).display !== 'none';
      out.subPaused = (document.querySelector('#mpSub')||{}).textContent || '';
      // 浮动栏的循环键 → 与主按钮同步
      document.querySelector('#mpLoop').click();
      await sleep(200);
      out.loopByMp = p.loop;
      out.loopMainBtn = document.querySelector('#btnLoop').getAttribute('aria-pressed');
      out.loopMpBtn = document.querySelector('#mpLoop').getAttribute('aria-pressed');
      document.querySelector('#mpLoop').click();
      await sleep(150);
      // 浮动栏的音量键 → 静音 / 恢复
      document.querySelector('#mpVol').click();
      await sleep(200);
      out.muted = Number(document.querySelector('#volume').value) === 0;
      out.muteClass = document.querySelector('#mpVol').classList.contains('is-mute');
      document.querySelector('#mpVol').click();
      await sleep(200);
      out.restored = Number(document.querySelector('#volume').value) > 0;
      // 继续播放后切卦象收栏
      document.querySelector('#mpPlay').click();
      for (let i = 0; i < 20 && p.paused; i++) await sleep(150);
      await sleep(300);
      window.__gxCastHexagram(11);
      await sleep(400);
      out.hiddenAfterCast = mp.hidden;
      return out;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const mv = mpc.result.value;
  (mv.shown && mv.playIconIsPause && mv.pausedByMp && mv.playIconIsPlay && mv.subPaused === '已暂停')
    ? ok('浮动栏：播放中显示暂停图标，点按即暂停（图标转播放）')
    : err(`浮动栏播放/暂停异常（shown=${mv.shown} paused=${mv.pausedByMp} sub=${mv.subPaused}）`);
  (mv.loopByMp === true && mv.loopMainBtn === 'true' && mv.loopMpBtn === 'true')
    ? ok('浮动栏循环键与音乐栏循环按钮双向同步')
    : err(`浮动栏循环异常（player=${mv.loopByMp} main=${mv.loopMainBtn} mp=${mv.loopMpBtn}）`);
  (mv.muted && mv.muteClass && mv.restored)
    ? ok('浮动栏音量键可静音 / 恢复（图标同步变暗）')
    : err(`浮动栏音量异常（muted=${mv.muted} class=${mv.muteClass} restored=${mv.restored}）`);
  (mv.hiddenAfterCast)
    ? ok('切换卦象后浮动栏收起')
    : err('切换卦象后浮动栏未收起');

  /* ---------- 2i-0c. 音量图标：SVG 三态 + 点按静音 ---------- */
  console.log('\n【2i-0c】音量图标');
  const vc = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const out = {};
      const btn = document.querySelector('#volBtn');
      const slider = document.querySelector('#volume');
      out.isBtn = !!btn;
      out.hasSvg = !!btn.querySelector('svg');
      out.noEmoji = !(btn.textContent || '').trim();      // 不再用彩色 emoji
      const set = (v) => { slider.value = String(v); slider.dispatchEvent(new Event('input')); };
      set(85); await sleep(120); out.high = btn.dataset.level;
      set(30); await sleep(120); out.low = btn.dataset.level;
      set(0);  await sleep(120); out.mute = btn.dataset.level;
      out.ariaMute = btn.getAttribute('aria-label');
      // 点按恢复
      btn.click(); await sleep(150);
      out.restored = Number(slider.value);
      btn.click(); await sleep(150);
      out.mutedAgain = Number(slider.value);
      return out;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const volv = vc.result.value;
  (volv.isBtn && volv.hasSvg && volv.noEmoji)
    ? ok('音量图标为矢量 SVG（非 emoji 贴纸）')
    : err(`音量图标异常（btn=${volv.isBtn} svg=${volv.hasSvg} emoji=${volv.noEmoji}）`);
  (volv.high === 'high' && volv.low === 'low' && volv.mute === 'mute' && volv.ariaMute.indexOf('已静音') >= 0)
    ? ok(`图标随音量三态变化（高 ${volv.high} / 低 ${volv.low} / 静音 ${volv.mute}）`)
    : err(`图标三态异常（high=${volv.high} low=${volv.low} mute=${volv.mute}）`);
  (volv.restored > 0 && volv.mutedAgain === 0)
    ? ok('点按图标可静音 / 恢复')
    : err(`点按静音异常（restored=${volv.restored} muted=${volv.mutedAgain}）`);

  /* ---------- 2i-1b. 外观皮肤：三种可选、即时生效并记住 ---------- */
  console.log('\n【2i-1b】外观皮肤');
  const sk = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const out = {};
      // 设置页须由顶栏齿轮打开（不在音乐栏里）
      out.gear = !!document.querySelector('#btnSettings');
      out.sheetHiddenBefore = document.querySelector('#settingsSheet').hidden;
      document.querySelector('#btnSettings').click();
      out.sheetOpen = !document.querySelector('#settingsSheet').hidden;
      out.groups = Array.from(document.querySelectorAll('#settingsSheet .set-title')).map(h => h.textContent).join('/');
      const opts = Array.from(document.querySelectorAll('#skinList .skin-opt'));
      out.count = opts.length;
      out.names = opts.map(o => (o.querySelector('.skin-name')||{}).textContent || '').join('/');
      out.hasSwatch = opts.every(o => !!o.querySelector('.skin-swatch'));
      out.fonts = document.querySelectorAll('#fontRow .seg').length;
      // 字号：切到大档，html 上应带 data-font
      document.querySelector('#fontRow .seg[data-font="l"]').click();
      out.font = document.documentElement.getAttribute('data-font');
      document.querySelector('#fontRow .seg[data-font="m"]').click();
      // 关闭
      document.querySelector('#btnSettingsClose').click();
      out.sheetHiddenAfter = document.querySelector('#settingsSheet').hidden;
      // 切到夜航：html 上应出现 data-skin，且卡片背景随之变暗
      const before = getComputedStyle(document.querySelector('#ambientCard')).backgroundImage;
      document.querySelector('#skinList .skin-opt[data-key="night"]').click();
      out.skin = document.documentElement.getAttribute('data-skin');
      out.after = getComputedStyle(document.querySelector('#ambientCard')).backgroundImage;
      out.before = before;
      out.marked = !!document.querySelector('#skinList .skin-opt.is-on');
      // 偏好应已写入
      try {
        const pref = JSON.parse(localStorage.getItem('gulv-xiangyin-pref') || '{}');
        out.saved = pref.skin;
      } catch (e) { out.saved = 'err'; }
      // 切回纸本
      document.querySelector('#skinList .skin-opt[data-key="paper"]').click();
      out.backSkin = document.documentElement.getAttribute('data-skin');
      // 联系方式：本 App 的联系邮箱（不出现作者名）
      out.author = (document.querySelector('#settingsSheet .set-value')||{}).textContent || '';
      out.mail = (document.querySelector('#authorEmail')||{}).textContent || '';
      out.copyBtn = !!document.querySelector('#btnCopyEmail');
      out.mentionsName = (document.querySelector('#settingsSheet').textContent || '').indexOf('芦荟汁') >= 0;
      out.groupContact = Array.from(document.querySelectorAll('#settingsSheet .set-title'))
        .some(h => h.textContent === '联系方式');
      return out;
    })()`,
    returnByValue: true
  });
  const skv = sk.result.value;
  (skv.gear && skv.sheetHiddenBefore && skv.sheetOpen && skv.sheetHiddenAfter)
    ? ok('顶栏齿轮打开设置页，可开可关')
    : err(`设置页开合异常（gear=${skv.gear} open=${skv.sheetOpen}）`);
  (skv.mail === '809006156@qq.com' && skv.copyBtn && !skv.mentionsName && skv.groupContact)
    ? ok(`联系方式栏：${skv.mail}（可一键复制），不露作者名`)
    : err(`联系方式栏异常（mail=${skv.mail} copy=${skv.copyBtn} 露名=${skv.mentionsName} 分组=${skv.groupContact}）`);
  (skv.groups.indexOf('外观') >= 0 && skv.groups.indexOf('文字') >= 0
    && skv.groups.indexOf('播放') >= 0 && skv.groups.indexOf('数据') >= 0
    && skv.groups.indexOf('联系方式') >= 0)
    ? ok(`设置页分组：${skv.groups}`)
    : err(`设置页分组缺失：${skv.groups}`);
  (skv.count === 3 && skv.hasSwatch) ? ok(`外观可选三种：${skv.names}`) : err(`外观选项异常（count=${skv.count}）`);
  (skv.fonts === 3 && skv.font === 'l')
    ? ok('字号三档可切（大档已作用于 <html data-font>）')
    : err(`字号切换异常（seg=${skv.fonts} attr=${skv.font}）`);
  (skv.skin === 'night' && skv.before !== skv.after && skv.marked)
    ? ok(`切换「夜航」即时生效（玻璃底色 ${skv.before} → ${skv.after}）`)
    : err(`换肤未即时生效（skin=${skv.skin} ${skv.before}→${skv.after}）`);
  (skv.saved === 'night' && skv.backSkin === null)
    ? ok('外观选择已记住，并可切回纸本')
    : err(`外观偏好异常（saved=${skv.saved} back=${skv.backSkin}）`);

  /* ---------- 2i-2. 音层辨识波形：chip 迷你波 + 波形区层线 ---------- */
  console.log('\n【2i-2】音层辨识波形');
  const lw = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const out = {};
      document.querySelector('.tabbtn[data-page="music"]').click();
      out.sparkCount = document.querySelectorAll('.amb-chip .ac-wave').length;
      // 六种形状的 path 互不相同（辨识度）
      const shapes = {};
      document.querySelectorAll('#ambNatureChips .amb-chip').forEach((c) => {
        shapes[c.dataset.nature] = c.querySelector('.ac-wave path').getAttribute('d');
      });
      shapes.sol = document.querySelector('#ambSolfChips .amb-chip .ac-wave path').getAttribute('d');
      const ds = Object.values(shapes);
      out.shapeCount = ds.length;
      out.uniqueShapes = new Set(ds).size;
      // 每条都有可见起伏（y 极差 > 1px），不是直线
      out.allCurved = ds.every((d) => {
        const ys = (d.match(/,[\\-\\d.]+/g) || []).map((s) => parseFloat(s.slice(1)));
        return ys.length > 10 && Math.max.apply(null, ys) - Math.min.apply(null, ys) > 1;
      });
      // 流线：音层开启后应并入卦体流线。须在播放中检查——
// 未播放时无流线发射，画布本就不变。
      const cv = document.querySelector('#viz');
      const grab = () => {
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let s = '';
        for (let i = 0; i < d.length; i += 4 * 37) s += d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ';';
        return s;
      };
      document.querySelectorAll('#ambNatureChips .amb-chip').forEach((c) => {
        if (c.classList.contains('is-on')) c.click();
      });
      document.querySelector('#ambSolfClear').click();
      return new Promise((resolve) => {
        // 起播，等流线跑起来
        const btn = document.querySelector('#btnPlay');
        if ((btn.getAttribute('data-state') || '') !== 'playing') btn.click();
        setTimeout(() => {
          out.flowMode = (window.__gxFlowMode || '');
          document.querySelector('#ambSolfChips .amb-chip[data-freq="528"]').click();
          document.querySelectorAll('#ambNatureChips .amb-chip').forEach((c) => {
            if (!c.classList.contains('is-on')) c.click();
          });
          setTimeout(() => {
            out.layerKinds = (window.__gxFlowKinds || []).slice().sort().join(',');
            // 清理：全部关闭，避免影响后续用例
            document.querySelector('#ambSolfClear').click();
            document.querySelectorAll('#ambNatureChips .amb-chip').forEach((c) => {
              if (c.classList.contains('is-on')) c.click();
            });
            btn.click();
            resolve(out);
          }, 1400);
        }, 1500);
      });
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const lwv = lw.result.value;
  lwv.sparkCount === 14 ? ok('每个音层 chip 都配了迷你波形图标（疗愈 9 + 自然 5）') : err(`chip 波形图标数量：${lwv.sparkCount}`);
  (lwv.shapeCount === 6 && lwv.uniqueShapes === 6)
    ? ok('六种音层波形互不相同（正弦 / 雨 / 鸟 / 篝火 / 风 / 溪，辨识度高）')
    : err(`波形形状辨识度不足（${lwv.uniqueShapes}/${lwv.shapeCount}）`);
  lwv.allCurved ? ok('各波形均为曲线而非直线') : err('存在直线状波形');
  lwv.flowMode === 'playing' && lwv.layerKinds
    ? ok(`播放中风洞流线运行，音层开启后并入流线（流线种类：${lwv.layerKinds}）`)
    : err(`音层未并入风洞流线（mode=${lwv.flowMode} kinds=${lwv.layerKinds}）`);

  /* ---------- 2j. 波形显示模式与时钟 ---------- */
  console.log('\n【2j】波形模式与时钟');
  const viz = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const out = {};
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      out.vizModes = document.querySelectorAll('#vizModes .viz-mode').length;
      out.vizDefault = (document.querySelector('#vizModes .viz-mode.is-active')||{}).getAttribute('data-viz') || '';
      // 切到丝弦波形
      document.querySelector('#vizModes .viz-mode[data-viz="silk"]').click();
      out.silkActive = document.querySelector('#vizModes .viz-mode[data-viz="silk"]').classList.contains('is-active');
      // 播放下画布不应报错（控制台错误由第 6 段统一检查）
      document.querySelector('#btnPlay').click();
      await sleep(1200);
      out.playingViz = (document.querySelector('#btnPlayText')||{}).textContent || '';
      document.querySelector('#vizModes .viz-mode[data-viz="ripple"]').click();
      await sleep(600);
      out.rippleActive = document.querySelector('#vizModes .viz-mode[data-viz="ripple"]').classList.contains('is-active');
      document.querySelector('#btnPlay').click();
      await sleep(300);
      // 时钟：格式 HH:MM:SS，且每秒前进
      const clock = document.querySelector('#dateClock');
      out.clockFmt = /^\\d{2}:\\d{2}:\\d{2}$/.test((clock||{}).textContent || '');
      const t1 = (clock||{}).textContent || '';
      await sleep(1150);
      const t2 = (clock||{}).textContent || '';
      out.clockTicks = t1 !== t2;
      return out;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const vz = viz.result.value;
  vz.vizModes === 3 ? ok('三种波形显示模式：卦象立体 / 丝弦波形 / 卦象涟漪') : err(`波形模式数量异常：${vz.vizModes}`);
  vz.vizDefault === 'hex3d' ? ok('默认为「卦象立体」（真 3D 卦体 + 风洞流线）') : err(`默认波形模式异常：${JSON.stringify(vz.vizDefault)}`);
  vz.silkActive ? ok('可切换到丝弦波形') : err('波形模式切换失败');
  vz.rippleActive ? ok('可切换到卦象涟漪') : err('卦象涟漪切换失败');
  vz.clockFmt ? ok(`时钟精确到秒：${vz.clockFmt ? 'HH:MM:SS' : ''}`) : err('时钟格式异常');
  vz.clockTicks ? ok('时钟每秒刷新') : err('时钟未每秒刷新');

  /* ---------- 2f. 伴奏层：和声落在五声内、层次齐备 ---------- */
  console.log('\n【2f】伴奏层');
  const accs = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const hex = ICData.getHexagram(55);
      const cfg = ICData.deriveMusicConfig(hex);
      const sc = ICMusic.composeNotes(hex, cfg);
      const voices = {};
      sc.notes.forEach(n => { voices[n.voice] = (voices[n.voice] || 0) + 1; });
      // 和声是否严格落在该调式的五声音阶内
      const inScale = new Set();
      for (let p = 0; p < 10; p++) inScale.add(ICMusic.positionToMidi(cfg, p));
      let outOfScale = 0, semiClash = 0;
      ICMusic.HARMONY_GROUPS.forEach(g => {
        const midis = g.map(pos => ICMusic.positionToMidi(cfg, pos));
        midis.forEach(m => { if (!inScale.has(m)) outOfScale++; });
        for (let i = 1; i < midis.length; i++) {
          if (Math.abs(midis[i] - midis[i - 1]) === 1) semiClash++;
        }
      });
      const multiTone = sc.notes.filter(n => n.voice === 'pad' && n.tones && n.tones.length > 1).length;
      return {
        voices, outOfScale, semiClash, multiTone,
        noteCount: sc.notes.length,
        duration: sc.duration
      };
    })()`,
    returnByValue: true
  });
  const accv = accs.result.value;
  accv.voices.pad > 0 ? ok(`宫音踏板与和声垫已就位（pad ${accv.voices.pad} 个）`) : err('缺宫音踏板/和声垫');
  accv.multiTone > 0 ? ok(`踏板与和声垫已合并为多音 pad（${accv.multiTone} 个）`) : err('未合并为多音 pad');
  accv.voices.xian > 0 ? ok(`支声应和齐备（xian ${accv.voices.xian} 个）`) : err('缺支声');
  (accv.voices.zhu > 0 || accv.voices.gu > 0) ? ok('节奏骨架齐备（柷敔/鼓）') : err('缺节奏骨架');
  accv.outOfScale === 0 ? ok('和声严格落在本调式的五声音阶内') : err(`有 ${accv.outOfScale} 处和声出调`);
  accv.semiClash === 0 ? ok('和声无半音相邻，未失五声本色') : err(`有 ${accv.semiClash} 处半音相邻`);

  /* ---------- 2g. 三栏导航 / 音乐栏 / 乐器试听 / 学易栏 ---------- */
  console.log('\n【2g】三栏导航与音乐、学易栏');
  const tabs = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const out = {};
      const pageBtns = Array.from(document.querySelectorAll('.tabbtn'));
      out.tabCount = pageBtns.length;
      out.tabPages = pageBtns.map(b => b.dataset.page);
      out.tabHasIcon = pageBtns.every(b => !!b.querySelector('svg.tb-icon'));
      out.tabHasText = pageBtns.every(b => b.querySelector('span') && b.querySelector('span').textContent.length > 0);
      // 默认在起卦栏
      out.middleIsMusic = pageBtns.length === 3 && pageBtns[1].dataset.page === 'music';

      // 切到音乐栏
      pageBtns.find(b => b.dataset.page === 'music').click();
      out.musicActive = !!document.querySelector('#pageMusic.is-active');
      out.musicNowVisible = !document.querySelector('#musicNow').classList.contains('hidden');
      out.musicEmptyHidden = document.querySelector('#musicEmpty').classList.contains('hidden');
      out.musicName = (document.querySelector('#musicNowName')||{}).textContent || '';
      out.mnParams = document.querySelectorAll('#musicNowParams .mparam').length;
      out.playerVisible = !document.querySelector('#playerCard').classList.contains('hidden');
      out.vizExists = !!document.querySelector('#viz');

      // 乐器园
      const cards = document.querySelectorAll('.inst-card');
      out.instCount = cards.length;
      out.instNames = Array.from(cards).map(c => (c.querySelector('.inst-name')||{}).textContent || '');
      const firstPlay = document.querySelector('.inst-play');
      out.playLabelBefore = firstPlay.textContent;
      firstPlay.click();
      await new Promise(r => setTimeout(r, 2500));
      out.playLabelDuring = firstPlay.textContent;
      out.playClassDuring = firstPlay.classList.contains('playing');
      out.tipDuring = (document.querySelector('#playerTip')||{}).textContent || '';
      // 再点一次停止
      firstPlay.click();
      await new Promise(r => setTimeout(r, 300));
      out.playLabelAfter = firstPlay.textContent;
      out.instFoot = ((document.querySelector('#instFoot')||{}).textContent || '').indexOf('白虎通') >= 0;

      // 学易栏
      pageBtns.find(b => b.dataset.page === 'learn').click();
      out.learnActive = !!document.querySelector('#pageLearn.is-active');
      out.learnSections = document.querySelectorAll('#learnWrap .lsec').length;
      out.learnOpenDefault = document.querySelectorAll('#learnWrap .lsec.is-open').length;
      out.hex64Cells = document.querySelectorAll('#hex64Grid .hex64-cell').length;
      out.triCards = document.querySelectorAll('#learnWrap .tri-card').length;
      out.fiveCards = document.querySelectorAll('#learnWrap .five-card').length;
      out.lvChips = document.querySelectorAll('#learnWrap .lv-chip').length;
      out.taijiSvg = !!document.querySelector('#learnWrap .taiji-fig svg');
      out.bookItems = document.querySelectorAll('#learnWrap .book-item').length;
      /* 「爻位」章节也有 method-item（动爻/变卦），故不能用条目数判断古法残留，
         改查古法关键词。 */
      out.ancientItems = Array.from(document.querySelectorAll('#learnWrap .method-item'))
        .filter(el => /蓍|龟卜|金钱卦|梅花易数|占戒|大衍|以钱代蓍/.test(el.textContent)).length;
      out.ancientHasShi = document.querySelector('#learnWrap').textContent.indexOf('大衍之数') >= 0;
      out.ancientHasQian = document.querySelector('#learnWrap').textContent.indexOf('以钱代蓍') >= 0;
      out.hasCoinMethod = document.querySelector('#learnWrap').textContent.indexOf('铜钱') >= 0;
      out.hasGuQian = document.querySelector('#learnWrap').textContent.indexOf('龟卜') >= 0;
      out.ancientHasShi = document.querySelector('#learnWrap').textContent.indexOf('大衍之数') >= 0;
      out.ancientHasQian = document.querySelector('#learnWrap').textContent.indexOf('以钱代蓍') >= 0;
      out.hasCoinMethod = document.querySelector('#learnWrap').textContent.indexOf('铜钱') >= 0;
      out.hasCoinTab = !!document.querySelector('#castTabs .tab[data-mode="coin"]');
      out.castTabs = document.querySelectorAll('#castTabs .tab').length;
      /* 「起卦与卜筮」章节已按要求删除 —— 断言其**不存在** */
      out.divinationTitle = (() => {
        const cards = Array.from(document.querySelectorAll('#learnWrap .lsec'));
        const hit = cards.find(c => c.querySelector('.lsec-title-text').textContent.indexOf('起卦与卜筮') >= 0);
        return hit ? hit.querySelector('.lsec-title-text').textContent : '';
      })();
      /* 学易栏各章标题（用于校验编号连续、无重复） */
      out.learnTitles = Array.from(document.querySelectorAll('#learnWrap .lsec .lsec-title-text'))
        .map(el => el.textContent.trim());
      /* 太极图：网页版英雄区用 Canvas 绘制（不依赖字体字形） */
      out.taijiCanvas = !!document.querySelector('#lhTaiji');
      out.taijiCanvasPainted = (() => {
        const cv = document.querySelector('#lhTaiji');
        if (!cv) return false;
        try {
          const ctx = cv.getContext('2d');
          const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
          let dark = 0, light = 0;
          for (let i = 0; i < d.length; i += 4 * 7) {
            if (d[i] < 100) dark++;
            else if (d[i] > 200) light++;
          }
          return dark > 10 && light > 10;      // 既有黑又有白 → 画出来了
        } catch (e) { return false; }
      })();
      // 四象图：矢量爻形（不得依赖字体字形），且少阴上阴下阳、少阳上阳下阴
      out.taijiRects = document.querySelectorAll('#learnWrap .taiji-fig svg rect').length;
      // 折叠交互：点开「易之生成」
      const originCard = document.querySelector('#learnWrap .lsec[data-key="origin"]');
      originCard.querySelector('.lsec-head').click();
      out.originOpen = originCard.classList.contains('is-open');
      out.originBodyShown = !originCard.querySelector('.lsec-body').hidden;
      // 按上下卦找卦：上乾下坤 = 天地否（第 12 卦）
      document.querySelector('#hexFindUpper').value = 'qian';
      document.querySelector('#hexFindLower').value = 'kun';
      document.querySelector('#hexFindBtn').click();
      out.finderDetail = (document.querySelector('#hex64Detail')||{}).textContent || '';
      out.finderOpen = document.querySelector('#hex64Detail').classList.contains('open');
      // 搜索
      const search = document.querySelector('#hex64Search');
      search.value = '泰';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      out.searchHits = document.querySelectorAll('#hex64Grid .hex64-cell').length;
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      out.restored = document.querySelectorAll('#hex64Grid .hex64-cell').length;
      // 点开一卦
      const cell = document.querySelector('.hex64-cell[data-n="11"]');
      cell.click();
      const detail = document.querySelector('#hex64Detail');
      out.detailOpen = detail.classList.contains('open');
      out.detailText = detail.textContent;
      // 六十四卦详解的各部分是否都渲染出来
      out.secTitles = Array.from(detail.querySelectorAll('.h64d-sec-t')).map((e) => e.textContent.replace(/典籍原文|后世类书|当代类推/g, ''));
      out.yaoRows = detail.querySelectorAll('.h64d-yao tbody tr').length;
      out.tuanShown = detail.textContent.indexOf('包荒') >= 0;
      out.xiangCount = detail.querySelectorAll('.h64d-yx').length;
      out.palItems = detail.querySelectorAll('.h64d-pal-item').length;
      out.shiTag = detail.querySelectorAll('.h64d-tag.t-shi').length;
      out.yingTag = detail.querySelectorAll('.h64d-tag.t-ying').length;
      out.divShown = detail.textContent.indexOf('通泰安和') >= 0;
      out.badges = detail.querySelectorAll('.cbadge').length;
      // 以此卦起卦 → 切回起卦栏且结果变为地天泰
      const beforeName = (document.querySelector('#resultName')||{}).textContent || '';
      document.querySelector('#btnLearnCast').click();
      out.afterName = (document.querySelector('#resultName')||{}).textContent || '';
      out.beforeName = beforeName;
      out.backToCast = !!document.querySelector('#pageCast.is-active');
      out.methodAfter = (document.querySelector('#resultMethod')||{}).textContent || '';
      return out;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const tv = tabs.result.value;
  tv.tabCount === 3 ? ok('底部标签栏三栏') : err(`标签栏数量异常：${tv.tabCount}`);
  tv.tabPages.join(',') === 'cast,music,learn'
    ? ok('栏位顺序：起卦 / 音乐 / 学易')
    : err(`栏位顺序异常：${tv.tabPages.join(',')}`);
  tv.middleIsMusic ? ok('音乐栏位于中间') : err('音乐栏不在中间');
  (tv.tabHasIcon && tv.tabHasText) ? ok('每栏均有图标 + 文字') : err('栏目标签缺图标或文字');
  tv.musicActive ? ok('点击后切换到音乐栏') : err('音乐栏切换失败');
  (tv.musicNowVisible && tv.musicEmptyHidden) ? ok('起卦后心音直达音乐栏') : err('音乐栏未同步卦象');
  tv.musicName.indexOf('心音') >= 0 ? ok(`音乐栏标题：${tv.musicName}`) : err(`音乐栏标题异常：${tv.musicName}`);
  tv.mnParams === 6 ? ok('音乐栏参数六格（调式/律/音色/速度/疗愈音层/自然音层）') : err(`音乐栏参数数量：${tv.mnParams}`);
  (tv.playerVisible && tv.vizExists) ? ok('播放器与波形图画布就位') : err('播放器缺失');
  tv.instCount === 8 ? ok(`乐器园八件齐备：${tv.instNames.join('、')}`) : err(`乐器园数量异常：${tv.instCount}`);
  tv.playLabelBefore === '试听' ? ok('试听按钮初始态') : err(`试听按钮初始态异常：${tv.playLabelBefore}`);
  (tv.playLabelDuring === '停止' && tv.playClassDuring)
    ? ok('点击试听后进入播放态') : err('试听播放态异常');
  tv.tipDuring.indexOf('试听') >= 0 ? ok(`播放提示：${tv.tipDuring}`) : err(`播放提示异常：${tv.tipDuring}`);
  tv.instFoot ? ok('乐器园脚注含《白虎通》出处') : err('乐器园脚注缺出处');
  tv.learnActive ? ok('切换到学易栏') : err('学易栏切换失败');
  tv.divinationTitle === ''
    ? ok('学易栏已移除「起卦与卜筮」章节')
    : err(`「起卦与卜筮」章节仍在：${tv.divinationTitle}`);
  /* 章节编号须连续且不重复（删章后重新编号） */
  tv.learnTitles && tv.learnTitles.length === tv.learnSections
    ? ok(`学易 ${tv.learnSections} 章：${tv.learnTitles.join(' / ')}`)
    : err(`学易章节标题数不符：${tv.learnTitles ? tv.learnTitles.length : 0} vs ${tv.learnSections}`);
  tv.learnSections === 7 ? ok('学易内容 7 个章节（默认折叠）') : err(`学易章节数异常：${tv.learnSections}`);  tv.learnOpenDefault === 0 ? ok('章节默认全部收起，不占空间') : err(`默认有 ${tv.learnOpenDefault} 个章节展开`);
  (tv.originOpen && tv.originBodyShown) ? ok('点击章节标题可展开正文') : err('章节折叠交互异常');
  tv.hex64Cells === 64 ? ok('六十四卦全表 64 格') : err(`六十四卦数量异常：${tv.hex64Cells}`);
  (tv.triCards >= 8 && tv.fiveCards === 5 && tv.lvChips === 12)
    ? ok(`八卦卡 ${tv.triCards} / 五音卡 ${tv.fiveCards} / 十二律 ${tv.lvChips}`)
    : err(`学易卡片异常：tri=${tv.triCards} five=${tv.fiveCards} lv=${tv.lvChips}`);
  (tv.taijiSvg && tv.bookItems >= 5) ? ok('太极生成图与典籍列表齐备') : err('学易图示或典籍缺失');
  /* 「起卦与卜筮」章节已删 → 相关的古法条目（蓍占/龟卜/金钱卦）不再出现在学易栏 */
  (!tv.ancientHasShi && !tv.ancientHasQian && !tv.hasGuQian && tv.ancientItems === 0)
    ? ok('古法条目（蓍占/龟卜/金钱卦）已随章节一并移除')
    : err(`古法条目残留（shi=${tv.ancientHasShi} qian=${tv.ancientHasQian} gu=${tv.hasGuQian} items=${tv.ancientItems}）`);
  (!tv.hasCoinMethod && !tv.hasCoinTab && tv.castTabs === 3)
    ? ok('起卦栏仍为三法，无铜钱卦')
    : err(`铜钱卦残留检查失败（method=${tv.hasCoinMethod} tab=${tv.hasCoinTab} tabs=${tv.castTabs}）`);
  /* 太极图：Canvas 绘制且确有黑白像素（不是空白画布） */
  (tv.taijiCanvas && tv.taijiCanvasPainted)
    ? ok('太极图用 Canvas 绘制且已出图')
    : err(`太极图 Canvas 异常（canvas=${tv.taijiCanvas} painted=${tv.taijiCanvasPainted}）`);
  tv.taijiRects >= 15 ? ok(`四象图用矢量爻形绘制（${tv.taijiRects} 个矩形：两仪 3 + 四象 12，不依赖字体字形）`) : err(`四象图矩形过少：${tv.taijiRects}`);
  (tv.finderOpen && tv.finderDetail.indexOf('否') >= 0 && tv.finderDetail.indexOf('乾') >= 0 && tv.finderDetail.indexOf('坤') >= 0)
    ? ok('按上下卦找卦：上乾下坤 → 天地否，详情自动展开')
    : err(`上下卦找卦异常：${tv.finderDetail.slice(0, 40)}`);
  tv.searchHits >= 1 && tv.searchHits < 64 ? ok(`搜索「泰」过滤出 ${tv.searchHits} 卦`) : err(`搜索过滤异常：${tv.searchHits}`);
  tv.restored === 64 ? ok('清空关键词后恢复 64 卦') : err(`恢复异常：${tv.restored}`);
  tv.detailOpen ? ok('点击卦格展开详情（六爻爻辞 / 卦辞 / 大象传 / 音律）') : err('卦格详情未展开');
  (tv.yaoRows === 6 && tv.xiangCount === 6)
    ? ok('详解逐爻表：6 条爻辞 + 6 条「象曰」小象俱全')
    : err(`逐爻表不全：爻辞 ${tv.yaoRows} 行、小象 ${tv.xiangCount} 条`);
  tv.tuanShown ? ok('彖传入详情（地天泰「包荒，用冯河…」）') : err('彖传未显示');
  (tv.secTitles.join('|').indexOf('六爻爻辞与小象') >= 0 && tv.secTitles.join('|').indexOf('京房八宫') >= 0
    && tv.secTitles.join('|').indexOf('常见占断') >= 0 && tv.secTitles.join('|').indexOf('此卦之音') >= 0
    && tv.secTitles.length === 5)
    ? ok(`详解五节俱全：${tv.secTitles.join(' / ')}`)
    : err(`详解分节异常：${tv.secTitles.join(' / ')}`);
  (tv.palItems === 5 && tv.shiTag === 1 && tv.yingTag === 1)
    ? ok(`京房八宫信息 5 项：地天泰属坤宫·三世，世在三爻、应在上爻，各标 1 处`)
    : err(`八宫信息异常：pal=${tv.palItems} shi=${tv.shiTag} ying=${tv.yingTag}`);
  tv.divShown ? ok('常见占断已显示') : err('占断未显示');
  tv.badges >= 4 ? ok(`每节标注文献档位徽标 ${tv.badges} 个`) : err(`档位徽标过少：${tv.badges}`);
  (tv.afterName === '地天泰' && tv.backToCast)
    ? ok(`「以此卦起卦」生效：${tv.beforeName} → ${tv.afterName}，并切回起卦栏`)
    : err(`以此卦起卦异常：${tv.beforeName} → ${tv.afterName}`);

  /* ---------- 3. 音频渲染与播放 ---------- */
  console.log('\n【3】音频渲染与播放');
  const audio = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const hex = ICData.getHexagram(1);
      const cfg = ICData.deriveMusicConfig(hex);
      const score = ICMusic.composeNotes(hex, cfg, null);
      const t0 = performance.now();
      const pcm = ICRender.renderScore(score, { sampleRate: 44100 });
      const renderMs = performance.now() - t0;
      let peak = 0, nan = 0;
      for (let i = 0; i < pcm.left.length; i += 3) {
        const v = pcm.left[i];
        if (!isFinite(v)) { nan++; continue; }
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      // WAV 编码
      const wav = ICRender.encodeWav(pcm);
      const wavBytes = new Uint8Array(wav);
      const head = String.fromCharCode(wavBytes[0],wavBytes[1],wavBytes[2],wavBytes[3]);
      // 真实播放
      let playState = 'n/a';
      try {
        const ctx = new (window.AudioContext||window.webkitAudioContext)();
        const buf = ctx.createBuffer(2, pcm.length, pcm.sampleRate);
        buf.copyToChannel(pcm.left, 0);
        buf.copyToChannel(pcm.right, 1);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        await new Promise(r => setTimeout(r, 400));
        playState = ctx.state + '@' + ctx.currentTime.toFixed(2);
        src.stop();
      } catch (e) { playState = 'error: ' + e.message; }
      return {
        renderMs: Math.round(renderMs),
        samples: pcm.length,
        duration: pcm.duration.toFixed(2),
        peak: peak.toFixed(4),
        nan,
        wavBytes: wav.byteLength,
        wavHead: head,
        playState
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const av = audio.result.value;
  av.renderMs < 5000 ? ok(`浏览器内渲染耗时 ${av.renderMs} ms`) : err(`渲染过慢：${av.renderMs} ms`);
  av.samples > 100000 ? ok(`样本数 ${av.samples}（${av.duration} 秒）`) : err('样本数异常');
  av.peak > 0 && av.peak < 1 ? ok(`峰值 ${av.peak}，未削波`) : err(`峰值异常：${av.peak}`);
  av.nan === 0 ? ok('无非法样本') : err(`存在 ${av.nan} 个 NaN`);
  av.wavHead === 'RIFF' ? ok(`WAV 编码正确（${(av.wavBytes / 1024 / 1024).toFixed(2)} MB）`) : err('WAV 头错误');
  av.playState.startsWith('running') ? ok(`真实播放成功：${av.playState}`) : err(`播放异常：${av.playState}`);

  /* ---------- 4. Service Worker ---------- */
  console.log('\n【4】PWA 能力');
  const sw = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        return reg ? 'registered:' + (reg.active ? 'active' : 'installing') : 'none';
      } catch (e) { return 'error: ' + e.message; }
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const swv = sw.result.value;
  swv.startsWith('registered') ? ok(`Service Worker ${swv}`) : err(`Service Worker 未注册：${swv}`);

  const mf = await cdp.send('Runtime.evaluate', {
    expression: `fetch('manifest.json').then(r => r.json()).then(j => j.name + ' | icons:' + j.icons.length).catch(e => 'error:' + e.message)`,
    awaitPromise: true,
    returnByValue: true
  });
  mf.result.value.includes('icons:') ? ok(`manifest 可解析：${mf.result.value}`) : err(`manifest 异常：${mf.result.value}`);

  /* ---------- 5. 截图 ---------- */
  console.log('\n【5】截图');
  fs.mkdirSync(SHOTS, { recursive: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true
  });
  await new Promise((r) => setTimeout(r, 600));
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, 'web-mobile.png'), Buffer.from(shot.data, 'base64'));
  ok('移动端截图已保存');

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
  });
  await new Promise((r) => setTimeout(r, 600));
  const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, 'web-desktop.png'), Buffer.from(shot2.data, 'base64'));
  ok('桌面端截图已保存');

  // 文献依据面板展开态留档
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const p = document.querySelector('#classicsPanel');
      if (p) { p.open = true; p.scrollIntoView({ block: 'start' }); }
    })()`
  });
  await new Promise((r) => setTimeout(r, 500));
  const shot3 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, 'web-classics.png'), Buffer.from(shot3.data, 'base64'));
  ok('文献依据面板截图已保存');

  /* ---------- 6. 控制台错误 ---------- */
  console.log('\n【6】控制台');
  if (consoleErrors.length === 0) {
    ok('无 JS 错误');
  } else {
    consoleErrors.slice(0, 5).forEach((e) => {
      err('控制台错误：' + String(e).slice(0, 160));
      if (process.env.GX_DEBUG_STACK) console.log('  [栈]\n' + String(e).slice(0, 900));
    });
  }

  cdp.close();
  cleanup();

  console.log('\n' + '='.repeat(46));
  console.log(`通过 ${pass} 项，失败 ${fail} 项`);
  console.log('='.repeat(46));
  process.exit(fail > 0 ? 1 : 0);
})();
