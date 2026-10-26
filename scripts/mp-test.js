/**
 * 微信小程序运行时模拟器
 * ---------------------------------------------------------------
 * 在 Node 中模拟小程序环境，实测页面逻辑：
 *   · wx.* API（存储、弹窗、导航、文件系统、音频）
 *   · Page()/App() 生命周期
 *   · setData 的数据合并与视图更新
 *   · 事件绑定与交互流程
 *
 * 这是验证小程序能否真正跑起来的最有效手段。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const MP_ROOT = path.resolve(__dirname, '..', 'miniprogram');

let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log(`  [OK] ${msg}`); }
function err(msg) { fail++; console.log(`  [!!] ${msg}`); }
function assert(cond, msg) { cond ? ok(msg) : err(msg); }

/* ===============================================================
 * 一、模拟 wx API
 * =============================================================== */

const storage = new Map();
const toasts = [];
const modals = [];
const navCalls = [];
/** 识象页起卦后是否触发了延迟滚动（跨段传递的测试标记） */
let scrollCalled = false;

const wx = {
  // 存储
  getStorageSync: (k) => storage.get(k) || '',
  setStorageSync: (k, v) => storage.set(k, v),
  removeStorageSync: (k) => storage.delete(k),

  // 弹窗
  showToast: (opts) => { toasts.push(opts); },
  showModal: (opts) => { modals.push(opts); if (opts.success) opts.success({ confirm: false }); },
  hideToast: () => {},

  // 导航
  navigateTo: (opts) => { navCalls.push({ type: 'navigateTo', url: opts.url }); if (opts.success) opts.success({}); },
  switchTab: (opts) => { navCalls.push({ type: 'switchTab', url: opts.url }); if (opts.success) opts.success({}); },
  redirectTo: (opts) => { navCalls.push({ type: 'redirectTo', url: opts.url }); if (opts.success) opts.success({}); },
  navigateBack: () => { navCalls.push({ type: 'navigateBack' }); },

  // 导航栏
  setNavigationBarTitle: (opts) => { navCalls.push({ type: 'title', title: opts.title }); },
  showShareMenu: () => {},

  // 滚动与预览（识象页需要）
  pageScrollTo: (opts) => { navCalls.push({ type: 'pageScrollTo', scrollTop: opts.scrollTop }); },
  previewImage: (opts) => { navCalls.push({ type: 'previewImage', count: (opts.urls || []).length }); },
  chooseMedia: (opts) => {
    // 模拟用户选中 n 张图
    const n = Math.min(opts.count || 1, 3);
    const files = Array.from({ length: n }, (_, i) => ({
      tempFilePath: '/tmp/mock-' + i + '.jpg',
      size: 1024 * 100
    }));
    if (opts.success) opts.success({ tempFiles: files });
  },
  chooseImage: (opts) => {
    if (opts.success) opts.success({ tempFilePaths: ['/tmp/mock-0.jpg'] });
  },
  cloud: undefined,   // 默认无云环境，验证降级路径

  // 系统
  getSystemInfoSync: () => ({
    platform: 'devtools',
    windowWidth: 375,
    windowHeight: 667,
    pixelRatio: 2,
    statusBarHeight: 20,
    safeArea: { top: 20, bottom: 667, left: 0, right: 375, width: 375, height: 647 }
  }),

  // 环境
  env: { USER_DATA_PATH: '/tmp/gx' },

  // 文件系统（真实落盘到临时目录）
  getFileSystemManager: () => ({
    writeFile: (opts) => {
      const p = path.join('/tmp/gx', path.basename(opts.filePath));
      try {
        fs.mkdirSync('/tmp/gx', { recursive: true });
        fs.writeFileSync(p, Buffer.from(opts.data));
        if (opts.success) opts.success({});
      } catch (e) {
        if (opts.fail) opts.fail({ errMsg: e.message });
      }
      return { onProgressUpdate: () => {} };
    }
  }),

  // 音频（记录回调，便于测试播放链路）
  createInnerAudioContext: () => {
    const ctx = {
      autoplay: false, obeyMuteSwitch: false, volume: 1,
      currentTime: 0, duration: 0, src: '',
      _cb: { time: null, ended: null, error: null },
      onTimeUpdate: (f) => { ctx._cb.time = f; },
      onEnded: (f) => { ctx._cb.ended = f; },
      onError: (f) => { ctx._cb.error = f; },
      play: () => { ctx.playing = true; audioContexts.push(ctx); },
      pause: () => { ctx.playing = false; },
      stop: () => { ctx.playing = false; ctx.currentTime = 0; },
      seek: (t) => { ctx.currentTime = t; },
      destroy: () => {}
    };
    return ctx;
  },

  // 实时合成降级方案（小程序专用 API）
  createWebAudioContext: () => {
    if (wx._noWebAudio) return null;
    throw new Error('本测试不覆盖 wx.createWebAudioContext 降级路径');
  }
};

