/**
 * 核心同步自检
 * ---------------------------------------------------------------
 * 确认三处核心代码完全一致：
 *   core/            ← 唯一真相源
 *   web/core/        ← 网页版副本
 *   miniprogram/core/← 小程序副本
 *
 * 任何一处对不上就报错退出（CI 或提交前跑）。
 * 用法：node scripts/check-sync.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'core');
const TARGETS = [
  { name: 'web/core', dir: path.join(ROOT, 'web', 'core') },
  { name: 'miniprogram/core', dir: path.join(ROOT, 'miniprogram', 'core') }
];

function listFiles(dir) {
  const out = [];
  (function walk(d, rel) {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const r = rel ? rel + '/' + name : name;
      if (fs.statSync(full).isDirectory()) walk(full, r);
      else out.push(r);
    }
  })(dir, '');
  return out.sort();
}

function read(p) {
  try { return fs.readFileSync(p); } catch (e) { return null; }
}

const srcFiles = listFiles(SRC);
let problems = 0;

console.log('核心同步自检');
console.log('  真相源 core/ 共 %d 个文件\n', srcFiles.length);

for (const t of TARGETS) {
  if (!fs.existsSync(t.dir)) {
    console.log('  [X] %s 目录不存在', t.name);
    problems++;
    continue;
  }
  const tgtFiles = new Set(listFiles(t.dir));
  let diff = 0, missing = 0, extra = 0;

  for (const f of srcFiles) {
    if (!tgtFiles.has(f)) { console.log('  [X] %s 缺少 %s', t.name, f); missing++; diff++; continue; }
    const a = read(path.join(SRC, f));
    const b = read(path.join(t.dir, f));
    if (!a.equals(b)) { console.log('  [X] %s 内容不一致：%s', t.name, f); diff++; }
  }
  for (const f of tgtFiles) {
    if (!srcFiles.includes(f)) { console.log('  [X] %s 多出文件：%s（真相源已删，请执行 sync）', t.name, f); extra++; diff++; }
  }

  if (diff === 0) {
    console.log('  [OK] %s：%d 个文件全部一致', t.name, srcFiles.length);
  } else {
    problems++;
    console.log('  --> %s 有 %d 处差异（缺 %d / 多 %d），请执行：node scripts/sync-core.js\n',
      t.name, diff, missing, extra);
  }
}

if (problems) {
  console.log('同步自检未通过。');
  process.exit(1);
}
console.log('\n同步自检通过：三处核心代码一致。');
