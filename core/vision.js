'use strict';

/* ===============================================================
 * core/vision.js —— 视觉识象接入层（平台无关）
 *
 * 架构约束（已核实，非猜测）：
 *  · 微信小程序端 wx.cloud.extend.AI 的 generateText **不支持图片**，
 *    官方文档仅演示文本。因此图片识别必须经云函数转发。
 *  · 云函数拿到 fileID → downloadFile → base64 → 调多模态模型
 *    （如 hy-vision-2.0-instruct），返回**元素清单**而非单一答案。
 *  · 网页版可直接调用支持视觉的 OpenAI 兼容接口。
 *
 * 本文件负责：
 *   1. 组装提示词（明确要求只列可命名的实体物，不看"物上面有什么"）
 *   2. 解析模型返回（容忍 JSON 包裹、代码块、中英文标点）
 *   3. 统一的 recognize 接口（三端共用同一份语义）
 * =============================================================== */

(function () {

const { prepareForUI, normalizeAll, toCandidates } =
  require('./bootstrap.js').loadRecognize();

/* ===============================================================
 * 一、提示词
 *
 * 这段提示词是整个识象体验的关键，理由：
 *  · 要求"只列能命名的实体物" → 避免模型输出"氛围""场景"这类虚词
 *  · 明确"不要看物体上面有什么" → 直接回应用户"椅子上面没东西"的困惑，
 *    物象取物本身，不取其上的内容。
 *  · 要求按显著度排序 → 第一个元素作为上卦候选。
 *  · 限定输出条数 → 控制 token 与噪声。
 * =============================================================== */

const VISION_PROMPT = [
  '你是一个物体识别助手。请列出图片中所有能被清楚命名的实体物体。',
  '',
  '严格遵守：',
  '1. 只输出具体名词，不要输出"氛围""场景""风格""感觉"等抽象描述。',
  '2. 只看物体本身。不要考虑某个物体上面放着什么、里面装着什么。例如"一张空桌子"只输出"桌子"，不要输出"空桌面"。',
  '3. 按在画面中的显著程度从大到小排序，第一条是你认为最主要的物体。',
  '4. 最多列 8 个。如果超过 8 个，只保留最显著的。',
  '5. 用简体中文输出，每行一个名词，不要编号、不要加标点、不要加解释。',
  '',
  '输出示例：',
  '桌子',
  '椅子',
  '笔记本电脑'
].join('\n');

/* ===============================================================
 * 二、返回解析
 * =============================================================== */

/**
 * 说明性文字黑名单。命中即丢弃。
 * 覆盖模型的开场白、总结句、客套话三类噪声。
 */
const JUNK_PATTERN = new RegExp([
  '^(注意|说明|以上|图片|照片|图中|识别|共|总计|输出|结果|答案|如下|总结)',
  '(希望|如果|需要|如需|请|可以|能够|欢迎|抱歉)',
  '(物体|东西|物品)$',
  '^(一|二|三|四|五|六|七|八|九|十)个'
].join('|'));

/**
 * 解析模型返回的文本，抽出元素清单
 * 容忍：```json 代码块、JSON 数组、每行一词、编号前缀、markdown 杂音
 * @param {string} text
 * @returns {string[]}
 */
function parseElements(text) {
  if (!text) return [];
  let s = String(text).trim();

  // 剥掉代码块围栏
  s = s.replace(/^```(?:json|JSON)?\s*/, '').replace(/```\s*$/, '');
  // 剥掉前后解释性文字（模型有时会加"以下是..."）
  s = s.replace(/^(以下是|识别结果|结果|答案)[：:\s]*/g, '');

  let out = [];

  // 尝试按 JSON 数组解析
  const jsonMatch = s.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr)) {
        out = arr.map(function (x) {
          if (typeof x === 'string') return x;
          if (x && typeof x === 'object') return x.name || x.object || x.label || '';
          return '';
        }).filter(Boolean);
      }
    } catch (e) { /* 不是 JSON，继续按行解析 */ }
  }

  // 非 JSON：按行拆
  if (!out.length) {
    out = s.split(/[\n\r]+/).map(function (line) {
      return String(line)
        .replace(/^\s*[\d]+[.、)）]\s*/, '')     // 去编号
        .replace(/^[-*·•]\s*/, '')               // 去项目符号
        .replace(/[""''「」]/g, '')
        .replace(/[。，,、;；:：!！?？]+$/g, '')  // 去尾标点
        .trim();
    }).filter(function (line) {
      // 过滤空行与说明性文字。
      // 模型常在末尾加客套话（"希望对您有帮助"），或用"共3个物体"作总结，
      // 这些都不是物体，必须滤掉，否则会变成一个诡异的"物象"。
      if (!line || line.length > 20) return false;
      if (JUNK_PATTERN.test(line)) return false;
      return true;
    });
  }

  // 去重 + 限长
  const seen = new Set();
  return out.filter(function (x) {
    const k = x.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 8);
}

