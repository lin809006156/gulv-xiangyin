/**
 * 分层结构自检
 * ---------------------------------------------------------------
 * 保证「平台专属代码不回流进 core/」这条约定不被破坏。
 *
 * 检查四件事：
 *   ① core/ 下的文件不得出现平台 API（Web Audio / wx.* / InnerAudioContext）
 *   ② core/player.js 的平台分支数不得超过阈值（现为 1：Node 守卫）
 *   ③ 平台后端文件必须各在其位：网页端在 web/js/、小程序端在 miniprogram/utils/
 *   ④ 平台后端不得出现在 core/ 目录里（那会被同步到两端，等于又耦合了）
 *
 * 用法：node scripts/verify-layering.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  [OK] ' + m); };
const err = (m) => { fail++; console.log('  [!!] ' + m); };
const assert = (cond, msg) => { if (cond) ok(msg); else err(msg); };

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function listFiles(dir) {
  const out = [];
  (function walk(d, rel) {
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach((name) => {
      const full = path.join(d, name);
      const r = rel ? rel + '/' + name : name;
      if (fs.statSync(full).isDirectory()) walk(full, r);
      else out.push(r);
    });
  })(dir, '');
  return out.sort();
}

console.log('=== 分层结构自检 ===\n');

/* ---------- ① core/ 不得含平台 API ---------- */
console.log('【1】core/ 目录的平台 API 隔离');
{
  // 平台 API 的特征串。注释里的说明文字不算命中，故逐行剔除注释再匹配。
  const PLATFORM_PATTERNS = [
    { re: /\bAudioContext\b/, name: 'Web Audio AudioContext' },
    { re: /\bwebkitAudioContext\b/, name: 'Web Audio webkitAudioContext' },
    { re: /\bcreateGain\b/, name: 'Web Audio createGain' },
    { re: /\bcreateAnalyser\b/, name: 'Web Audio createAnalyser' },
    { re: /\bcreateBufferSource\b/, name: 'Web Audio createBufferSource' },
    { re: /\bcreateInnerAudioContext\b/, name: 'wx.createInnerAudioContext' },
    { re: /\bgetFileSystemManager\b/, name: 'wx.getFileSystemManager' },
    { re: /\bcreateWebAudioContext\b/, name: 'wx.createWebAudioContext' }
  ];

  const files = listFiles(path.join(ROOT, 'core')).filter((f) => f.endsWith('.js'));
  let hits = 0;
  files.forEach((f) => {
    const lines = read('core/' + f).split('\n');
    lines.forEach((line, i) => {
      // 去掉行注释与块注释后��检测，避免说明文字造成误报
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      if (/^\s*\*/.test(line) || /^\s*\/\*/.test(line)) return;
      PLATFORM_PATTERNS.forEach(({ re, name }) => {
        if (re.test(code)) {
          hits++;
          err(`core/${f}:${i + 1} 出现平台 API（${name}）—— 平台代码应归各端后端`);
        }
      });
    });
  });
  if (!hits) ok(`core/ 共 ${files.length} 个文件，无任何平台 API（Web Audio / wx.*）`);
}

/* ---------- ② player.js 平台分支数 ---------- */
console.log('\n【2】core/player.js 的平台分支数');
{
  const src = read('core/player.js');
  // 只统计「作为条件判断出现」的平台常量，不含定义行与导出行
  const branches = src.split('\n').filter((l) => {
    if (/^\s*const\s+(IS_MINIPROGRAM|IS_NODE)\s*=/.test(l)) return false;
    if (/^\s*Player,\s*fmtTime/.test(l)) return false;
    if (/^\s*\/\//.test(l) || /^\s*\*/.test(l)) return false;
    return /\bIS_MINIPROGRAM\b|\bIS_NODE\b/.test(l);
  });
  assert(branches.length <= 1,
    `core/player.js：平台分支 ${branches.length} 处（阈值 1，仅允许 Node 守卫）`);
  if (branches.length === 1) {
    ok('唯一一处分支是 Node 环境守卫（Node 只渲染不播放）');
  }
}

/* ---------- ③ 后端各在其位 ---------- */
console.log('\n【3】平台后端各在其位');
{
  assert(fs.existsSync(path.join(ROOT, 'web/js/audio-backend-web.js')),
    'web/js/audio-backend-web.js：网页端后端存在');
  assert(fs.existsSync(path.join(ROOT, 'miniprogram/utils/audio-backend-mini.js')),
    'miniprogram/utils/audio-backend-mini.js：小程序端后端存在');
  assert(fs.existsSync(path.join(ROOT, 'core/backend.js')),
    'core/backend.js：后端契约与空后端存在');

  const web = read('web/js/audio-backend-web.js');
  const mini = read('miniprogram/utils/audio-backend-mini.js');

  assert(/class WebBackend/.test(web), '网页端后端导出 WebBackend');
  assert(/class MiniBackend/.test(mini), '小程序端后端导出 MiniBackend');
  assert(/liveAmbient\s*=\s*true/.test(web), '网页端后端声明支持实时音层总线');
  assert(/liveAmbient\s*=\s*false/.test(mini), '小程序端后端声明音层烘进 PCM');
  assert(/worker\s*=\s*true/.test(web), '网页端后端声明支持后台 Worker');
  assert(/worker\s*=\s*false/.test(mini), '小程序端后端声明无 Worker');

  // 两端各自注入自己的后端
  assert(/backend:\s*new window\.ICWebBackend\.WebBackend\(\)/.test(read('web/js/app.js')),
    'web/js/app.js：注入网页端后端');
  assert(/backend:\s*new MiniBackend\(\)/.test(read('miniprogram/app.js')),
    'miniprogram/app.js：注入小程序端后端');
}

/* ---------- ④ 后端不得在 core/ ---------- */
console.log('\n【4】平台后端不在 core/ 目录');
{
  const coreFiles = listFiles(path.join(ROOT, 'core')).map((f) => f.toLowerCase());
  const bad = coreFiles.filter((f) => /backend-(web|mini)\.js$/.test(f));
  assert(bad.length === 0,
    'core/ 下无 platform 专属后端文件（否则会被同步到两端，重新耦合）');
}

console.log('\n' + '='.repeat(46));
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
console.log('='.repeat(46));
process.exit(fail > 0 ? 1 : 0);