/** 所有创建过的 InnerAudioContext（供播放链路测试） */
const audioContexts = [];

/* ===============================================================
 * 二、模拟 Page / App / getApp / getCurrentPages
 * =============================================================== */

let currentPage = null;
const pageStack = [];

function Page(config) {
  const page = Object.assign({}, config);
  // 绑定 setData
  page.data = JSON.parse(JSON.stringify(config.data || {}));
  page.setData = function (patch) {
    Object.keys(patch).forEach((k) => {
      if (typeof patch[k] === 'object' && patch[k] !== null &&
          !Array.isArray(patch[k]) && typeof this.data[k] === 'object' &&
          this.data[k] !== null && !Array.isArray(this.data[k])) {
        // 路径式更新：'a.b' 形式
        const parts = k.split('.');
        let target = this.data;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {};
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = patch[k];
      } else {
        this.data[k] = patch[k];
      }
    });
  };
  page.__config = config;
  currentPage = page;
  pageStack.push(page);
  return page;
}

let appInstance = null;
function App(config) {
  appInstance = Object.assign({}, config);
  appInstance.globalData = config.globalData || {};
  if (config.onLaunch) config.onLaunch.call(appInstance);
  return appInstance;
}

function getApp() { return appInstance; }
function getCurrentPages() { return pageStack.slice(-1); }

// 把小程序全局挂到 global，模拟"全局对象可直接访问"的语义
// 这样被普通 require 的模块（如 utils/storage.js）也能拿到 wx
global.wx = wx;
global.getApp = getApp;
global.getCurrentPages = getCurrentPages;
global.Page = Page;
global.App = App;
global.__MP_MOCK__ = true;

/* ===============================================================
 * 三、加载小程序模块（注入 wx / Page / App / getApp）
 * =============================================================== */

const origModule = Module.prototype.require;

/**
 * 加载小程序模块（注入 wx / Page / App / getApp）
 * 页面与 app.js 走此路径
 */
function loadModule(relPath) {
  const full = path.join(MP_ROOT, relPath);
  const code = fs.readFileSync(full, 'utf8');
  const m = new Module(full, null);
  m.filename = full;
  m.paths = Module._nodeModulePaths(path.dirname(full));

  // 注入小程序全局
  const fn = new Function('wx', 'Page', 'App', 'getApp', 'getCurrentPages', 'module', 'exports', 'require', 'console', code);
  fn(wx, Page, App, getApp, getCurrentPages, m, m.exports, m.require.bind(m), console);
  return m.exports;
}
/**
 * 加载小程序内部的普通模块（如 utils/storage.js）
 * 这些模块在真实小程序里能访问全局 wx，
 * 模拟时需把 wx 挂到 global 上
 */
function loadInternal(relPath) {
  const full = path.join(MP_ROOT, relPath);
  global.wx = wx;
  const m = new Module(full, null);
  m.filename = full;
  m.paths = Module._nodeModulePaths(path.dirname(full));
  const code = fs.readFileSync(full, 'utf8');
  const fn = new Function('wx', 'module', 'exports', 'require', 'console', code);
  fn(wx, m, m.exports, m.require.bind(m), console);
  return m.exports;
}

/* ===============================================================
 * 四、开始测试
 * =============================================================== */

console.log('=== 微信小程序运行时模拟测试 ===\n');

console.log('【1】加载 app.js');
const appMod = loadModule('app.js');
assert(!!appMod, 'app.js 加载成功');
assert(!!appInstance, 'App 实例已创建');
assert(!!appInstance.globalData.player, '全局播放引擎已初始化');
assert(!!appInstance.globalData.currentResult, '预热：今日之卦已算好');
assert(!!appInstance.globalData.currentScore, '预热：音符表已算好');
console.log(`  今日之卦：${appInstance.globalData.currentResult.hex.name}`);

console.log('\n【1】加载首页');
const indexMod = loadModule('pages/index/index.js');
const index = currentPage;
assert(!!index, 'Page 实例已创建');
assert(typeof index.onLoad === 'function', 'onLoad 生命周期存在');
assert(typeof index.setData === 'function', 'setData 可用');

