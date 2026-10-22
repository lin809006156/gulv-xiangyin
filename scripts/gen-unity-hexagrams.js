/**
 * 由 core/data.js 生成 Unity 侧的卦象数据表
 * ---------------------------------------------------------------
 * 产出：unity/Assets/HexagramVFX/Scripts/HexagramData.cs
 *   HexagramInfo：卦序、卦名、卦符、上下卦 key、六爻阴阳（自下而上，1=阳）、
 *                 卦德与卦辞（供 UI 标注用）
 *   TRIGRAM_LINES：八经卦的三爻（自下而上）
 *
 * 数据源与网页/小程序端同源（core/data.js），故三端卦象完全一致。
 * 用法：node scripts/gen-unity-hexagrams.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const D = require('../core/data.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'unity', 'Assets', 'HexagramVFX', 'Scripts', 'HexagramData.cs');

const TRIGRAM_ORDER = ['qian', 'kun', 'zhen', 'xun', 'kan', 'li', 'gen', 'dui'];

function trigramName(key) {
  return D.TRIGRAMS[key].name;
}

const lines = [];
lines.push('// 本文件由 scripts/gen-unity-hexagrams.js 自动生成，请勿手改。');
lines.push('// 数据源：core/data.js（与网页端、小程序端同源）');
lines.push('');
lines.push('using System.Collections.Generic;');
lines.push('using UnityEngine;');
lines.push('');
lines.push('namespace HexagramVFX');
lines.push('{');
lines.push('    /// <summary>单卦信息</summary>');
lines.push('    [System.Serializable]');
lines.push('    public struct HexagramInfo');
lines.push('    {');
lines.push('        public int Number;        // 卦序 1..64');
lines.push('        public string Name;       // 卦名，如「地天泰」');
lines.push('        public string Symbol;     // 卦符，如「䷊」');
lines.push('        public string UpperKey;   // 上卦经卦 key');
lines.push('        public string LowerKey;   // 下卦经卦 key');
lines.push('        public string UpperName;  // 上卦名');
lines.push('        public string LowerName;  // 下卦名');
lines.push('        public string Virtue;     // 卦德');
lines.push('        public string Gua;        // 卦辞');
lines.push('        /// <summary>六爻，自下而上（索引 0 = 初爻），1 = 阳、0 = 阴</summary>');
lines.push('        public int[] Lines;');
lines.push('    }');
lines.push('');
lines.push('    /// <summary>六十四卦数据（与 core/data.js 同源）</summary>');
lines.push('    public static class HexagramData');
lines.push('    {');
lines.push('        /// <summary>八经卦三爻（自下而上）</summary>');
lines.push('        public static readonly Dictionary<string, int[]> TrigramLines = new Dictionary<string, int[]>');
lines.push('        {');
TRIGRAM_ORDER.forEach((k) => {
  const l = D.TRIGRAMS[k].lines;
  lines.push(`            { "${k}", new int[] { ${l[0]}, ${l[1]}, ${l[2]} } },`);
});
lines.push('        };');
lines.push('');
lines.push('        /// <summary>六十四卦，索引 0 对应卦序 1</summary>');
lines.push('        public static readonly List<HexagramInfo> All = new List<HexagramInfo>');
lines.push('        {');
D.HEXAGRAMS.forEach((h) => {
  const l = D.getSixLines(h);
  const sym = h.symbol || '';
  lines.push(`            new HexagramInfo { Number = ${h.n}, Name = "${h.name}", Symbol = "${sym}",`);
  lines.push(`                UpperKey = "${h.upper}", LowerKey = "${h.lower}",`);
  lines.push(`                UpperName = "${trigramName(h.upper)}", LowerName = "${trigramName(h.lower)}",`);
  lines.push(`                Virtue = "${h.virtue}", Gua = "${h.gua}",`);
  lines.push(`                Lines = new int[] { ${l[0]}, ${l[1]}, ${l[2]}, ${l[3]}, ${l[4]}, ${l[5]} } },`);
});
lines.push('        };');
lines.push('');
lines.push('        /// <summary>按卦序取卦（1..64），越界则回落到乾</summary>');
lines.push('        public static HexagramInfo Get(int number)');
lines.push('        {');
lines.push('            int i = Mathf.Clamp(number, 1, All.Count) - 1;');
lines.push('            return All[i];');
lines.push('        }');
lines.push('    }');
lines.push('}');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`[OK] 已生成 ${path.relative(ROOT, OUT)}（${D.HEXAGRAMS.length} 卦）`);
