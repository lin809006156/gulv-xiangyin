/**
 * 为 core/ 下的模块统一加 IIFE 包裹
 * ---------------------------------------------------------------
 * 原因：浏览器里多个 <script> 共享同一个全局词法作用域，
 * 两个文件都写 `const TRIGRAMS = ...` 会抛
 *   SyntaxError: Identifier 'TRIGRAMS' has already been declared
 * 用 IIFE 包裹后，顶层 const 变成函数作用域，模块间彻底隔离。
 *
 * 用法：node scripts/wrap-iife.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CORE = path.resolve(__dirname, '..', 'core');
const FILES = [
  'data.js', 'hexagram.js', 'music.js',
  'render.js', 'player.js', 'bootstrap.js'
];

FILES.forEach((f) => {
  const p = path.join(CORE, f);
  let src = fs.readFileSync(p, 'utf8');

  if (src.includes('__IC_IIFE__')) {
    console.log(`[跳过] ${f} 已包裹`);
    return;
  }

  // 1. 在 'use strict'; 之后插入 IIFE 开头
  const strictIdx = src.indexOf("'use strict';");
  if (strictIdx === -1) {
    console.error(`[错误] ${f} 找不到 'use strict'`);
    return;
  }
  const afterStrict = strictIdx + "'use strict';".length;
  src = src.slice(0, afterStrict) +
    '\n\n/* __IC_IIFE__ */\n(function () {\n' +
    src.slice(afterStrict);

  // 2. 在文件末尾追加 IIFE 结尾
  src = src.trimEnd() + '\n\n})();\n';

  fs.writeFileSync(p, src, 'utf8');
  console.log(`[OK] ${f}`);
});

console.log('\n完成');
