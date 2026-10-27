/**
 * 微信小程序端 · 代码包体积校验
 * ---------------------------------------------------------------
 * 微信开发者工具会对「图片、音频等静态资源超过 200K」给出提示，
 * 影响代码包加载速度。静态资源体积是**可以静态查出来**的，
 * 不必等开发者工具报出来才处理。
 *
 * 检查项：
 *   ① 小程序包里不得有超过 200K 的静态资源
 *   ② 总体积不得逼近上限（主包 2M / 整包 20M，留出余量）
 *   ③ 大文件若确有必要，须在 packOptions.ignore 中被排除
 *   ④ 被 ignore 的目录/文件必须真的存在（配错了等于没配）
 *
 * 用法：node scripts/verify-package.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');

/* 微信的限制 */
const SINGLE_LIMIT = 200 * 1024;   // 单个静态资源 200K
const MAIN_LIMIT = 2 * 1024 * 1024; // 主包 2M
const TOTAL_LIMIT = 20 * 1024 * 1024;// 整包 20M
/* 留出余量：代码包还含编译产物等，给 80% 作红线 */
const WARN_RATIO = 0.8;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  [OK] ' + m); };
const bad = (m) => { fail++; console.log('  [!!] ' + m); };
const assert = (c, m) => { if (c) ok(m); else bad(m); };

/** 递归收集目录下的文件（相对路径） */
function walk(dir, base, out) {
  const list = out || [];
  if (!fs.existsSync(dir)) return list;
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, list);
    else list.push(path.relative(base, full).replace(/\\/g, '/'));
  });
  return list;
}

/** packOptions.ignore 覆盖到的路径前缀 */
function ignoredPrefixes(cfg) {
  const out = [];
  const ig = (cfg && cfg.packOptions && cfg.packOptions.ignore) || [];
  ig.forEach((item) => {
    if (!item || !item.value) return;
    let v = String(item.value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    if (item.type === 'folder' && !v.endsWith('/')) v += '/';
    out.push(v);
  });
  return out;
}

function isIgnored(rel, prefixes) {
  return prefixes.some((p) => rel === p.replace(/\/$/, '') || rel.startsWith(p));
}

console.log('=== 微信小程序端 · 代码包体积校验 ===\n');

/* ---------- 读取配置 ---------- */
const cfgPath = path.join(MP, 'project.config.json');
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
const prefixes = ignoredPrefixes(cfg);

console.log('【1】packOptions.ignore 配置');
assert(prefixes.length > 0,
  `已配置 ignore（${prefixes.length} 项）：${prefixes.join('、') || '无'}`);

/* ---------- 逐文件检查 ---------- */
console.log('\n【2】静态资源体积');
const all = walk(MP, MP);
// 代码文件不计（.js/.json/.wxml/.wxss 是代码，不受 200K 静态资源限制）
const CODE_EXT = ['.js', '.json', '.wxml', '.wxss'];
const assets = all.filter((rel) => !CODE_EXT.includes(path.extname(rel).toLowerCase()));

let packSize = 0;
let ignoredSize = 0;
const oversized = [];

assets.forEach((rel) => {
  const size = fs.statSync(path.join(MP, rel)).size;
  if (isIgnored(rel, prefixes)) { ignoredSize += size; return; }
  packSize += size;
  if (size > SINGLE_LIMIT) {
    oversized.push({ rel, size });
  }
});

if (oversized.length === 0) {
  ok(`无超过 ${Math.round(SINGLE_LIMIT / 1024)}K 的静态资源（共检查 ${assets.length} 个文件）`);
} else {
  oversized.forEach((o) => {
    bad(`${o.rel} 为 ${(o.size / 1024).toFixed(1)}K，超过 ${Math.round(SINGLE_LIMIT / 1024)}K`);
  });
  bad(`请把它移出代码包（放到仓库根的 brand/ 等目录），或在 packOptions.ignore 中排除`);
}

/* ---------- 总体积 ---------- */
console.log('\n【3】代码包体积');
const totalAll = assets.reduce((s, rel) => s + fs.statSync(path.join(MP, rel)).size, 0);
ok(`静态资源合计 ${(totalAll / 1024).toFixed(1)}K（计入包内约 ${(packSize / 1024).toFixed(1)}K，` +
   `已 ignore ${(ignoredSize / 1024).toFixed(1)}K）`);

const mainWarn = MAIN_LIMIT * WARN_RATIO;
assert(packSize < mainWarn,
  `计入包的静态资源 ${(packSize / 1024).toFixed(1)}K < 主包红线 ${(mainWarn / 1024 / 1024).toFixed(1)}M`);
assert(totalAll < TOTAL_LIMIT * WARN_RATIO,
  `全部静态资源 ${(totalAll / 1024 / 1024).toFixed(2)}M < 整包红线 ${(TOTAL_LIMIT * WARN_RATIO / 1024 / 1024).toFixed(0)}M`);

/* ---------- ignore 配置是否有效 ---------- */
console.log('\n【4】ignore 配置有效性');
prefixes.forEach((p) => {
  const dir = path.join(MP, p.replace(/\/$/, ''));
  assert(fs.existsSync(dir),
    `ignore 的「${p}」确实存在（配错了等于没配）`);
});

/* ---------- 关键资源必须在包里 ---------- */
console.log('\n【5】关键文件未被误排除');
['core/data.js', 'core/player.js', 'core/viz-stage.js', 'core/taiji.js',
 'pages/index/index.wxml', 'pages/music/music.wxml', 'pages/learn/learn.wxml',
 'app.js', 'app.json', 'app.wxss'].forEach((rel) => {
  assert(fs.existsSync(path.join(MP, rel)) && !isIgnored(rel, prefixes),
    `${rel} 在包内且未被排除`);
});

console.log('\n' + '='.repeat(50));
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
