'use strict';

/* ===============================================================
 * core/recognize.js —— 识象归一层
 *
 * 职责：把「AI 视觉模型输出的自由文本」与「用户口语」，
 *       归一到物象库的标准物象，并给出可用性说明与候选卦。
 *
 * 设计原则（针对"不要让用户不知道选什么"）：
 *  1. 永不失败。任何输入都能落到某个卦上，用户永远拿得到结果。
 *  2. 归一失败不是错误路径，而是「兜底卦」——按八卦方位取，
 *     并在 UI 上说明"没认出来，按方位取"，不假装识别成功。
 *  3. 同一物象对应多候选时（如「灯」可归离/巽），返回带理由的候选，
 *     让用户一眼看懂为什么是这个卦。
 *  4. 信任《说卦传》的物性，不按常识猜。桌子归艮（桌案、门阙），
 *     不因"餐桌有食物"而归坤。
 * =============================================================== */

(function () {

const { TRIGRAMS, TRIGRAM_KEYS, IMAGE_LIBRARY, IMAGE_ALIAS } =
  require('./bootstrap.js').loadData();

/* ===============================================================
 * 一、物象索引
 * =============================================================== */

/** 标准物象名 → { gua, category } */
const IMAGE_INDEX = (function build () {
  const idx = new Map();
  IMAGE_LIBRARY.forEach(function (g) {
    g.items.forEach(function (it) {
      idx.set(it.name, { name: it.name, gua: it.gua, category: g.category });
    });
  });
  return idx;
})();

/** 小写别名表 → [物象名, 卦key]，查询时大小写与空格不敏感 */
const ALIAS_LOWER = (function build () {
  const m = new Map();
  Object.keys(IMAGE_ALIAS).forEach(function (k) {
    const key = k.toLowerCase().trim();
    // 先到先得：中文条目优先（对象定义顺序里中文在前）
    if (!m.has(key)) m.set(key, IMAGE_ALIAS[k]);
  });
  return m;
})();

/* ===============================================================
 * 二、文本清洗
 * =============================================================== */

/**
 * 清洗 AI 输出：去编号、去标点、去修饰语、只留核心名词
 * 例："1. 一张木制桌子" → "木制桌子" → 再抽 "桌子"
 * @param {string} raw
 * @returns {string}
 */
function cleanLabel(raw) {
  let s = String(raw == null ? '' : raw);
  // 去掉列表序号、引号、括号注释
  s = s.replace(/^\s*[\d一二三四五六七八九十]+[.、)）]\s*/, '');
  s = s.replace(/[""''「」【】\[\]]/g, '');
  s = s.replace(/[（(].*?[)）]/g, '');
  // 去掉"一张""一个""木制的""蓝色的"等修饰
  s = s.replace(/^(一张|一个|一只|一把|一块|一根|一片|那[张个只把]|这[张个只把]|有[一]?[张个只把])\s*/, '');
  s = s.replace(/(木制|木质|金属|塑料|玻璃|布艺|皮革|陶瓷|不锈钢|铝合金|的)$/g, '');
  s = s.replace(/[。，,、;；:：!！?？\s]+$/g, '');
  return s.trim();
}

/* ===============================================================
 * 三、归一
 * =============================================================== */

/** 尝试从长文本中抽出已收录的核心词（如 "木制桌子" → 找到 "桌子"） */
function extractKnownWord(text) {
  const t = text.toLowerCase();
  let best = null;
  ALIAS_LOWER.forEach(function (v, k) {
    if (t.indexOf(k) !== -1) {
      // 取最长的匹配（"空气净化器" 优先于 "器"）
      if (!best || k.length > best.length) best = { key: k, val: v };
    }
  });
  return best;
}

/**
 * 归一单个识别结果
 * @param {string} raw AI 或用户输入的原始词
 * @returns {object} { input, matched, image, gua, method, reason, confidence }
 */
function normalizeOne(raw) {
  const cleaned = cleanLabel(raw);
  const low = cleaned.toLowerCase();

  // 路径1：精确命中别名表
  const hit = ALIAS_LOWER.get(low);
  if (hit && hit[1] && IMAGE_INDEX.has(hit[0])) {
    const img = IMAGE_INDEX.get(hit[0]);
    return {
      input: raw,
      cleaned,
      matched: true,
      image: img.name,
      category: img.category,
      gua: hit[1],
      method: 'alias',
      reason: '「' + cleaned + '」对应物象「' + img.name + '」，属' + img.category,
      confidence: 1
    };
  }

  // 路径2：精确命中物象库标准名
  if (IMAGE_INDEX.has(cleaned)) {
    const img = IMAGE_INDEX.get(cleaned);
    return {
      input: raw,
      cleaned,
      matched: true,
      image: img.name,
      category: img.category,
      gua: img.gua,
      method: 'exact',
      reason: '「' + cleaned + '」是物象库标准物象，属' + img.category,
      confidence: 1
    };
  }

  // 路径3：长文本中抽词（如 "一个木制书架" → "书架"）
  const sub = extractKnownWord(cleaned);
  if (sub && sub.val[1] && IMAGE_INDEX.has(sub.val[0])) {
    const img = IMAGE_INDEX.get(sub.val[0]);
    // 抽词命中的可信度按"命中核心词在原句中的占比"给。
    // 不能只看句子长短——"空椅子"三个字虽短，但它就是完整的画面描述，
    // 而"一把木制椅子和一堆杂物"里椅子只是主体之一。
    // 故以命中词长度占清洗后长度的比例为主，并设下限避免配角喧宾夺主。
    const ratio = sub.key.length / Math.max(1, cleaned.length);
    const conf = Math.min(0.92, 0.6 + 0.35 * ratio);
    return {
      input: raw,
      cleaned,
      matched: true,
      image: img.name,
      category: img.category,
      gua: sub.val[1],
      method: 'substring',
      reason: '从「' + cleaned + '」中识别出物象「' + img.name + '」',
      confidence: Math.round(conf * 100) / 100
    };
  }

  // 路径4：兜底 —— 按八卦方位取，不假装识别成功
  const fallbackGua = fallbackByHash(cleaned);
  const t = TRIGRAMS[fallbackGua];
  return {
    input: raw,
    cleaned,
    matched: false,
    image: null,
    category: null,
    gua: fallbackGua,
    method: 'fallback',
    reason: '「' + (cleaned || raw) + '」不在物象库中，按方位取' + t.name + '卦（' + t.symbol + '）',
    confidence: 0.2
  };
}

/** 确定性哈希：同一输入永远得到同一卦，保证可复现 */
function fallbackByHash(s) {
  const str = String(s || '无');
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return TRIGRAM_KEYS[h % TRIGRAM_KEYS.length];
}

/* ===============================================================
 * 四、多元素归一 —— 拍照识象的主入口
 * =============================================================== */

/**
 * 归一整份识别结果
 * @param {string[]|object[]} labels AI 输出的元素清单，可为字符串数组，
 *        或 { name, confidence, box } 对象数组
 * @param {object} opts
 *        - now: 起卦时间，默认当前
 *        - upperGua: 指定上卦（通常取置信度最高的那个）
 * @returns {object} { items, upper, hexes, primary, degrade }
 */
function normalizeAll(labels, opts) {
  const o = opts || {};
  const arr = (Array.isArray(labels) ? labels : []).filter(Boolean);
  if (!arr.length) {
    return { items: [], upper: null, hexes: [], primary: null, degrade: 'empty' };
  }

  const items = arr.map(function (raw) {
    const name = typeof raw === 'string' ? raw : (raw.name || raw.label || raw.text || '');
    const aiConf = typeof raw === 'object' && raw ? (raw.confidence || 0) : 0;
    const r = normalizeOne(name);
    // AI 自评置信度与归一置信度取较低者，宁可保守
    if (aiConf > 0 && aiConf < 1) r.confidence = Math.min(r.confidence, aiConf);
    return r;
  });

  // 上卦选取：AI 通常按"画面显著性"排序，第一项往往就是主体物。
  // 因此综合 归一置信度 与 位置权重（前者为主，后者做微调），
  // 而不是只看置信度——否则"一杯咖啡"可能压过"一张桌子"。
  let upperItem = null;
  const good = items.filter(function (i) { return i.matched; });
  good.forEach(function (it, idx) {
    const posWeight = 1 - idx / Math.max(1, good.length) * 0.35;
    it._rank = it.confidence * posWeight;
  });
  if (good.length) {
    good.sort(function (a, b) { return b._rank - a._rank; });
    upperItem = good[0];
  } else {
    upperItem = items[0];
  }
  // 清理内部排序字段
  items.forEach(function (i) { delete i._rank; });

  return {
    items,
    upper: upperItem.image,
    upperGua: upperItem.gua,
    upperReason: upperItem.reason,
    degrade: good.length ? null : 'all-fallback'
  };
}

/* ===============================================================
 * 五、面向 UI 的辅助：可选项整理
 * =============================================================== */

/**
 * 把归一结果整理成 UI 可直接渲染的候选列表
 * 去重同卦、标注是否兜底、按可信度排序
 * @param {object} result normalizeAll 的返回值
 * @returns {object[]}
 */
function toCandidates(result) {
  const seen = new Set();
  const list = [];
  (result.items || []).forEach(function (it) {
    const key = it.gua + '|' + (it.image || it.cleaned);
    if (seen.has(key)) return;
    seen.add(key);
    list.push({
      image: it.image,
      label: it.image || it.cleaned,
      raw: it.input,
      category: it.category,
      gua: it.gua,
      guaName: TRIGRAMS[it.gua].name,
      symbol: TRIGRAMS[it.gua].symbol,
      nature: TRIGRAMS[it.gua].nature || '',
      matched: it.matched,
      method: it.method,
      reason: it.reason,
      confidence: it.confidence
    });
  });
  // 已匹配的排前面，兜底的排后面
  list.sort(function (a, b) {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    return b.confidence - a.confidence;
  });
  return list;
}

/**
 * 搜索物象库：给"手动输入一个词"的兜底框用
 * 支持中文名、别名、英文
 * @param {string} kw
 * @param {number} limit
 * @returns {object[]}
 */
function searchImages(kw, limit) {
  const q = String(kw || '').trim().toLowerCase();
  const lim = limit || 12;
  if (!q) {
    return [];
  }
  const out = [];
  const seen = new Set();
  // 先搜别名（覆盖口语与英文）
  ALIAS_LOWER.forEach(function (v, k) {
    if (k.indexOf(q) !== -1 && v[1] && IMAGE_INDEX.has(v[0]) && !seen.has(v[0])) {
      seen.add(v[0]);
      const img = IMAGE_INDEX.get(v[0]);
      out.push({
        image: img.name, gua: img.gua,
        guaName: TRIGRAMS[img.gua].name,
        symbol: TRIGRAMS[img.gua].symbol,
        category: img.category, via: k
      });
    }
  });
  // 再搜标准名
  IMAGE_INDEX.forEach(function (img) {
    if (out.length >= lim) return;
    if (img.name.toLowerCase().indexOf(q) !== -1 && !seen.has(img.name)) {
      seen.add(img.name);
      out.push({
        image: img.name, gua: img.gua,
        guaName: TRIGRAMS[img.gua].name,
        symbol: TRIGRAMS[img.gua].symbol,
        category: img.category, via: '标准名'
      });
    }
  });
  return out.slice(0, lim);
}

/**
 * 扁平化物象库（UI 分组用）
 *
 * 排序考虑：用户最先找的是"我家里的东西"，不是"金玉珠贝"。
 * 故把「居家」「器用」提前，让桌椅、手机、灯光一屏可见。
 * @returns {object[]} [{ category, items: [...] }]
 */
function flattenLibrary() {
  const PRIORITY = ['居家', '器用', '出行', '饮食', '数字', '衣物',
                    '静物', '场所', '动物', '天象', '身体', '人物'];

  return IMAGE_LIBRARY.slice()
    .sort(function (a, b) {
      const ia = PRIORITY.indexOf(a.category);
      const ib = PRIORITY.indexOf(b.category);
      // 排序表里没有的分类排到最后，保持相对顺序
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    })
    .map(function (g) {
      return {
        category: g.category,
        items: g.items.map(function (it) {
          return {
            name: it.name,
            gua: it.gua,
            guaName: TRIGRAMS[it.gua].name,
            symbol: TRIGRAMS[it.gua].symbol
          };
        })
      };
    });
}

/* ===============================================================
 * 六、导出
 * =============================================================== */

/**
 * 供 UI 直接使用的一整套识象数据
 * 把"拍照 → 识别 → 归一 → 起卦"串起来，并强制带上人工改选所需的全部信息。
 *
 * @param {string[]} labels AI 输出的元素清单
 * @param {object} opts { now }
 * @returns {object} {
 *   candidates,   可改选的候选（每个都带卦名/符号/理由/置信度）
 *   defaultIndex, 默认选中的候选下标
 *   allFallback,  是否全部未识别成功（UI 需明示"按方位取"）
 *   hint,        给用户看的一句话说明
 * }
 */
function prepareForUI(labels, opts) {
  const o = opts || {};
  const res = normalizeAll(labels, o);
  const candidates = toCandidates(res);
  const allFallback = !!(res.degrade === 'all-fallback');

  return {
    candidates,
    defaultIndex: 0,
    upper: res.upper,
    upperGua: res.upperGua,
    allFallback,
    hint: allFallback
      ? '照片中的元素暂未识别出可用物象，已按《说卦传》方位取卦，你可以在下方手动选一个物象。'
      : '识别到 ' + candidates.filter(function (c) { return c.matched; }).length +
        ' 个可用物象，已取画面主体「' + res.upper + '」起卦。若与你想取的不符，点下方任一项即可改卦。'
  };
}

const API = {
  IMAGE_INDEX,
  normalizeOne,
  normalizeAll,
  toCandidates,
  prepareForUI,
  searchImages,
  flattenLibrary,
  cleanLabel,
  fallbackByHash,
  librarySize: IMAGE_INDEX.size
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else {
  window.ICRecognize = API;
}

})();