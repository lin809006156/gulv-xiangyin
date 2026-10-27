/**
 * 微信小程序端 · 界面一致性静态检查
 * ---------------------------------------------------------------
 * 为什么需要它
 *   小程序界面的问题（WXML 模板不渲染、图标不切换、样式缺失）
 *   几乎全是**静态可查**的：模板没 import、class 没定义、
 *   事件处理器不存在、图标显隐条件用错字段……
 *   这些不必等用户在真机上撞见才修 —— 本脚本把它们一次性扫出来。
 *
 * 检查项（按一般音乐 / 学习类 App 的验收清单）
 *   ① 模板引用完整性：用了 <template is="X"> 就必须有对应的 <import>
 *   ② 浮动播放条接线：五页都须引入工具 / data 有初始值 / 订阅 / 退订 / 模板
 *   ③ 事件处理器：wxml 里 bind* 的每个名字，在页面 js 里都能找到方法
 *   ④ 样式类：wxml 里用到的 class，都须有对应的 CSS 定义
 *   ⑤ 播放按钮图标：显隐条件必须同时考虑 isPlaying 与 paused
 *      （暂停时 isPlaying 仍为 true，只看它会导致图标永不切换）
 *   ⑥ 布局对齐：浮动播放条与底部标签栏须同宽
 *   ⑦ 页面底部留白：各页都须让开标签栏，避免内容被遮住
 *
 * 用法：node scripts/verify-ui.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  [OK] ' + m); };
const bad = (m) => { fail++; console.log('  [!!] ' + m); };
const assert = (cond, msg) => { if (cond) ok(msg); else bad(msg); };

const PAGES = ['index', 'detail', 'calendar', 'learn', 'music'];

function read(rel) {
  return fs.readFileSync(path.join(MP, rel), 'utf8');
}

/* ---------- 收集所有样式定义 ---------- */
function collectCss() {
  const files = ['app.wxss', 'custom-tab-bar/index.wxss'];
  PAGES.forEach((p) => files.push('pages/' + p + '/' + p + '.wxss'));
  let all = '';
  files.forEach((f) => {
    const full = path.join(MP, f);
    if (fs.existsSync(full)) all += fs.readFileSync(full, 'utf8') + '\n';
  });
  const defined = new Set();
  const re = /\.([a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(all))) defined.add(m[1]);
  return { all, defined };
}

/* ---------- ① 模板引用完整性 ---------- */
function checkTemplateImports() {
  console.log('\n【1】模板引用完整性');
  const files = ['templates/miniplayer.wxml'];
  PAGES.forEach((p) => files.push('pages/' + p + '/' + p + '.wxml'));
  files.forEach((rel) => {
    const s = read(rel);
    const used = [];
    const re = /<template\s+is="([^"]+)"/g;
    let m;
    while ((m = re.exec(s))) used.push(m[1]);
    if (!used.length) return;
    const imported = new Set();
    const re2 = /<import\s+src="([^"]+)"/g;
    while ((m = re2.exec(s))) {
      const src = m[1];
      // 从页面目录出发解析到模板文件，取其模板名
      const abs = path.resolve(path.dirname(path.join(MP, rel)), src);
      if (fs.existsSync(abs)) {
        const ts = fs.readFileSync(abs, 'utf8');
        const re3 = /<template\s+name="([^"]+)"/g;
        let m3;
        while ((m3 = re3.exec(ts))) imported.add(m3[1]);
      }
    }
    used.forEach((name) => {
      assert(imported.has(name),
        rel + '：模板 "' + name + '" 已正确 import');
    });
  });
}

/* ---------- ② 浮动播放条接线 ---------- */
function checkMiniPlayer() {
  console.log('\n【2】浮动播放条接线（五页）');
  PAGES.forEach((pg) => {
    const js = read('pages/' + pg + '/' + pg + '.js');
    const wxml = read('pages/' + pg + '/' + pg + '.wxml');
    const label = pg + '：';
    assert(js.indexOf('mini.methods') >= 0, label + '已引入 miniplayer 方法');
    assert(js.indexOf('...mini.data') >= 0, label + 'data 含 mini 初始值');
    assert(js.indexOf('this.miniBind()') >= 0, label + 'onLoad 订阅播放状态');
    assert(js.indexOf('this.miniUnbind()') >= 0, label + 'onUnload 退订');
    assert(js.indexOf('this.miniSync()') >= 0, label + 'onShow 同步播放状态');
    assert(wxml.indexOf('<template is="miniplayer"') >= 0, label + 'wxml 含浮动条模板');
    assert(wxml.indexOf('templates/miniplayer.wxml') >= 0, label + 'wxml 已 import 浮动条模板');
  });
}