index.onLoad();
assert(index.data.dateCn.length > 0, `日期已渲染：${index.data.dateCn}`);
assert(index.data.imageGroups.length > 0, `物象库已加载：${index.data.imageGroups.length} 组`);
assert(index.data.hasResult === true, '自动展示今日之卦');
assert(index.data.symbol.length > 0, `卦符：${index.data.symbol}`);
assert(index.data.name.length > 0, `卦名：${index.data.name}`);
assert(index.data.yaoList.length === 6, '六爻齐备');
assert(index.data.musicParams.length === 6, '音乐参数齐备');
assert(index.data.sections.length === 4, '起承转合四段齐备');
assert(/^\d{2}:\d{2} \/ \d{2}:\d{2}$/.test(index.data.playerTime), `时长显示：${index.data.playerTime}`);

console.log('\n【2】切换起卦方式');
index.onModeChange({ currentTarget: { dataset: { mode: 'image' } } });
assert(index.data.mode === 'image', '切换到观象起卦');

console.log('\n【3】选择物象并起卦');
const firstItem = index.data.imageGroups[0].items[0];
index.onImageSelect({ currentTarget: { dataset: { name: firstItem.name, gua: firstItem.gua } } });
assert(index.data.selectedImageName === firstItem.name, `已选物象：${firstItem.name}`);
assert(index.data.selectedImageGua.length > 0, `物象归属：${index.data.selectedImageGua}`);

const beforeName = index.data.name;
index.castImage();
assert(index.data.hasResult === true, '观象起卦成功');
assert(index.data.methodText === '观象起卦', `起卦方式：${index.data.methodText}`);
console.log(`  结果：${beforeName} → ${index.data.name}`);

console.log('\n【4】数字起卦');
index.onModeChange({ currentTarget: { dataset: { mode: 'number' } } });
index.onNumInput({ currentTarget: { dataset: { key: 'numUpper' } }, detail: { value: '17' } });
index.onNumInput({ currentTarget: { dataset: { key: 'numLower' } }, detail: { value: '43' } });
index.castNumber();
assert(index.data.methodText === '数字起卦', '数字起卦成功');
console.log(`  结果：${index.data.name}`);

console.log('\n【5】无效输入防护');
index.onNumInput({ currentTarget: { dataset: { key: 'numUpper' } }, detail: { value: '0' } });
toasts.length = 0;
index.castNumber();
assert(toasts.length > 0, `无效数字被拦截：${toasts[0] && toasts[0].title}`);

console.log('\n【6】播放流程');
const score = appInstance.globalData.currentScore;
assert(!!score && score.notes.length > 0, `音符表就绪：${score.notes.length} 个音符`);

index.togglePlay();
assert(index.data.isPlaying === true, '播放状态已开启');
console.log('  提示文案：' + index.data.playerTip);

index.onPlayerProgress(12.5, score.duration);
assert(index.data.progressPercent !== '0.00', `进度更新：${index.data.progressPercent}%`);
assert(index.data.playerTime.startsWith('00:12'), `时间显示：${index.data.playerTime}`);

index.onPlayerEnd();
assert(index.data.isPlaying === false, '播放结束状态复位');
assert(index.data.progressPercent === 0, '进度归零');

console.log('\n【7】卦历写入');
const hist = loadInternal('utils/storage.js');
const list = hist.loadHistory();
assert(list.length > 0, `卦历已记录 ${list.length} 条`);
assert(list[0].name === index.data.name, '最新记录与当前卦一致');
assert(!!list[0].key, '记录含唯一键');

console.log('\n【8】加载卦历页');
pageStack.length = 0;
currentPage = null;
loadModule('pages/calendar/calendar.js');
const calendar = currentPage;
calendar.onShow();
assert(calendar.data.empty === false, '卦历页读到记录');
assert(calendar.data.list.length === list.length, `列表数量一致：${calendar.data.list.length}`);
assert(!!calendar.data.list[0].symbol, '列表项含卦符');

console.log('\n【9】加载详情页');
pageStack.length = 0;
currentPage = null;
loadModule('pages/detail/detail.js');
const detail = currentPage;
detail.onLoad();
assert(detail.data.hasResult === true, '详情页读到当前卦');
assert(detail.data.yaoList.length === 6, '六爻详解齐备');
assert(detail.data.yaoList[0].position.length > 0, '爻位白话已生成');
assert(detail.data.musicParams.length === 8, '音乐构成项齐备');
assert(!!detail.data.upper && !!detail.data.lower, '上下卦信息齐备');
assert(detail.data.name === index.data.name, '与首页卦象一致');

