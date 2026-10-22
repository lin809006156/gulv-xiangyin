/**
 * 云函数：vision —— 图像识别取物象
 *
 * 为什么必须有云函数：
 *   小程序端 wx.cloud.extend.AI 的 generateText 不支持上传图片
 *   （见微信社区 Issue #1023），因此图片必须经服务端转发给多模态模型。
 *
 * 数据流：
 *   小程序 wx.chooseMedia → wx.cloud.uploadFile → fileID
 *        → 本云函数 downloadFile → base64
 *        → 多模态模型 → 元素清单文本
 *        → 前端 core/recognize.js 归一为卦
 *
 * 环境准备：
 *   1. 开发者工具开通云开发，建环境，把 envId 填到 miniprogram/app.js
 *   2. 云控制台 → AI+ → 开通，并确认所选模型支持图片输入
 *      （如 hy-vision-2.0-instruct / hunyuan-t1-vision-*）
 *   3. 部署本云函数，右键"上传并部署：云端安装依赖"
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 提示词与 core/vision.js 中的 VISION_PROMPT 保持一致。
 * 云端保留一份是因为部分模型不接受 system role，放在 user 里更稳。
 */
const PROMPT = [
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

/** 可选模型，按优先级尝试；第一个成功的即返回 */
const MODELS = [
  'hy-vision-2.0-instruct',
  'hunyuan-t1-vision-20250916'
];

exports.main = async (event) => {
  const { fileID } = event || {};
  if (!fileID) {
    return { ok: false, message: '缺少图片 fileID' };
  }

  try {
    /* 1. 下载图片 */
    const dl = await cloud.downloadFile({ fileID });
    const buffer = dl.fileContent;
    if (!buffer || !buffer.length) {
      return { ok: false, message: '图片下载为空' };
    }
    // 控制在 4.5MB 以内，超出则不给模型（多数接口限 5MB）
    if (buffer.length > 4.5 * 1024 * 1024) {
      return { ok: false, message: '图片过大，请重新拍摄' };
    }
    const base64 = buffer.toString('base64');

    /* 2. 调多模态模型 */
    let text = '';
    let usedModel = '';
    let lastErr = null;

    for (let i = 0; i < MODELS.length; i++) {
      try {
        const provider = cloud.extend.AI.createModel('cloudbase');
        const res = await provider.generateText({
          model: MODELS[i],
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              // 混元系用 image + image_base64；OpenAI 兼容协议用 image_url
              { type: 'image', image_base64: base64 }
            ]
          }]
        });
        text = extractText(res);
        usedModel = MODELS[i];
        if (text) break;
      } catch (e) {
        lastErr = e;
        console.warn(`模型 ${MODELS[i]} 调用失败:`, e && e.message);
      }
    }

    if (!text) {
      return {
        ok: false,
        message: '视觉识别未返回结果，请改用手动选物象',
        detail: lastErr && lastErr.message
      };
    }

    return { ok: true, text, model: usedModel };
  } catch (err) {
    console.error('vision 云函数异常', err);
    return {
      ok: false,
      message: '识别服务异常，请改用手动选物象',
      detail: err && err.message
    };
  }
};

/**
 * 从不同形态的返回中取文本
 * generateText 返回 OpenAI 兼容结构，但不同 provider 略有差异
 */
function extractText(res) {
  if (!res) return '';
  if (typeof res === 'string') return res;
  if (res.choices && res.choices[0]) {
    const c = res.choices[0];
    if (c.message && typeof c.message.content === 'string') return c.message.content;
    if (typeof c.text === 'string') return c.text;
  }
  if (typeof res.content === 'string') return res.content;
  if (res.message && typeof res.message.content === 'string') return res.message.content;
  return '';
}