/* ===============================================================
 * 三、统一识别入口
 * =============================================================== */

/**
 * 从模型原始返回构建 UI 数据
 * @param {string} rawText 模型返回文本
 * @param {object} opts 透传给 prepareForUI
 * @returns {object}
 */
function fromModelText(rawText, opts) {
  const labels = parseElements(rawText);
  const ui = prepareForUI(labels, opts);
  ui.rawText = String(rawText || '').slice(0, 600);
  ui.labels = labels;
  // 三种"没有可用结果"的情况要区分清楚，UI 据此给不同引导：
  //   empty        模型什么都没返回 → 提示重拍或手选
  //   allFallback  有返回但全未识别   → 已按方位取卦，提示可改选
  ui.empty = labels.length === 0;
  if (ui.empty) {
    ui.upper = null;
    ui.upperGua = null;
    ui.upperReason = null;
    ui.hint = '没能从这张照片里认出可用的物象。你可以重拍一张，或者直接搜索名字手动选择——两种方式取卦完全一样。';
  } else if (!ui.candidates.length) {
    ui.hint = '照片中的元素暂未识别出可用物象，已按《说卦传》方位取卦，你可以在下方手动选一个物象。';
  }
  return ui;
}

/* ===============================================================
 * 四、小程序端：云函数调用
 * =============================================================== */

/**
 * 通过云函数识别图片
 * @param {string} cloudFuncName 云函数名，默认 'vision'
 * @param {string} fileID 云存储文件 ID
 * @returns {Promise<object>} 与 fromModelText 同构的 UI 数据
 */
async function recognizeByCloud(cloudFuncName, fileID) {
  const name = cloudFuncName || 'vision';
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    throw new Error('当前环境不支持 wx.cloud.callFunction，请改用浏览器端接口');
  }
  const res = await wx.cloud.callFunction({
    name: name,
    data: { fileID }
  });
  const result = res && res.result;
  if (!result) throw new Error('云函数未返回结果');
  if (result.ok === false) {
    throw new Error(result.message || '识别失败');
  }
  return fromModelText(result.text, {});
}

/* ===============================================================
 * 五、浏览器端：直连兼容 OpenAI 协议的视觉接口
 * =============================================================== */

/**
 * 浏览器端调用（Web / PWA / Capacitor APP）
 * @param {string} dataUrl 图片 dataURL
 * @param {object} cfg { endpoint, apiKey, model, temperature }
 * @returns {Promise<object>}
 */
async function recognizeByHttp(dataUrl, cfg) {
  const c = cfg || {};
  if (!c.endpoint) throw new Error('未配置视觉接口地址');
  const model = c.model || 'glm-4.6v';
  const body = {
    model: model,
    temperature: 0.1,   // 低温保证识别稳定可复现
    messages: [
      { role: 'system', content: VISION_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: '识别这张图片中的实体物体。' },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  };
  const headers = { 'Content-Type': 'application/json' };
  if (c.apiKey) headers.Authorization = 'Bearer ' + c.apiKey;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(function () { controller.abort(); }, 30000) : null;

  try {
    const resp = await fetch(c.endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    });
    if (!resp.ok) throw new Error('识别接口返回 ' + resp.status);
    const json = await resp.json();
    const text = json && json.choices && json.choices[0]
      ? json.choices[0].message.content
      : (json && json.content) || '';
    return fromModelText(text, {});
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('识别超时，请重试');
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ===============================================================
 * 六、未配置视觉服务时的本地兜底
 *
 * 关键：产品必须能在没有云环境时仍然可用。
 * 做法是进入「手动识象」模式 —— 展示完整物象库 + 搜索框，
 * 而非报错。这正是"不让用户不知道选什么"的兜底。
 * =============================================================== */

function notConfigured(reason) {
  return {
    candidates: [],
    labels: [],
    empty: true,
    notConfigured: true,
    reason: reason || '尚未配置视觉识别服务',
    hint: '你可以直接搜索或浏览物象库手动选择，取卦效果与拍照完全一致。',
    defaultIndex: 0
  };
}

const API = {
  VISION_PROMPT,
  parseElements,
  fromModelText,
  recognizeByCloud,
  recognizeByHttp,
  notConfigured,
  normalizeAll,
  toCandidates
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else {
  window.ICVision = API;
}

})();