/* ---------- ③ 事件处理器存在性 ---------- */
function checkHandlers() {
  console.log('\n【3】事件处理器存在性');
  PAGES.forEach((pg) => {
    const wxml = read('pages/' + pg + '/' + pg + '.wxml');
    const js = read('pages/' + pg + '/' + pg + '.js');
    const handlers = new Set();
    const re = /bind(?:tap|change|input|confirm|longpress|blur|focus)="([a-zA-Z_][\w]*)"/g;
    let m;
    while ((m = re.exec(wxml))) handlers.add(m[1]);
    const missing = [];
    handlers.forEach((h) => {
      const inPage = new RegExp('(^|[\\s,{])' + h + '\\s*[:(]', 'm').test(js);
      const inMini = js.indexOf('mini.') >= 0 && fs.readFileSync(path.join(MP, 'utils/miniplayer.js'), 'utf8').indexOf(h + '(') >= 0;
      if (!inPage && !inMini) missing.push(h);
    });
    assert(missing.length === 0,
      pg + '：' + handlers.size + ' 个事件处理器齐备' + (missing.length ? '（缺 ' + missing.join('、') + '）' : ''));
  });
}

/* ---------- ④ 样式类定义 ---------- */
function checkStyleClasses(css) {
  console.log('\n【4】样式类定义');
  PAGES.forEach((pg) => {
    const wxml = read('pages/' + pg + '/' + pg + '.wxml');
    const used = new Set();
    const re = /class="([^"]*)"/g;
    let m;
    while ((m = re.exec(wxml))) {
      // 去掉 {{ }} 表达式内的内容（动态类名另算）
      const cleaned = m[1].replace(/\{\{[^}]*\}\}/g, ' ');
      cleaned.split(/\s+/).forEach((c) => { if (c && /^[a-zA-Z][\w-]*$/.test(c)) used.add(c); });
    }
    const missing = [];
    used.forEach((c) => { if (!css.defined.has(c)) missing.push(c); });
    assert(missing.length === 0,
      pg + '：' + used.size + ' 个 class 均有样式' + (missing.length ? '（缺 ' + missing.join('、') + '）' : ''));
  });
}

/* ---------- ⑤ 播放按钮图标的显隐条件 ---------- */
function checkPlayIcons() {
  console.log('\n【5】播放 / 暂停图标显隐条件');
  // 关键：暂停时 player.isPlaying 仍为 true（引擎挂着，只是被挂起）。
  // 故图标显隐必须同时看 isPlaying 与 paused，只看 isPlaying 会导致图标永不切换。
  const targets = [
    { rel: 'pages/music/music.wxml', label: '音乐页主按钮' },
    { rel: 'templates/miniplayer.wxml', label: '浮动播放条' }
  ];
  targets.forEach((t) => {
    const s = read(t.rel);
    const playLine = (s.match(/<view class="ico-play[^\n]*"/) || [''])[0];
    const pauseLine = (s.match(/<view class="ico-pause[^\n]*"/) || [''])[0];
    assert(playLine.indexOf('paused') >= 0 && pauseLine.indexOf('paused') >= 0,
      t.label + '：图标显隐条件已考虑 paused（暂停后会切换）');
    assert(playLine.indexOf('isPlaying') >= 0 && pauseLine.indexOf('isPlaying') >= 0,
      t.label + '：图标显隐条件已考虑 isPlaying');
  });
  // app.js 的 onStateChange 必须把 paused 同步到全局 UI
  const appjs = read('app.js');
  assert(/state === 'paused'/.test(appjs) && /setUi\(\{ paused: true \}\)/.test(appjs),
    "app.js：'paused' 状态已同步到全局 UI");
  assert(/state === 'playing'/.test(appjs) && /paused: false/.test(appjs),
    "app.js：'playing' 状态会清掉 paused 标记");
}