console.log('\n【10】导航');
navCalls.length = 0;
index.goDetail();
assert(navCalls.some((c) => c.type === 'navigateTo' && c.url.includes('detail')), '跳转到详情页');
index.goCalendar();
assert(navCalls.some((c) => c.type === 'navigateTo' && c.url.includes('calendar')), '跳转到卦历页（非 tab 页，用 navigateTo）');
index.goMusic();
assert(navCalls.some((c) => c.type === 'switchTab' && c.url.includes('music')), '可去音乐栏（tab 页，用 switchTab）');
index.goLearn();
assert(navCalls.some((c) => c.type === 'switchTab' && c.url.includes('learn')), '可去学易栏');


console.log('\n【11】音乐页与学易页');
pageStack.length = 0;
currentPage = null;
loadModule('pages/music/music.js');
const music = currentPage;
music.onLoad();
music.syncResult();
assert(!!music.data.musicParams && music.data.musicParams.length === 6, '音乐页：六项音乐参数');
assert(music.data.instruments.length === 8, `乐器园八音齐备（实得 ${music.data.instruments.length}）`);
assert(music.data.instruments[0].name && music.data.instruments[0].guaName, '乐器条目含名称与所配卦');
assert(!!music.data.mini, '音乐页挂上浮动播放条状态');

pageStack.length = 0;
currentPage = null;
loadModule('pages/learn/learn.js');
const learn = currentPage;
learn.onLoad();
assert(learn.data.trigrams.length === 8, '学易页：八卦速查八条');
assert(learn.data.hexList.length === 64, `六十四卦全表（实得 ${learn.data.hexList.length}）`);
assert(learn.data.fiveTones.length === 5, '五音五条');
assert(learn.data.twelveLv.length === 12, '十二律十二条');
assert(learn.data.eightTone.length === 8, '八音配卦八条');
assert(learn.data.books.length >= 4, '所据典籍已列');
learn.setData({ hexKw: '泰' });
learn.onHexSearch({ detail: { value: '泰' } });
assert(learn.data.hexList.length >= 1, `搜「泰」有结果（${learn.data.hexList.length} 条）`);
learn.onUpper({ detail: { value: 0 } });
learn.onLower({ detail: { value: 0 } });
assert(!!learn.data.found, '按上下卦找卦：上乾下乾 → 乾');

console.log('\n【11b】波形台共享渲染核心（core/viz-stage.js）');
const stageMod = loadInternal('core/viz-stage.js');
assert(!!stageMod.createStage, '波形台共享模块可加载');
assert(!!stageMod.spectrumFromScore, '频谱推算函数可加载');
assert(!!stageMod.analyze, '频段分析函数可加载');
const spec = stageMod.spectrumFromScore({
  notes: [{ time: 0, dur: 1, midi: 60, vel: 1 }, { time: 0, dur: 1, midi: 72, vel: 0.8 }]
}, 0.5, 48);
assert(spec.length === 48, '频谱推算：48 段');
let mx = 0;
for (let i = 0; i < spec.length; i++) if (spec[i] > mx) mx = spec[i];
assert(mx > 0.5, `频谱由乐谱推算有值（峰值 ${mx.toFixed(2)}）`);
const spec2 = stageMod.spectrumFromScore({ notes: [{ time: 0, dur: 1, midi: 60, vel: 1 }] }, 9, 48);
let mx2 = 0;
for (let i = 0; i < spec2.length; i++) if (spec2[i] > mx2) mx2 = spec2[i];
assert(mx2 === 0, '播放位置之外无能量');

// 频段分析：与网页版同一套公式
const bands = stageMod.analyze(new Uint8Array(256).fill(200));
assert(bands.low > 0 && bands.high > 0, '频段分析有值');

// 波形台实例：状态机与几何
const st = stageMod.createStage();
st.resize(320, 150);
st.setHex([1, 0, 1, 0, 1, 0], [3]);
const g = st.geo();
assert(!!g && g.scale > 0, '波形台几何已建立');
assert(g.rows === 6, '卦体六爻');
st.setFlowState('playing');
st.setSignal({ bins: spec });
assert(st.stats().flowMode === 'playing', '状态机：playing');
st.setFlowState('paused');
assert(st.stats().flowMode === 'paused', '状态机：paused');
st.setFlowState('drain');
assert(st.stats().flowMode === 'drain', '状态机：drain');

