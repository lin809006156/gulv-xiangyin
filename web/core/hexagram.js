/**
 * 学易心音 · 起卦与解读
 * ---------------------------------------------------------------
 * 起卦方式：
 *   1. 每日一卦（时间起卦）—— 以年月日时成卦，同日同刻结果恒定
 *   2. 观象起卦（物象起卦）—— 上卦取物象，下卦取时辰，动爻取时辰除六余
 *   3. 手动起卦 —— 输入数字自定
 *
 * 算法依梅花易数传统：
 *   上卦 = (年支序 + 月 + 日) ÷ 8 取余，余 0 作 8
 *   下卦 = (年支序 + 月 + 日 + 时支序) ÷ 8 取余，余 0 作 8
 *   动爻 = (年支序 + 月 + 日 + 时支序) ÷ 6 取余，余 0 作 6
 *   先天八卦数：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8
 */

'use strict';

/* __IC_IIFE__ */
(function () {


/* 跨端依赖注入：浏览器靠全局，小程序/Node 走 require */
const ICData = require('./bootstrap.js').loadData();

/* 解构出本模块所需的数据层符号 */
const TRIGRAMS = ICData.TRIGRAMS;
const TRIGRAM_KEYS = ICData.TRIGRAM_KEYS;
const findHexagramIndex = ICData.findHexagramIndex;
const getHexagram = ICData.getHexagram;
const getSixLines = ICData.getSixLines;
const deriveMusicConfig = ICData.deriveMusicConfig;

/* 十二地支序（子1 … 亥12），梅花易数用 */
const ZHI_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 十二时辰对应地支（子时 23:00-01:00 归子） */
function getShiZhi(date) {
  const h = date.getHours();
  const idx = Math.floor(((h + 1) % 24) / 2);
  return { index: idx + 1, name: ZHI_ORDER[idx] };
}

/** 年支序：以 1984 甲子为基准推算 */
function getYearZhiIndex(date) {
  const year = date.getFullYear();
  const idx = ((year - 1984) % 12 + 12) % 12;   // 0 = 子
  return idx + 1;
}

/** 农历近似：以公历月日为代（简化处理，小程序可接入农历库替换） */
function getLunarApprox(date) {
  return {
    month: date.getMonth() + 1,
    day: date.getDate()
  };
}

/** 数字起卦：由两个数字得上卦下卦与动爻 */
function numberHexagram(num1, num2) {
  const upperNum = ((num1 - 1) % 8) + 1;   // 1..8
  const lowerNum = ((num2 - 1) % 8) + 1;
  const movingLine = ((num1 + num2) % 6) || 6;
  return buildFromNumbers(upperNum, lowerNum, movingLine);
}

/**
 * 时间起卦（每日一卦）
 * @param {Date} date
 */
function timeHexagram(date) {
  const yearZhi = getYearZhiIndex(date);
  const lunar = getLunarApprox(date);
  const shi = getShiZhi(date);

  const sum = yearZhi + lunar.month + lunar.day;
  const upperNum = (sum % 8) || 8;
  const lowerNum = ((sum + shi.index) % 8) || 8;
  const movingLine = ((sum + shi.index) % 6) || 6;

  return buildFromNumbers(upperNum, lowerNum, movingLine, {
    method: 'time',
    methodText: '每日一卦 · 时间起卦',
    detail: {
      yearZhi: ZHI_ORDER[yearZhi - 1],
      month: lunar.month,
      day: lunar.day,
      shi: shi.name,
      upperNum,
      lowerNum,
      movingLine
    }
  });
}

/**
 * 物象起卦（观象起卦）
 * 上卦取所观物象，下卦取时辰，动爻取时辰除六余
 * @param {string} imageName 物象名
 * @param {string} guaKey     物象对应之卦
 * @param {Date}   date
 */
function imageHexagram(imageName, guaKey, date) {
  const yearZhi = getYearZhiIndex(date);
  const lunar = getLunarApprox(date);
  const shi = getShiZhi(date);
  const sum = yearZhi + lunar.month + lunar.day + shi.index;

  const lowerNum = (sum % 8) || 8;
  const movingLine = (sum % 6) || 6;

  // 上卦先天数由 TRIGRAMS 反查
  const upperNum = numberOfTrigram(guaKey);

  return buildFromNumbers(upperNum, lowerNum, movingLine, {
    method: 'image',
    methodText: '观象起卦',
    imageName,
    detail: {
      imageName,
      guaName: TRIGRAMS[guaKey].name,
      yearZhi: ZHI_ORDER[yearZhi - 1],
      month: lunar.month,
      day: lunar.day,
      shi: shi.name,
      upperNum,
      lowerNum,
      movingLine
    }
  });
}

/** 卦 key → 先天数（乾1兑2离3震4巽5坎6艮7坤8） */
function numberOfTrigram(key) {
  return TRIGRAM_KEYS.indexOf(key) + 1;
}

/** 先天数 → 卦 key */
function trigramOfNumber(num) {
  return TRIGRAM_KEYS[((num - 1) % 8 + 8) % 8];
}

/**
 * 由上卦数、下卦数、动爻组装完整卦象
 */
function buildFromNumbers(upperNum, lowerNum, movingLine, extra) {
  const upperKey = trigramOfNumber(upperNum);
  const lowerKey = trigramOfNumber(lowerNum);
  const index = findHexagramIndex(upperKey, lowerKey);
  const hex = getHexagram(index + 1);

  // 变卦：动爻阴阳反转
  const lines = getSixLines(hex);
  const changedLines = lines.slice();
  changedLines[movingLine - 1] = changedLines[movingLine - 1] === 1 ? 0 : 1;
  const changedUpper = keyOfTrigramFromLines(changedLines.slice(3));
  const changedLower = keyOfTrigramFromLines(changedLines.slice(0, 3));
  const changedIndex = findHexagramIndex(changedUpper, changedLower);
  const changedHex = changedIndex >= 0 ? getHexagram(changedIndex + 1) : null;

  return {
    hex,
    changedHex,
    movingLine,
    movingLines: [movingLine],
    lines,
    changedLines,
    method: (extra && extra.method) || 'number',
    methodText: (extra && extra.methodText) || '数字起卦',
    detail: (extra && extra.detail) || {},
    upperNum,
    lowerNum,
    music: deriveMusicConfig(hex),
    changedMusic: changedHex ? deriveMusicConfig(changedHex) : null
  };
}

/** 由三爻（自下而上）反查卦 key */
function keyOfTrigramFromLines(three) {
  for (const key of TRIGRAM_KEYS) {
    const t = TRIGRAMS[key];
    if (t.lines[0] === three[0] && t.lines[1] === three[1] && t.lines[2] === three[2]) {
      return key;
    }
  }
  return 'kun';
}

/* ===============================================================
 * 解读组装
 * =============================================================== */

/** 爻位名（自下而上：初、二、三、四、五、上） */
const YAO_TITLES = ['初', '二', '三', '四', '五', '上'];

/**
 * 爻题（依《周易》经文通例）
 *   初爻称「初九」「初六」，上爻称「上九」「上六」，
 *   中间四爻称「九二」「六三」「九四」「六五」——数字在前、爻位在后。
 */
function yaoTitle(isYang, i) {
  if (i === 0) return isYang ? '初九' : '初六';
  if (i === 5) return isYang ? '上九' : '上六';
  return (isYang ? '九' : '六') + YAO_TITLES[i];
}

/**
 * 组装完整解读文案
 */
function buildReading(result) {
  const { hex, changedHex, lines, changedLines } = result;
  // 动爻集合：新结果带 movingLines 数组；只设了单个 movingLine 的旧调用方
  // （含手工改值的测试）以 movingLine 为准，两者不一致时以后者覆盖。
  let movingLines = (result.movingLines && result.movingLines.length)
    ? result.movingLines.slice()
    : [];
  if (result.movingLine && movingLines.indexOf(result.movingLine) < 0) {
    movingLines = [result.movingLine];
  }
  const upper = TRIGRAMS[hex.upper];
  const lower = TRIGRAMS[hex.lower];

  // 本卦六爻
  const yaoList = lines.map((y, i) => ({
    index: i + 1,
    isYang: y === 1,
    title: yaoTitle(y === 1, i),
    isMoving: movingLines.indexOf(i + 1) >= 0,
    changedTo: changedLines[i] === 1 ? '阳' : '阴'
  }));

  // 卦象结构描述
  const structure = `${lower.name}下${upper.name}上`;

  // 动爻断语（依卦德与动爻位置生成，现代心语，不作吉凶断言）
  const movingText = buildMovingText(hex, movingLines);

  // 变卦提示
  const changedText = changedHex
    ? `动而之 ${changedHex.name}，所示为「${changedHex.hint}」`
    : (movingLines.length ? '' : '六爻皆静，无动爻 —— 以本卦卦辞为是。');

  return {
    symbol: hex.symbol,
    name: hex.name,
    n: hex.n,
    virtue: hex.virtue,
    gua: hex.gua,
    xiang: hex.xiang,
    hint: hex.hint,
    structure,
    upper,
    lower,
    yaoList,
    movingLine: movingLines.length ? movingLines[0] : 0,
    movingLines,
    movingText,
    changedHex,
    changedText,
    methodText: result.methodText,
    detail: result.detail
  };
}

/** 动爻心语：结合卦德与爻位生成（支持单爻或多爻；空数组即六爻安静） */
function buildMovingText(hex, moving) {
  const list = Array.isArray(moving) ? moving.filter(Boolean) : [moving];
  if (!list.length) return '六爻皆静，以本卦卦辞为是。';

  const byVirtue = {
    '刚健': '此爻发动，阳气上行，宜主动而不宜逞强',
    '中和': '此爻发动，阴阳相济，宜守中而行',
    '柔顺': '此爻发动，以柔顺应事，宜委曲而进',
    '柔静': '此爻发动，宜收敛自守，静以待时',
    '艰难': '此爻发动，阻力正显，宜守常待援'
  }[hex.virtue] || '此爻发动，变化之中';

  const byPosition = {
    '初': '初爻居下，事在起步，根基为先',
    '二': '二爻得中，位置不偏，进退有据',
    '三': '三爻居危，过刚则折，当知戒惧',
    '四': '四爻近君，柔顺得位，宜谨守勿争',
    '五': '五爻居尊，统领之位，当以中正为要',
    '上': '上爻居极，盈满将至，宜知止而退'
  };

  // 多爻动：取前三爻合成心语，其余以「余爻亦动」带过
  const parts = list.slice(0, 3).map((ln) => {
    const position = YAO_TITLES[ln - 1];
    return `${byVirtue}；${byPosition[position] || '动在此爻'}。`;
  });
  if (list.length > 3) parts.push('其余爻亦动，变化头绪繁多，宜先观大局。');
  return parts.join('');
}

/**
 * 生成当日之卦
 * 规则：同一天内结果恒定（以当日 0 点为界），供"每日一卦"使用。
 * @param {Date} date
 */
function dailyHexagram(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  return timeHexagram(d);
}

/** 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ZHI_ORDER, getShiZhi, getYearZhiIndex, getLunarApprox,
    numberHexagram, timeHexagram, imageHexagram, dailyHexagram,
    buildFromNumbers, buildReading, numberOfTrigram, trigramOfNumber, yaoTitle
  };
} else {
  window.ICHexagram = {
    ZHI_ORDER, getShiZhi, getYearZhiIndex, getLunarApprox,
    numberHexagram, timeHexagram, imageHexagram, dailyHexagram,
    buildFromNumbers, buildReading, numberOfTrigram, trigramOfNumber, yaoTitle
  };
}

})();