/* ---------- ⑥ 布局对齐 ---------- */
function checkAlignment(css) {
  console.log('\n【6】布局对齐');
  const miniW = (css.all.match(/\.miniplayer\s*\{[^}]*?width:\s*(\d+)rpx/) || [])[1];
  const tabW = (css.all.match(/\.tabbar\s*\{[^}]*?width:\s*(\d+)rpx/) || [])[1];
  assert(!!miniW && !!tabW && miniW === tabW,
    '浮动条与标签栏同宽（' + (miniW || '?') + ' vs ' + (tabW || '?') + '）');
  // 浮动条底边须在标签栏顶边之上
  // 注意：.miniplayer 有两个变体 —— 主规则（浮在标签栏上方）
  // 与 .miniplayer.nobar（非 tabBar 页贴底）。这里取**主规则**的底边，
  // 故排除 nobar 变体，别被 24rpx 那个贴底版本误匹配。
  const miniBottom = (css.all.match(/\.miniplayer\s*\{[^}]*?bottom:[^0-9]*(\d+)rpx/) || [])[1];
  // 标签栏的底边写在 .tabbar-wrap（固定定位的整行容器）上，
  // 胶囊本体 .tabbar 只是它里面的内容 —— 别找错地方。
  const tabBottom = (css.all.match(/\.tabbar-wrap[^{]*[{][^}]*?bottom:[^0-9]*(\d+)rpx/) || [])[1];
  assert(!!miniBottom && !!tabBottom && Number(miniBottom) > Number(tabBottom),
    '浮动条底边高于标签栏（' + miniBottom + ' > ' + tabBottom + '）');
}

/* ---------- ⑦ 底部留白 ---------- */
function checkBottomPadding() {
  console.log('\n【7】页面底部留白');
  PAGES.forEach((pg) => {
    const wxml = read('pages/' + pg + '/' + pg + '.wxml');
    const isTabPage = pg === 'index' || pg === 'learn' || pg === 'music';
    const cls = isTabPage ? 'page-pad' : 'page-pad-nobar';
    assert(wxml.indexOf(cls) >= 0, pg + '：有 ' + cls + ' 底部留白（内容不被标签栏遮住）');
  });
}

/* ---------- ⑧ 播放状态语义 ---------- */
function checkPlaybackSemantics() {
  console.log('\n【8】播放状态语义');
  const player = read('core/player.js');
  // 暂停时不能把 isPlaying 置 false —— 引擎仍在播，只是挂起
  const pauseBody = (player.match(/pause\(\)\s*\{[\s\S]*?\n  \}/) || [''])[0];
  assert(pauseBody.indexOf('this.isPlaying = false') < 0,
    'core/player.js：pause() 不把 isPlaying 置 false（暂停≠停止）');
  assert(pauseBody.indexOf("onStateChange('paused')") >= 0,
    "core/player.js：pause() 发出 'paused' 事件");
  const mini = read('utils/miniplayer.js');
  assert(mini.indexOf('p.pause()') >= 0 && mini.indexOf('p.resume()') >= 0,
    'utils/miniplayer.js：支持暂停与继续');
  assert(/if \(p\.pause\(\)\)/.test(mini) && /if \(p\.resume\(\)\)/.test(mini),
    'utils/miniplayer.js：暂停/继续检查返回值（失败不谎报状态）');

  /* 小程序端专属实现已搬到 utils/audio-backend-mini.js，
     故这两项检查的对象随之改变（平台代码各归其位）。 */
  const backend = read('utils/audio-backend-mini.js');
  assert(backend.length > 0, 'utils/audio-backend-mini.js：小程序端播放后端存在');
  // 小程序端循环开关必须真的生效：引擎的续播判断读的是 this.loop
  assert(/if \(!this\.loop\)/.test(player),
    'core/player.js：小程序端续播受循环开关控制（_onRoundEnded 判 this.loop）');
  assert(/isLoop:\s*\(\)\s*=>\s*self\.loop/.test(player),
    'core/player.js：向后端暴露循环开关');
  // 换 inner 时须继承音量
  assert(/inner\.volume = this\._volume/.test(backend),
    'utils/audio-backend-mini.js：新建音频源继承当前音量');
}

/* ---------- 主流程 ---------- */
console.log('=== 微信小程序端 · 界面一致性静态检查 ===');
const css = collectCss();
checkTemplateImports();
checkMiniPlayer();
checkHandlers();
checkStyleClasses(css);
checkPlayIcons();
checkAlignment(css);
checkBottomPadding();
checkPlaybackSemantics();

console.log('\n' + '='.repeat(50));
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