// 波形台在「小程序式」环境下能出图（用桩上下文记录绘制调用）
{
  const calls = { fill: 0, stroke: 0, gradient: 0 };
  const stubCtx = new Proxy({}, {
    get(t, k) {
      if (k === 'fillRect' || k === 'strokeRect') return () => { calls.fill++; };
      if (k === 'fill' || k === 'stroke') return () => { calls.stroke++; };
      if (k === 'createLinearGradient' || k === 'createRadialGradient') {
        calls.gradient++;
        return () => ({ addColorStop() {} });
      }
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'beginPath' || k === 'moveTo' || k === 'lineTo' || k === 'closePath'
        || k === 'save' || k === 'restore' || k === 'clip' || k === 'rect'
        || k === 'arc' || k === 'arcTo' || k === 'ellipse' || k === 'setTransform'
        || k === 'translate' || k === 'scale' || k === 'rotate'
        || k === 'clearRect' || k === 'drawImage' || k === 'fillText'
        || k === 'setLineDash' || k === 'quadraticCurveTo' || k === 'bezierCurveTo') {
        return () => {};
      }
      return undefined;
    },
    set() { return true; }
  });
  const st2 = stageMod.createStage();
  st2.attach(stubCtx, 320, 150);
  st2.setHex([1, 0, 1, 0, 1, 0], []);
  st2.setFlowState('playing');
  // 渐入需 2 秒（FLOW_INTRO），故跑 130 帧（≈2.2 秒）才够
  for (let i = 0; i < 130; i++) {
    st2.setSignal({ bins: spec });
    st2.draw(stubCtx, 1 / 60);
  }
  const s2 = st2.stats();
  assert(s2.n > 20, `小程序式环境：丝缕生成 ${s2.n} 条`);
  assert(calls.fill > 100, `小程序式环境：绘制调用充分（fill ${calls.fill} / stroke ${calls.stroke}）`);
  assert(calls.gradient > 20, `小程序式环境：渐变已用（${calls.gradient} 处）`);
  assert(s2.intro >= 0.99, `小程序式环境：渐入完成 ${s2.intro.toFixed(2)}`);
}

/* 小程序端的播放链路校验另见 scripts/verify-mini-audio.js
 * （那一段需等即兴连播首轮编完，走 Promise，单独成脚本更可靠）。 */

console.log('\n【10b】浮动播放条一致性');
{
  // 各页都必须：① 引入 miniplayer 工具 ② data 里有 mini 初始值
  //   ③ onLoad 订阅、onUnload 退订
  // 少了任何一条，浮动播放条在那一页就不显示或状态不更新。
  const fsx = require('fs');
  const pathx = require('path');
  const MProot = pathx.join(__dirname, '..', 'miniprogram', 'pages');
  const pages = ['index', 'detail', 'calendar', 'music', 'learn'];
  for (const pg of pages) {
    const js = fsx.readFileSync(pathx.join(MProot, pg, pg + '.js'), 'utf8');
    const wxml = fsx.readFileSync(pathx.join(MProot, pg, pg + '.wxml'), 'utf8');
    assert(js.indexOf('mini.methods') >= 0, pg + '：已引入 miniplayer 方法');
    assert(js.indexOf('...mini.data') >= 0, pg + '：data 含 mini 初始值');
    assert(js.indexOf('this.miniBind()') >= 0, pg + '：onLoad 订阅播放状态');
    assert(js.indexOf('this.miniUnbind()') >= 0, pg + '：onUnload 退订');
    assert(wxml.indexOf('miniplayer') >= 0, pg + '：wxml 含浮动条模板');
  }
  // 浮动条与标签栏须同宽（否则视觉上不对齐）
  const wxss = fsx.readFileSync(pathx.join(__dirname, '..', 'miniprogram', 'app.wxss'), 'utf8');
  const tbwxss = fsx.readFileSync(pathx.join(__dirname, '..', 'miniprogram', 'custom-tab-bar', 'index.wxss'), 'utf8');
  const miniW = (wxss.match(/[.]miniplayer[^{]*[{][^}]*?width:[ ]*([0-9]+)rpx/) || [])[1];
  const tabW = (tbwxss.match(/[.]tabbar[^{]*[{][^}]*?width:[ ]*([0-9]+)rpx/) || [])[1];
  assert(!!miniW && !!tabW && miniW === tabW,
    '浮动条与标签栏同宽（' + miniW + ' vs ' + tabW + '）');
}

console.log('\n【11】导航补充');
navCalls.length = 0;

console.log('\n【12】分享文案');
const share = index.onShareAppMessage();
assert(!!share.title && !!share.desc, `分享标题：${share.title}`);

console.log('\n【13】清空卦历');
modals.length = 0;
calendar.clearAll();
assert(modals.length > 0, '弹出确认框');
hist.clearHistory();
calendar.refresh();
assert(calendar.data.empty === true, '卦历已清空');

/* ===============================================================
 * 汇总
 * =============================================================== */

console.log('\n' + '='.repeat(46));
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
console.log('='.repeat(46));
process.exit(fail > 0 ? 1 : 0);
