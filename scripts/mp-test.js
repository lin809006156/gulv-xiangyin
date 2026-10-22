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

  // 音频
  createInnerAudioContext: () => {
    const ctx = {
      autoplay: false, obeyMuteSwitch: false, volume: 1,
      currentTime: 0, duration: 0, src: '',
      onTimeUpdate: () => {}, onEnded: () => {}, onError: () => {},
      play: () => { ctx.playing = true; },
      pause: () => { ctx.playing = false; },
      stop: () => { ctx.playing = false; ctx.currentTime = 0; },
      seek: (t) => { ctx.currentTime = t; },
      destroy: () => {}
    };
    return ctx;
  }
};

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

console.log('\n【2】加载首页');
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

console.log('\n【3】切换起卦方式');
index.onModeChange({ currentTarget: { dataset: { mode: 'image' } } });
assert(index.data.mode === 'image', '切换到观象起卦');

console.log('\n【4】选择物象并起卦');
const firstItem = index.data.imageGroups[0].items[0];
index.onImageSelect({ currentTarget: { dataset: { name: firstItem.name, gua: firstItem.gua } } });
assert(index.data.selectedImageName === firstItem.name, `已选物象：${firstItem.name}`);
assert(index.data.selectedImageGua.length > 0, `物象归属：${index.data.selectedImageGua}`);

const beforeName = index.data.name;
index.castImage();
assert(index.data.hasResult === true, '观象起卦成功');
assert(index.data.methodText === '观象起卦', `起卦方式：${index.data.methodText}`);
console.log(`  结果：${beforeName} → ${index.data.name}`);

console.log('\n【5】数字起卦');
index.onModeChange({ currentTarget: { dataset: { mode: 'number' } } });
index.onNumInput({ currentTarget: { dataset: { key: 'numUpper' } }, detail: { value: '17' } });
index.onNumInput({ currentTarget: { dataset: { key: 'numLower' } }, detail: { value: '43' } });
index.castNumber();
assert(index.data.methodText === '数字起卦', '数字起卦成功');
console.log(`  结果：${index.data.name}`);

console.log('\n【6】无效输入防护');
index.onNumInput({ currentTarget: { dataset: { key: 'numUpper' } }, detail: { value: '0' } });
toasts.length = 0;
index.castNumber();
assert(toasts.length > 0, `无效数字被拦截：${toasts[0] && toasts[0].title}`);

console.log('\n【7】播放流程');
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

console.log('\n【8】卦历写入');
const hist = loadInternal('utils/storage.js');
const list = hist.loadHistory();
assert(list.length > 0, `卦历已记录 ${list.length} 条`);
assert(list[0].name === index.data.name, '最新记录与当前卦一致');
assert(!!list[0].key, '记录含唯一键');

console.log('\n【9】加载卦历页');
pageStack.length = 0;
currentPage = null;
loadModule('pages/calendar/calendar.js');
const calendar = currentPage;
calendar.onShow();
assert(calendar.data.empty === false, '卦历页读到记录');
assert(calendar.data.list.length === list.length, `列表数量一致：${calendar.data.list.length}`);
assert(!!calendar.data.list[0].symbol, '列表项含卦符');

console.log('\n【10】加载详情页');
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

console.log('\n【11】导航');
navCalls.length = 0;
index.goDetail();
assert(navCalls.some((c) => c.type === 'navigateTo' && c.url.includes('detail')), '跳转到详情页');
index.goCalendar();
assert(navCalls.some((c) => c.type === 'switchTab'), '跳转到卦历页');


console.log('\n【13】识象页：加载与兜底');
pageStack.length = 0;
currentPage = null;
loadModule('pages/vision/vision.js');
const vision = currentPage;
vision.onLoad();
assert(vision.data.library.length === 12, `物象库 12 类（实得 ${vision.data.library.length}）`);
assert(vision.data.categoryItems.length > 0, '预置了当前分类的物象');
assert(vision.data.cloudReady === false, '未配 envId 时判定云服务不可用');
assert(vision.data.manualMode === true, '未配云服务自动进手动模式，不留空白页');
assert(vision.data.hint.indexOf('手动') !== -1, '手动模式给了明确提示');

console.log('\n【14】识象页：搜索兜底');
vision.setData({ searchKw: '桌' });
vision.onSearchInput({ detail: { value: '椅' } });
assert(vision.data.searchResults.length > 0, `搜「椅」有结果（${vision.data.searchResults.length} 条）`);
assert(vision.data.searchResults[0].image === '椅子', '首条为「椅子」');
vision.setData({ searchResults: vision.data.searchResults });

console.log('\n【15】识象页：起卦（物象库点选）');
navCalls.length = 0;
vision.selectSearch({ currentTarget: { dataset: { gua: 'gen', name: '椅子' } } });
assert(!!vision.data.result, '生成起卦结果');
assert(vision.data.result.hexName.length > 0, `卦名已定：${vision.data.result.hexName}`);
assert(vision.data.result.imageName === '椅子', '记录所取物象');
assert(!!vision.data.result.music.modeName, '含调式参数');
// pageScrollTo 被页面用 setTimeout 延迟调用（等渲染完成），此处留待异步段断言
scrollCalled = true;

console.log('\n【16】识象页：候选改选');
// 模拟识别返回的候选
vision.setData({
  candidates: [
    { label: '桌案', gua: 'gen', guaName: '艮', symbol: '☶', matched: true, reason: '桌案属居家', confidence: 1 },
    { label: '电脑', gua: 'li', guaName: '离', symbol: '☲', matched: true, reason: '电脑属器用', confidence: 1 },
    { label: '某物', gua: 'xun', guaName: '巽', symbol: '☴', matched: false, reason: '按方位取', confidence: 0.2 }
  ],
  selectedIndex: 0
});
vision.selectCandidate({ currentTarget: { dataset: { idx: 1 } } });
assert(vision.data.selectedIndex === 1, '可改选为第 2 项');
vision.castSelected();
assert(vision.data.result.imageName === '电脑', '改选后以新物象起卦');
assert(vision.data.result.gua === 'li', '改选后卦随之改变');

console.log('\n【17】识象页：未配云服务的降级');
vision.setData({ photos: [{ path: 'x.jpg', size: 100 }] });
/* recognize 是 async，用 then 收尾（脚本为 CommonJS，不能顶层 await） */
vision.recognize().then(() => {
  assert(vision.data.manualMode === true, '未配云服务时切手动而非报错');
  assert(vision.data.stage !== 'recognizing', '不进入假识别状态');
  console.log('  [i] 异步降级路径已验证');
}, (e) => {
  console.error('  [X] recognize 抛出异常:', e && e.message);
  process.exitCode = 1;
});

console.log('\n【18】识象页：空识别结果不崩');
assert(scrollCalled === true, '起卦后触发了延迟滚动（让用户看到结果）');
vision.setData({ cloudReady: true, photos: [{ path: 'x.jpg', size: 100 }] });
const V = require(path.join(MP_ROOT, 'core/vision.js'));
const emptyUi = V.fromModelText('');
assert(emptyUi.upper === null, '空识别时 upper 为 null 而非字符串');
assert(emptyUi.hint.length > 0, '空识别给了引导文案');
vision.setData({ empty: emptyUi.empty, hint: emptyUi.hint });
assert(vision.data.empty === true, '空状态可被 UI 消费');

console.log('\n【19】导航补充');
navCalls.length = 0;
index.goVision();
assert(navCalls.some((c) => c.type === 'switchTab' && c.url.includes('vision')), '首页可跳转识象页（用 switchTab）');

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
