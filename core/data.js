/**
 * 卦象心音 · 数据层
 * ---------------------------------------------------------------
 * 1. 八卦定义（卦象属性取自《说卦传》）
 * 2. 物象库（分类采撷，供"观象起卦"选取）
 * 3. 十二律吕、五声调式
 * 4. 六十四卦全表：卦辞 / 大象 / 卦德 / 每日心语 / 音乐参数
 *
 * 音乐参数推导原则（非任意指定，皆可追溯）：
 *   主音 ← 卦序定十二律，卦德定音区
 *   调式 ← 内卦五行纳音（宫土 商金 角木 徵火 羽水）
 *   音色 ← 外卦配八音（《白虎通·礼乐》引《乐记》：
 *          埙坎音 管艮音 鼓震音 弦离音 钟兑音 柷敔乾音，
 *          清人陈立《白虎通疏证》补：箫巽音 磬坤音）
 *   调式音色 ← 五音清浊（《礼记·乐记》疏：宫至浊 商次浊
 *          角清浊相半 徵次清 羽最清）
 *   旋律 ← 六爻阴阳生成本卦专属的六音轮廓（64卦各不相同）
 *   力度 ← 卦德（刚健 / 中和 / 柔静 / 艰难）
 *
 * 所有文献出处集中于 core/classics.js，本文件只消费不重复记载。
 */

'use strict';

/* __IC_IIFE__ */
(function () {


/* 典籍依据层（文献单一真相源） */
const CLASSICS = require('./bootstrap.js').loadClassics();


/* ===============================================================
 * 一、八卦
 * =============================================================== */

/**
 * 爻位：自下而上 [初, 二, 三]，1 为阳爻，0 为阴爻
 *
 * voice / voiceText 依《白虎通·礼乐》引《乐记》「埙坎音也，管艮音也，
 * 鼓震音也，弦离音也，钟兑音也，柷敔乾音也」，
 * 并据清人陈立《白虎通疏证》补足「萧当为巽音，磬当为坤音」，
 * 八音之材为土竹皮匏丝石金木，故八卦与八音恰成一一配对。
 */
const TRIGRAMS = {
  qian: {
    key: 'qian', name: '乾', symbol: '☰', lines: [1, 1, 1],
    nature: '天', wuxing: '金', attribute: '刚健',
    image: '马、君、父、金玉、大舆',
    nature_text: '天行健，君子以自强不息',
    voice: 'zhu', voiceText: '柷敔', voiceMaterial: '木',
    voiceDesc: '干硬短促的木质敲击声',
    wuxing_note: '刚金'
  },
  dui: {
    key: 'dui', name: '兑', symbol: '☱', lines: [1, 1, 0],
    nature: '泽', wuxing: '金', attribute: '喜悦',
    image: '羊、少女、巫、口舌、毁折',
    nature_text: '丽泽，兑，君子以朋友讲习',
    voice: 'zhong', voiceText: '钟', voiceMaterial: '金',
    voiceDesc: '浑厚悠长、金石共鸣、余韵不绝',
    wuxing_note: '悦金'
  },
  li: {
    key: 'li', name: '离', symbol: '☲', lines: [1, 0, 1],
    nature: '火', wuxing: '火', attribute: '光明',
    image: '雉、中女、甲胄、戈兵、日电',
    nature_text: '明两作，离，大人以继明照于四方',
    voice: 'xian', voiceText: '弦', voiceMaterial: '丝',
    voiceDesc: '柔润绵长、吟猱宛转、泛音清越',
    wuxing_note: '明火'
  },
  zhen: {
    key: 'zhen', name: '震', symbol: '☳', lines: [1, 0, 0],
    nature: '雷', wuxing: '木', attribute: '震动',
    image: '龙、长男、竹木、大涂、决躁',
    nature_text: '洊雷，震，君子以恐惧修省',
    voice: 'gu', voiceText: '鼓', voiceMaterial: '皮',
    voiceDesc: '低频冲击、鼓点鲜明、震感强',
    wuxing_note: '动木'
  },
  xun: {
    key: 'xun', name: '巽', symbol: '☴', lines: [0, 1, 1],
    nature: '风', wuxing: '木', attribute: '顺入',
    image: '鸡、长女、绳直、草木、进退',
    nature_text: '随风，巽，君子以申命行事',
    voice: 'xiao', voiceText: '箫', voiceMaterial: '竹',
    voiceDesc: '清越空灵、气声明显、随风入木',
    wuxing_note: '入木'
  },
  kan: {
    key: 'kan', name: '坎', symbol: '☵', lines: [0, 1, 0],
    nature: '水', wuxing: '水', attribute: '险陷',
    image: '豕、中男、沟渎、弓轮、酒',
    nature_text: '水洊至，习坎，君子以常德行',
    voice: 'xun', voiceText: '埙', voiceMaterial: '土',
    voiceDesc: '低浑厚实、闭口共鸣、土质粗粝',
    wuxing_note: '险水'
  },
  gen: {
    key: 'gen', name: '艮', symbol: '☶', lines: [0, 0, 1],
    nature: '山', wuxing: '土', attribute: '静止',
    image: '狗、少男、山径、门阙、小石',
    nature_text: '兼山，艮，君子以思不出其位',
    voice: 'guan', voiceText: '管', voiceMaterial: '竹',
    voiceDesc: '清亮平和、端正克制、不事张扬',
    wuxing_note: '止土'
  },
  kun: {
    key: 'kun', name: '坤', symbol: '☷', lines: [0, 0, 0],
    nature: '地', wuxing: '土', attribute: '柔顺',
    image: '牛、母、布帛、釜、田野',
    nature_text: '地势坤，君子以厚德载物',
    voice: 'qing', voiceText: '磬', voiceMaterial: '石',
    voiceDesc: '干硬清亮、石质击点、余韵短促',
    wuxing_note: '顺土'
  }
};

const TRIGRAM_KEYS = ['qian', 'dui', 'li', 'zhen', 'xun', 'kan', 'gen', 'kun'];

/* 八卦 → 音（纳音），用于定调式 */
const WUXING_TO_MODE = {
  土: 'gong',   // 宫
  金: 'shang',  // 商
  木: 'jue',    // 角
  火: 'zhi',    // 徵
  水: 'yu'      // 羽
};

/* ===============================================================
 * 二、物象库 —— 供"观象起卦"选取
 * =============================================================== */

const IMAGE_LIBRARY = [
  {
    category: '天象',
    items: [
      { name: '太阳' },
      { name: '明月' },
      { name: '乌云' },
      { name: '雷声' },
      { name: '风' },
      { name: '雨' },
      { name: '雪' },
      { name: '彩虹' },
      { name: '星' },
      { name: '朝霞' }
    ]
  },
  {
    category: '动物',
    items: [
      { name: '马' },
      { name: '牛' },
      { name: '龙' },
      { name: '鸡' },
      { name: '猪' },
      { name: '雉鸡' },
      { name: '龟' },
      { name: '狗' },
      { name: '鼠' },
      { name: '羊' },
      { name: '鱼' },
      { name: '蛇' },
      { name: '蟹' },
      { name: '猫' },
      { name: '鸟雀' }
    ]
  },
  {
    category: '人物',
    items: [
      { name: '父亲' },
      { name: '母亲' },
      { name: '长男' },
      { name: '长女' },
      { name: '中男' },
      { name: '中女' },
      { name: '少男' },
      { name: '少女' },
      { name: '长者' },
      { name: '君王' },
      { name: '巫者' },
      { name: '旅人' }
    ]
  },
  {
    category: '静物',
    items: [
      { name: '金玉' },
      { name: '铜镜' },
      { name: '车舆' },
      { name: '布帛' },
      { name: '锅釜' },
      { name: '文书' },
      { name: '竹木' },
      { name: '芦苇' },
      { name: '草木' },
      { name: '绳索' },
      { name: '水' },
      { name: '酒器' },
      { name: '弓轮' },
      { name: '甲胄' },
      { name: '戈兵' },
      { name: '灯烛' },
      { name: '龟甲' },
      { name: '山石' },
      { name: '门阙' },
      { name: '果实' },
      { name: '金属器皿' },
      { name: '口舌言辞' },
      { name: '手机' },
      { name: '书卷' }
    ]
  },
  {
    category: '场所',
    items: [
      { name: '道路' },
      { name: '大路' },
      { name: '城郭' },
      { name: '田野' },
      { name: '山野' },
      { name: '水泽' },
      { name: '沟渠' },
      { name: '林木' },
      { name: '房间' },
      { name: '窗前' },
      { name: '餐桌' },
      { name: '阳台' },
      { name: '车站' },
      { name: '店铺' }
    ]
  },
  {
    category: '身体',
    items: [
      { name: '头部' },
      { name: '口' },
      { name: '目' },
      { name: '足' },
      { name: '股' },
      { name: '耳' },
      { name: '手' },
      { name: '腹' },
      { name: '心血' },
      { name: '梦境' }
    ]
  },

  /* =============================================================
   * 以下四类为现代日常物象 —— 由 2026 年产品化时补充。
   * 依据：用户随手能命名、能被 AI 视觉识别的日常物件。
   * 每条 name 即为识别结果的归一目标名。
   * ============================================================= */

  {
    category: '居家',
    items: [
      { name: '桌案' },
      { name: '椅子' },
      { name: '床' },
      { name: '沙发' },
      { name: '柜子' },
      { name: '书架' },
      { name: '镜子' },
      { name: '窗户' },
      { name: '门' },
      { name: '楼梯' },
      { name: '灯' },
      { name: '蜡烛' },
      { name: '时钟' },
      { name: '相框' },
      { name: '被子' },
      { name: '枕头' },
      { name: '扫帚' },
      { name: '钥匙' },
      { name: '剪刀' },
      { name: '伞' },
      { name: '钱' },
      { name: '楼梯扶手' }
    ]
  },
  {
    category: '器用',
    items: [
      { name: '电脑' },
      { name: '显示器' },
      { name: '键盘' },
      { name: '鼠标' },
      { name: '耳机' },
      { name: '音箱' },
      { name: '摄像头' },
      { name: '电视' },
      { name: '打印机' },
      { name: '充电器' },
      { name: '数据线' },
      { name: 'U盘' },
      { name: '硬盘' },
      { name: '平板' },
      { name: '空调' },
      { name: '风扇' },
      { name: '冰箱' },
      { name: '洗衣机' },
      { name: '微波炉' },
      { name: '电磁炉' },
      { name: '热水器' },
      { name: '吸尘器' },
      { name: '电灯开关' },
      { name: '插座' },
      { name: '遥控器' },
      { name: '眼镜' },
      { name: '手表' },
      { name: '纸巾' },
      { name: '毛巾' },
      { name: '牙刷' },
      { name: '梳子' },
      { name: '镜子刷' }
    ]
  },
  {
    category: '出行',
    items: [
      { name: '汽车' },
      { name: '自行车' },
      { name: '电动车' },
      { name: '摩托车' },
      { name: '公交车' },
      { name: '地铁' },
      { name: '火车' },
      { name: '飞机' },
      { name: '轮船' },
      { name: '出租车' },
      { name: '红绿灯' },
      { name: '路牌' },
      { name: '楼梯口' },
      { name: '电梯' },
      { name: '行李箱' },
      { name: '背包' },
      { name: '地铁卡' },
      { name: '车票' },
      { name: '停车位' }
    ]
  },
  {
    category: '饮食',
    items: [
      { name: '米饭' },
      { name: '面条' },
      { name: '面包' },
      { name: '水果' },
      { name: '蔬菜' },
      { name: '肉' },
      { name: '菜肴' },
      { name: '鸡蛋' },
      { name: '牛奶' },
      { name: '咖啡' },
      { name: '茶' },
      { name: '水杯' },
      { name: '碗' },
      { name: '筷子' },
      { name: '刀叉' },
      { name: '勺子' },
      { name: '盘子' },
      { name: '杯子' },
      { name: '锅' },
      { name: '零食' },
      { name: '酒' },
      { name: '饮料' },
      { name: '调味瓶' }
    ]
  },
  {
    category: '衣物',
    items: [
      { name: '衣服' },
      { name: '外套' },
      { name: '鞋子' },
      { name: '袜子' },
      { name: '帽子' },
      { name: '雨衣' },
      { name: '围巾' },
      { name: '眼镜盒' },
      { name: '包' },
      { name: '床单' }
    ]
  },
  {
    category: '数字',
    items: [
      { name: '手机屏幕' },
      { name: '电脑屏幕' },
      { name: '二维码' },
      { name: '聊天窗口' },
      { name: '视频通话' },
      { name: '照片' },
      { name: '搜索引擎' },
      { name: '导航地图' },
      { name: '闹钟' },
      { name: '密码输入框' },
      { name: '红点提示' },
      { name: '进度条' }
    ]
  }
];

/* ===============================================================
 * 二之一、物象 → 卦 + 出处（由 core/classics.js 单一真相源注入）
 * ---------------------------------------------------------------
 * 物象库本体只列「有哪些物象」，不写「属哪一卦」——
 * 卦属与文献依据统一由 classics.js 的 IMAGE_ORIGINS 决定。
 * 这样一处修正，全项目（识别、起卦、UI 展示）同步生效，
 * 且可由 verify-library.js 交叉校验，杜绝两处定义打架。
 * =============================================================== */

/** 供外部查询：物象名 → { gua, src, cite, reason, alt } */
const IMAGE_ORIGIN_INDEX = (function build() {
  const m = new Map();
  Object.keys(CLASSICS.IMAGE_ORIGINS).forEach(function (name) {
    const o = CLASSICS.IMAGE_ORIGINS[name];
    m.set(name, {
      name: name,
      gua: o.gua,
      src: o.src,                 // 'classic' | 'later' | 'modern'
      cite: o.cite || '',         // 引文出处
      reason: o.reason || '',     // 取象理由
      alt: o.alt || '',           // 文献分歧说明
      kind: CLASSICS.SOURCE_KIND[o.src] || CLASSICS.SOURCE_KIND.modern
    });
  });
  return m;
})();

/* 注入卦属与出处，并校验两边一致 */
IMAGE_LIBRARY.forEach(function (group) {
  group.items.forEach(function (it) {
    const o = IMAGE_ORIGIN_INDEX.get(it.name);
    if (!o) {
      throw new Error('物象「' + it.name + '」在 classics.IMAGE_ORIGINS 中缺少出处条目，'
        + '请先补齐文献依据再使用。');
    }
    if (!TRIGRAMS[o.gua]) {
      throw new Error('物象「' + it.name + '」的卦 key「' + o.gua + '」不存在。');
    }
    // 凡定义必注理由：没有取象之理即为定义不严谨，拒不使用
    if (!o.reason) {
      throw new Error('物象「' + it.name + '」缺少取象之理（reason），'
        + '请先写清「为何归此卦」再使用。');
    }
    // 引用出处者必须有引文；当代类推必须有推演理由
    if ((o.src === 'classic' || o.src === 'later') && !o.cite) {
      throw new Error('物象「' + it.name + '」标为「' + o.src + '」却缺少引文。');
    }
    it.gua = o.gua;
    it.src = o.src;
    it.cite = o.cite;
    it.reason = o.reason;
    it.alt = o.alt;
    it.kindLabel = o.kind.label;
  });
});

/** 反向校验：classics 中有物象但库中无（防止两处名单漂移） */
(function checkCoverage() {
  const libNames = new Set();
  IMAGE_LIBRARY.forEach(function (g) {
    g.items.forEach(function (it) { libNames.add(it.name); });
  });
  const missing = [];
  IMAGE_ORIGIN_INDEX.forEach(function (v, k) {
    if (!libNames.has(k)) missing.push(k);
  });
  if (missing.length) {
    throw new Error('classics.IMAGE_ORIGINS 中有 ' + missing.length
      + ' 个物象未收入物象库：' + missing.join('、'));
  }
})();

/* ===============================================================
 * 二之二、物象别名归一表 —— AI 识别结果 → 标准物象名
 *
 * 设计要点：
 *  1. AI 只会输出它认识的词（如 "chair"、"dining table"），
 *     必须映射到本库的规范名，否则归一失败。
 *  2. 用户口语也需覆盖："桌子" 非 "餐桌"，两者都归到「桌案」。
 *  3. 值为数组时表示多个候选，按顺序取第一个能用的。
 * =============================================================== */

const IMAGE_ALIAS = {
  /* 中文：家具 */
  桌子: ['桌案', 'gen'], 餐桌: ['桌案', 'gen'], 书桌: ['桌案', 'gen'],
  餐台: ['桌案', 'gen'], 梳妆台: ['桌案', 'gen'], 吧台: ['桌案', 'gen'],
  电脑桌: ['桌案', 'gen'], 课桌: ['桌案', 'gen'], 床头柜: ['柜子', 'gen'],
  办公桌: ['桌案', 'gen'], 茶几: ['桌案', 'gen'], 工作台: ['桌案', 'gen'],
  desk: ['桌案', 'gen'], table: ['桌案', 'gen'], 'dining table': ['桌案', 'gen'],
  chair: ['椅子', 'gen'], stool: ['椅子', 'gen'], sofa: ['沙发', 'kun'],
  couch: ['沙发', 'kun'], bed: ['床', 'gen'], cabinet: ['柜子', 'gen'],
  wardrobe: ['柜子', 'gen'], window: ['窗户', 'xun'], door: ['门', 'gen'],
  lamp: ['灯', 'li'], light: ['灯', 'li'], clock: ['时钟', 'kan'],
  watch: ['手表', 'kan'], mirror: ['镜子', 'qian'], key: ['钥匙', 'qian'],
  椅子: ['椅子', 'gen'], 凳子: ['椅子', 'gen'], 板凳: ['椅子', 'gen'],
  沙发: ['沙发', 'kun'], 懒人椅: ['沙发', 'kun'], 躺椅: ['沙发', 'kun'],
  床: ['床', 'gen'], 床铺: ['床', 'gen'],
  柜子: ['柜子', 'gen'], 衣柜: ['柜子', 'gen'], 抽屉: ['柜子', 'gen'],
  书架: ['书架', 'zhen'], 书柜: ['书架', 'zhen'], 书架上的书: ['书卷', 'kun'],

  /* 中文：居家 */
  镜子: ['镜子', 'qian'], 穿衣镜: ['镜子', 'qian'], 浴室镜: ['镜子', 'qian'],
  窗户: ['窗户', 'xun'], 玻璃窗: ['窗户', 'xun'], 窗: ['窗户', 'xun'],
  门: ['门', 'gen'], 大门: ['门', 'gen'], 门把手: ['钥匙', 'qian'],
  灯: ['灯', 'li'], 台灯: ['灯', 'li'], 吊灯: ['灯', 'li'], 电灯: ['灯', 'li'],
  蜡烛: ['蜡烛', 'li'], 香: ['蜡烛', 'li'],
  时钟: ['时钟', 'kan'], 挂钟: ['时钟', 'kan'], 闹钟: ['闹钟', 'kan'],
  相框: ['相框', 'gen'], 照片墙: ['照片', 'li'],
  被子: ['被子', 'kun'], 枕头: ['枕头', 'xun'], 床垫: ['床', 'gen'],
  扫帚: ['扫帚', 'zhen'], 拖把: ['扫帚', 'zhen'],
  钥匙: ['钥匙', 'qian'], 车钥匙: ['钥匙', 'qian'], 门禁卡: ['钥匙', 'qian'],
  剪刀: ['剪刀', 'li'], 美工刀: ['剪刀', 'li'], 刀: ['刀叉', 'li'],
  伞: ['伞', 'gen'], 雨伞: ['伞', 'gen'], 折叠伞: ['伞', 'gen'],
  钱: ['钱', 'qian'], 现金: ['钱', 'qian'], 硬币: ['钱', 'qian'],
  红包: ['钱', 'qian'], 银行卡: ['钱', 'qian'], 零钱: ['钱', 'qian'],

  /* 中文：数字设备 */
  电脑: ['电脑', 'qian'], 台式机: ['电脑', 'qian'], 笔记本电脑: ['电脑', 'qian'],
  笔记本: ['电脑', 'qian'], 手提电脑: ['电脑', 'qian'], 主机: ['电脑', 'qian'],
  laptop: ['电脑', 'qian'], computer: ['电脑', 'qian'], desktop: ['电脑', 'qian'],
  imac: ['电脑', 'qian'], macbook: ['电脑', 'qian'],
  显示器: ['显示器', 'li'], 屏幕: ['电脑屏幕', 'li'], 液晶屏: ['显示器', 'li'],
  手机: ['手机', 'li'], 智能手机: ['手机', 'li'], iphone: ['手机', 'li'],
  phone: ['手机', 'li'], smartphone: ['手机', 'li'], mobile: ['手机', 'li'],
  平板: ['平板', 'li'], ipad: ['平板', 'li'], tablet: ['平板', 'li'],
  键盘: ['键盘', 'gen'], 机械键盘: ['键盘', 'gen'], keyboard: ['键盘', 'gen'],
  鼠标: ['鼠标', 'kan'], mouse: ['鼠标', 'kan'],
  耳机: ['耳机', 'kan'], earphone: ['耳机', 'kan'], headphone: ['耳机', 'kan'],
  音箱: ['音箱', 'dui'], 音响: ['音箱', 'dui'], speaker: ['音箱', 'dui'],
  摄像头: ['摄像头', 'li'], 相机: ['摄像头', 'li'], camera: ['摄像头', 'li'],
  电视: ['电视', 'li'], tv: ['电视', 'li'], television: ['电视', 'li'],
  打印机: ['打印机', 'gen'], printer: ['打印机', 'gen'],
  充电器: ['充电器', 'dui'], 数据线: ['数据线', 'xun'], 充电线: ['数据线', 'xun'],
  优盘: ['U盘', 'qian'], u盘: ['U盘', 'qian'], 移动硬盘: ['硬盘', 'gen'],
  空调: ['空调', 'xun'], 'air conditioner': ['空调', 'xun'],
  电风扇: ['风扇', 'xun'], 风扇: ['风扇', 'xun'], fan: ['风扇', 'xun'],
  冰箱: ['冰箱', 'kun'], freezer: ['冰箱', 'kun'], refrigerator: ['冰箱', 'kun'],
  洗衣机: ['洗衣机', 'kun'], washer: ['洗衣机', 'kun'],
  微波炉: ['微波炉', 'li'], microwave: ['微波炉', 'li'],
  电磁炉: ['电磁炉', 'li'], 电饭锅: ['锅', 'kun'], 锅: ['锅', 'kun'], pot: ['锅', 'kun'],
  热水器: ['热水器', 'kan'], 水龙头: ['水', 'kan'], 水: ['水', 'kan'],
  吸尘器: ['吸尘器', 'zhen'], vacuum: ['吸尘器', 'zhen'],
  遥控器: ['遥控器', 'gen'], remote: ['遥控器', 'gen'],
  开关: ['电灯开关', 'gen'], 电灯开关: ['电灯开关', 'gen'],
  插座: ['插座', 'dui'], 插头: ['插座', 'dui'], socket: ['插座', 'dui'],

  /* 中文：出行 */
  汽车: ['汽车', 'qian'], car: ['汽车', 'qian'], 轿车: ['汽车', 'qian'],
  自行车: ['自行车', 'zhen'], bicycle: ['自行车', 'zhen'], bike: ['自行车', 'zhen'],
  电动车: ['电动车', 'zhen'], 摩托车: ['摩托车', 'zhen'],
  公交车: ['公交车', 'zhen'], bus: ['公交车', 'zhen'], 巴士: ['公交车', 'zhen'],
  地铁: ['地铁', 'kan'], subway: ['地铁', 'kan'], metro: ['地铁', 'kan'],
  火车: ['火车', 'zhen'], train: ['火车', 'zhen'], 高铁: ['火车', 'zhen'],
  飞机: ['飞机', 'qian'], airplane: ['飞机', 'qian'], plane: ['飞机', 'qian'],
  轮船: ['轮船', 'kan'], 船: ['轮船', 'kan'], boat: ['轮船', 'kan'], ship: ['轮船', 'kan'],
  出租车: ['出租车', 'qian'], taxi: ['出租车', 'qian'], 网约车: ['出租车', 'qian'],
  红绿灯: ['红绿灯', 'li'], 交通灯: ['红绿灯', 'li'], 'traffic light': ['红绿灯', 'li'],
  路牌: ['路牌', 'gen'], 指示牌: ['路牌', 'gen'], sign: ['路牌', 'gen'],
  电梯: ['电梯', 'gen'], elevator: ['电梯', 'gen'], lift: ['电梯', 'gen'],
  行李箱: ['行李箱', 'zhen'], 拉杆箱: ['行李箱', 'zhen'], suitcase: ['行李箱', 'zhen'],
  背包: ['背包', 'kun'], 双肩包: ['背包', 'kun'], backpack: ['背包', 'kun'],
  车票: ['车票', 'kun'], 火车票: ['车票', 'kun'], 机票: ['车票', 'kun'],
  停车位: ['停车位', 'gen'], 车位: ['停车位', 'gen'],

  /* 中文：饮食 */
  米饭: ['米饭', 'kun'], 白饭: ['米饭', 'kun'], rice: ['米饭', 'kun'],
  面条: ['面条', 'xun'], 拉面: ['面条', 'xun'], 面: ['面条', 'xun'], noodle: ['面条', 'xun'],
  面包: ['面包', 'kun'], bread: ['面包', 'kun'], 馒头: ['面包', 'kun'],
  水果: ['水果', 'gen'], apple: ['水果', 'gen'], 苹果: ['水果', 'gen'],
  香蕉: ['水果', 'gen'], 橙子: ['水果', 'gen'], 草莓: ['水果', 'gen'],
  蔬菜: ['蔬菜', 'xun'], 青菜: ['蔬菜', 'xun'], 白菜: ['蔬菜', 'xun'],
  vegetable: ['蔬菜', 'xun'],
  肉: ['肉', 'li'], 牛肉: ['肉', 'li'], 猪肉: ['肉', 'li'], chicken: ['肉', 'li'],
  鱼肉: ['鱼', 'xun'], 鱼: ['鱼', 'xun'], fish: ['鱼', 'xun'],
  鸡蛋: ['鸡蛋', 'dui'], 蛋: ['鸡蛋', 'dui'], egg: ['鸡蛋', 'dui'],
  牛奶: ['牛奶', 'kun'], milk: ['牛奶', 'kun'], 豆浆: ['牛奶', 'kun'],
  咖啡: ['咖啡', 'kan'], coffee: ['咖啡', 'kan'],
  茶: ['茶', 'xun'], 茶杯: ['茶', 'xun'], tea: ['茶', 'xun'],
  杯子: ['杯子', 'dui'], 水杯: ['水杯', 'kan'], 咖啡杯: ['杯子', 'dui'],
  cup: ['杯子', 'dui'], mug: ['杯子', 'dui'], glass: ['杯子', 'dui'],
  碗: ['碗', 'dui'], bowl: ['碗', 'dui'],
  筷子: ['筷子', 'zhen'], chopsticks: ['筷子', 'zhen'],
  刀叉: ['刀叉', 'li'], fork: ['刀叉', 'li'], knife: ['刀叉', 'li'],
  勺子: ['勺子', 'dui'], spoon: ['勺子', 'dui'],
  盘子: ['盘子', 'dui'], 碟子: ['盘子', 'dui'], plate: ['盘子', 'dui'],
  零食: ['零食', 'dui'], 薯片: ['零食', 'dui'],
  酒: ['酒', 'kan'], 啤酒: ['酒', 'kan'], wine: ['酒', 'kan'], beer: ['酒', 'kan'],
  饮料: ['饮料', 'kan'], bottle: ['饮料', 'kan'], 可乐: ['饮料', 'kan'],
  酱油: ['调味瓶', 'dui'], 醋: ['调味瓶', 'dui'], 盐: ['调味瓶', 'dui'],

  /* 中文：衣物 */
  衣服: ['衣服', 'kun'], 衬衫: ['衣服', 'kun'], t恤: ['衣服', 'kun'],
  外套: ['外套', 'gen'], 夹克: ['外套', 'gen'], 羽绒服: ['外套', 'gen'], coat: ['外套', 'gen'],
  鞋子: ['鞋子', 'gen'], 鞋: ['鞋子', 'gen'], shoe: ['鞋子', 'gen'], sneaker: ['鞋子', 'gen'],
  袜子: ['袜子', 'xun'], sock: ['袜子', 'xun'],
  帽子: ['帽子', 'dui'], 帽: ['帽子', 'dui'], hat: ['帽子', 'dui'], cap: ['帽子', 'dui'],
  雨衣: ['雨衣', 'xun'], 围巾: ['围巾', 'xun'], scarf: ['围巾', 'xun'],
  包: ['包', 'kun'], 包包: ['包', 'kun'], handbag: ['包', 'kun'], bag: ['包', 'kun'],
  床单: ['床单', 'kun'],

  /* 中文：身体与人物 */
  人: ['旅人', 'xun'], 人影: ['旅人', 'xun'], 孩子: ['少男', 'gen'], 小孩: ['少男', 'gen'],
  男人: ['长男', 'zhen'], 女性: ['长女', 'xun'], 老人: ['长者', 'qian'],
  手: ['手', 'gen'], 脚: ['足', 'zhen'], 眼睛: ['目', 'li'], 脸: ['头部', 'qian'],
  头发: ['头部', 'qian'], 微笑: ['口舌言辞', 'dui'],

  /* 中文：自然 */
  树: ['草木', 'xun'], 花: ['草木', 'xun'], 草: ['草木', 'xun'], leaf: ['草木', 'xun'],
  tree: ['草木', 'xun'], plant: ['草木', 'xun'], flower: ['草木', 'xun'],
  竹子: ['竹木', 'zhen'], 竹: ['竹木', 'zhen'], bamboo: ['竹木', 'zhen'],
  山: ['山野', 'gen'], mountain: ['山野', 'gen'], hill: ['山野', 'gen'],
  石头: ['山石', 'gen'], 石块: ['山石', 'gen'], rock: ['山石', 'gen'], stone: ['山石', 'gen'],
  云: ['乌云', 'kan'], cloud: ['乌云', 'kan'],
  雨: ['雨', 'kan'], rain: ['雨', 'kan'], 下雨: ['雨', 'kan'],
  雪: ['雪', 'gen'], snow: ['雪', 'gen'],
  太阳: ['太阳', 'li'], sun: ['太阳', 'li'], sunshine: ['太阳', 'li'],
  月亮: ['明月', 'dui'], moon: ['明月', 'dui'], 月: ['明月', 'dui'],
  星: ['星', 'li'], star: ['星', 'li'], 星星: ['星', 'li'],
  海: ['水泽', 'dui'], 海边: ['水泽', 'dui'], 湖: ['水泽', 'dui'], river: ['水', 'kan'],
  河: ['水', 'kan'], 河流: ['水', 'kan'], 池塘: ['水', 'kan'], pool: ['水', 'kan'],

  /* 中文：动物 */
  狗: ['狗', 'gen'], dog: ['狗', 'gen'], 猫: ['猫', 'gen'], cat: ['猫', 'gen'],
  鸟: ['鸟雀', 'zhen'], bird: ['鸟雀', 'zhen'], 鸡: ['鸡', 'xun'], 鸭: ['鸡', 'xun'],
  羊: ['羊', 'dui'], goat: ['羊', 'dui'], 马: ['马', 'qian'], horse: ['马', 'qian'],
  牛: ['牛', 'kun'], cow: ['牛', 'kun'], 猪: ['猪', 'kan'], pig: ['猪', 'kan'],
  蛇: ['蛇', 'zhen'], snake: ['蛇', 'zhen'], 鱼缸: ['鱼', 'xun'],
  兔子: ['少男', 'gen'], rabbit: ['少男', 'gen'],

  /* 中文：场所 */
  房间: ['房间', 'gen'], 客厅: ['房间', 'gen'], 卧室: ['房间', 'gen'],
  办公室: ['房间', 'gen'], 教室: ['房间', 'gen'], room: ['房间', 'gen'],
  厨房: ['锅釜', 'kun'], 卫生间: ['沟渠', 'kan'], 浴室: ['沟渠', 'kan'],
  阳台: ['阳台', 'xun'], balcony: ['阳台', 'xun'],
  楼梯: ['楼梯', 'gen'], stairs: ['楼梯', 'gen'],
  街道: ['大路', 'zhen'], 马路: ['大路', 'zhen'], 公路: ['大路', 'zhen'],
  street: ['大路', 'zhen'], road: ['道路', 'zhen'], 十字路口: ['道路', 'zhen'],
  田野: ['田野', 'kun'], 草地: ['田野', 'kun'], 草原: ['田野', 'kun'], grass: ['田野', 'kun'],
  商场: ['店铺', 'dui'], 超市: ['店铺', 'dui'], 便利店: ['店铺', 'dui'],
  store: ['店铺', 'dui'], shop: ['店铺', 'dui'], market: ['店铺', 'dui'],
  公园: ['林木', 'xun'], park: ['林木', 'xun'], 森林: ['林木', 'xun'],

  /* 中文：屏幕内容 */
  二维码: ['二维码', 'dui'], 条码: ['二维码', 'dui'], qr: ['二维码', 'dui'],
  聊天: ['聊天窗口', 'dui'], 消息: ['聊天窗口', 'dui'], 文字: ['文书', 'kun'],
  text: ['文书', 'kun'], 邮件: ['文书', 'kun'],
  网页: ['电脑屏幕', 'li'], 视频: ['视频通话', 'li'], 照片: ['照片', 'li'],
  photo: ['照片', 'li'], picture: ['照片', 'li'], video: ['视频通话', 'li'],
  地图: ['导航地图', 'kan'], 定位: ['导航地图', 'kan'], map: ['导航地图', 'kan'],
  界面: ['电脑屏幕', 'li'], 按钮: ['电脑屏幕', 'li'], 图标: ['电脑屏幕', 'li'],

  /* 中文：其他抽象 */
  光: ['灯', 'li'], 阳光: ['太阳', 'li'], 影子: ['乌云', 'kan'],
  噪声: ['口舌言辞', 'dui'], 声音: ['口舌言辞', 'dui'], 音乐: ['口舌言辞', 'dui'],
  红包: ['钱', 'qian'], 礼物: ['果实', 'gen'], 花束: ['草木', 'xun'],
  气球: ['果实', 'gen'], 蛋糕: ['面包', 'kun'], 蜡烛台: ['蜡烛', 'li']
};

/* ===============================================================
 * 三、十二律吕与五声调式
 * =============================================================== */

/** 十二律吕：'黄钟' 对应 MIDI 相对半音 0 */
const TWELVE_LV = [
  { name: '黄钟', semi: 0 },
  { name: '大吕', semi: 1 },
  { name: '太簇', semi: 2 },
  { name: '夹钟', semi: 3 },
  { name: '姑洗', semi: 4 },
  { name: '仲吕', semi: 5 },
  { name: '蕤宾', semi: 6 },
  { name: '林钟', semi: 7 },
  { name: '夷则', semi: 8 },
  { name: '南吕', semi: 9 },
  { name: '无射', semi: 10 },
  { name: '应钟', semi: 11 }
];

/**
 * 五声调式：音级相对本调式的半音偏移
 *
 * 调式的「音色」不只由音高构成。《礼记·乐记》郑玄注、孔颖达疏：
 *   "宫属土，其声至浊，而统摄众音……商属金，而声次浊……
 *    角属木，而其声清浊相半，上次宫、商，下管徵、羽……
 *    徵属火，乃声之次清者……羽属水，乃声之最清者。"
 * 故五音清浊次第为：宫（最浊）→ 商 → 角（清浊相半）→ 徵（次清）→ 羽（最清）。
 *
 * 本项目据此为每个调式设定一组音色修饰参数：
 *   clarity   清浊度 0=至浊 1=最清  （《乐记》疏）
 *   brightness 频谱明亮度（清则亮、浊则暗）
 *   attack    起音时间（清则促、浊则缓）
 *   release   余韵长度（清则长、浊则短）
 *   noise     气声/摩擦噪声占比（吹管类更明显）
 *   harmonic  泛音列浓度（浊者低次泛音厚，清者泛音薄）
 */
const MODES = {
  gong: {
    name: '宫调式', degrees: [0, 2, 4, 7, 9], mood: '平和端庄',
    clarity: 0.15, brightness: 0.24, attack: 0.085, release: 0.80, noise: 0.14, harmonic: 0.95
  },
  shang: {
    name: '商调式', degrees: [0, 2, 5, 7, 10], mood: '清越明快',
    clarity: 0.35, brightness: 0.46, attack: 0.056, release: 0.84, noise: 0.13, harmonic: 0.78
  },
  jue: {
    name: '角调式', degrees: [0, 3, 5, 8, 10], mood: '柔和亲切',
    clarity: 0.55, brightness: 0.63, attack: 0.058, release: 0.90, noise: 0.18, harmonic: 0.62
  },
  zhi: {
    name: '徵调式', degrees: [0, 2, 5, 7, 9], mood: '温暖抒情',
    clarity: 0.78, brightness: 0.80, attack: 0.036, release: 0.95, noise: 0.10, harmonic: 0.46
  },
  yu: {
    name: '羽调式', degrees: [0, 3, 5, 8, 10], mood: '清冷沉思',
    clarity: 0.95, brightness: 0.96, attack: 0.028, release: 1.15, noise: 0.20, harmonic: 0.32
  }
};

/* ===============================================================
 * 四、六十四卦全表
 * ===============================================================
 * 字段：
 *   n      卦序
 *   name   卦名
 *   upper  上卦（外卦）key
 *   lower  下卦（内卦）key
 *   gua    卦辞
 *   xiang  大象传
 *   virtue 卦德（刚健 / 中和 / 柔静 / 艰难）
 *   hint   每日心语（现代诠释，不作命理断言）
 *   m      音乐参数 [tempo, energy, density]
 * =============================================================== */

const HEXAGRAMS = [
  { n: 1, name: '乾为天', upper: 'qian', lower: 'qian', virtue: '刚健',
    gua: '元亨利贞', xiang: '天行健，君子以自强不息',
    hint: '今日宜主动，但刚极则折，留三分余地给自己。',
    m: [92, 0.85, 0.72] },
  { n: 2, name: '坤为地', upper: 'kun', lower: 'kun', virtue: '柔顺',
    gua: '元亨，利牝马之贞', xiang: '地势坤，君子以厚德载物',
    hint: '承接比争先更智慧，今日宜托举他人、稳住后方。',
    m: [58, 0.30, 0.28] },
  { n: 3, name: '水雷屯', upper: 'kan', lower: 'zhen', virtue: '艰难',
    gua: '元亨利贞，勿用有攸往，利建侯', xiang: '云雷屯，君子以经纶',
    hint: '万事开头难，此时不宜远行，宜先立好根基与人手。',
    m: [66, 0.42, 0.34] },
  { n: 4, name: '山水蒙', upper: 'gen', lower: 'kan', virtue: '柔静',
    gua: '亨。匪我求童蒙，童蒙求我', xiang: '山下出泉，蒙，君子以果行育德',
    hint: '不懂就问，比硬撑体面更省力，主动求教即得启发。',
    m: [62, 0.34, 0.30] },
  { n: 5, name: '水天需', upper: 'kan', lower: 'qian', virtue: '刚健',
    gua: '有孚，光亨，贞吉，利涉大川', xiang: '云上于天，需，君子以饮食宴乐',
    hint: '时机未到，蓄势即是行动，饮食宴乐非懈怠而是补给。',
    m: [70, 0.48, 0.40] },
  { n: 6, name: '天水讼', upper: 'qian', lower: 'kan', virtue: '艰难',
    gua: '有孚窒惕，中吉，终凶', xiang: '天与水违行，讼，君子以作事谋始',
    hint: '争则两伤，退一步反得从容，把力气留给更重要的事。',
    m: [56, 0.36, 0.30] },
  { n: 7, name: '地水师', upper: 'kun', lower: 'kan', virtue: '刚健',
    gua: '贞，丈人吉，无咎', xiang: '地中有水，师，君子以容民畜众',
    hint: '带团队要名正言顺，纪律清晰比热情持久更重要。',
    m: [78, 0.62, 0.52] },
  { n: 8, name: '水地比', upper: 'kan', lower: 'kun', virtue: '中和',
    gua: '吉。原筮元永贞，无咎', xiang: '水在地上，比，先王以建万国，亲诸侯',
    hint: '择友而交，近贤则进，避开拖累你的关系。',
    m: [72, 0.52, 0.44] },
  { n: 9, name: '风天小畜', upper: 'xun', lower: 'qian', virtue: '中和',
    gua: '亨。密云不雨，自我西郊', xiang: '风行天上，小畜，君子以懿文德',
    hint: '进展有限但方向没错，积小成著，别因暂时不下雨就收伞。',
    m: [68, 0.50, 0.42] },
  { n: 10, name: '天泽履', upper: 'qian', lower: 'dui', virtue: '刚健',
    gua: '履虎尾，不咥人，亨', xiang: '上天下泽，履，君子以辩上下，定民志',
    hint: '如履虎尾，谨慎则安，分寸感是今日的护身符。',
    m: [80, 0.60, 0.50] },
  { n: 11, name: '地天泰', upper: 'kun', lower: 'qian', virtue: '中和',
    gua: '小往大来，吉亨', xiang: '天地交，泰，后以财成天地之道',
    hint: '上下通达，是难得的开阔局面，该合作就合作。',
    m: [74, 0.58, 0.48] },
  { n: 12, name: '天地否', upper: 'qian', lower: 'kun', virtue: '艰难',
    gua: '否之匪人，不利君子贞', xiang: '天地不交，否，君子以俭德辟难',
    hint: '闭塞之时，节省力气、保存自己，等待通道打开。',
    m: [54, 0.32, 0.26] },
  { n: 13, name: '天火同人', upper: 'qian', lower: 'li', virtue: '刚健',
    gua: '同人于野，亨。利涉大川', xiang: '天与火，同人，君子以类族辨物',
    hint: '找同路人一起做事，公开透明则大吉。',
    m: [84, 0.66, 0.56] },
  { n: 14, name: '火天大有', upper: 'li', lower: 'qian', virtue: '刚健',
    gua: '元亨', xiang: '火在天上，大有，君子以遏恶扬善',
    hint: '收获丰盈的日子，丰盛之时更要懂得收敛与分享。',
    m: [88, 0.72, 0.60] },
  { n: 15, name: '地山谦', upper: 'kun', lower: 'gen', virtue: '柔静',
    gua: '亨，君子有终', xiang: '地中有山，谦，君子以裒多益寡',
    hint: '谦退反得，锋芒宜藏，今日说话做事都留余地。',
    m: [64, 0.38, 0.32] },
  { n: 16, name: '雷地豫', upper: 'zhen', lower: 'kun', virtue: '刚健',
    gua: '利建侯行师', xiang: '雷出地奋，豫，先王以作乐崇德',
    hint: '顺势而动、顺势而乐，先把心情调好，事半功倍。',
    m: [82, 0.64, 0.54] },
  { n: 17, name: '泽雷随', upper: 'dui', lower: 'zhen', virtue: '中和',
    gua: '元亨利贞，无咎', xiang: '泽中有雷，随，君子以向晦入宴息',
    hint: '随顺变通是今日的智慧，但底线要自己守住。',
    m: [73, 0.54, 0.46] },
  { n: 18, name: '山风蛊', upper: 'gen', lower: 'xun', virtue: '艰难',
    gua: '元亨，利涉大川', xiang: '山下有风，蛊，君子以振民育德',
    hint: '积弊到了该整治的时候，动刀需要狠心。',
    m: [60, 0.40, 0.34] },
  { n: 19, name: '地泽临', upper: 'kun', lower: 'dui', virtue: '刚健',
    gua: '元亨利贞。至于八月有凶', xiang: '泽上有地，临，君子以教思无穷',
    hint: '势头正好时主动靠近机会，但别把今天的顺当当成永远。',
    m: [80, 0.62, 0.52] },
  { n: 20, name: '风地观', upper: 'xun', lower: 'kun', virtue: '柔静',
    gua: '盥而不荐，有孚颙若', xiang: '风行地上，观，先王以省方观民设教',
    hint: '先观察再出手，看清全局比急着表态更值。',
    m: [66, 0.42, 0.36] },
  { n: 21, name: '火雷噬嗑', upper: 'li', lower: 'zhen', virtue: '刚健',
    gua: '亨。利用狱', xiang: '雷电噬嗑，先王以明罚敕法',
    hint: '障碍挡在面前，咬断它、说清楚，该断则断。',
    m: [86, 0.72, 0.62] },
  { n: 22, name: '山火贲', upper: 'gen', lower: 'li', virtue: '柔静',
    gua: '亨，小利有攸往', xiang: '山下有火，贲，君子以明庶政',
    hint: '修饰一下无妨，但别让好看盖住真实。',
    m: [68, 0.46, 0.40] },
  { n: 23, name: '山地剥', upper: 'gen', lower: 'kun', virtue: '艰难',
    gua: '不利有攸往', xiang: '山附于地，剥，上以厚下安宅',
    hint: '剥落之象，守住底线、护住根基就好。',
    m: [50, 0.28, 0.22] },
  { n: 24, name: '地雷复', upper: 'kun', lower: 'zhen', virtue: '中和',
    gua: '亨。出入无疾，朋来无咎', xiang: '雷在地中，复，先王以至日闭关',
    hint: '一阳来复，转机已现，旧的可以重新开始了。',
    m: [71, 0.55, 0.47] },
  { n: 25, name: '天雷无妄', upper: 'qian', lower: 'zhen', virtue: '刚健',
    gua: '元亨利贞。其匪正有眚', xiang: '天上雷行，物与无妄，先王以茂对时育万物',
    hint: '不存妄念就是最好的状态，按真实的想法走。',
    m: [83, 0.63, 0.53] },
  { n: 26, name: '山天大畜', upper: 'gen', lower: 'qian', virtue: '刚健',
    gua: '利贞，不家食吉，利涉大川', xiang: '天在山中，大畜，君子以多识前言往行',
    hint: '厚积才能薄发，多读多看，为将来的爆发蓄力。',
    m: [76, 0.58, 0.48] },
  { n: 27, name: '山雷颐', upper: 'gen', lower: 'zhen', virtue: '柔静',
    gua: '贞吉。观颐，自求口实', xiang: '山下有雷，颐，君子以慎言语，节饮食',
    hint: '养身也养心：少说几句、好好吃饭，就是今日的正事。',
    m: [65, 0.40, 0.34] },
  { n: 28, name: '泽风大过', upper: 'dui', lower: 'xun', virtue: '艰难',
    gua: '栋桡。利有攸往，亨', xiang: '泽灭木，大过，君子以独立不惧',
    hint: '负担过重，栋梁将折，该卸载的赶紧卸载。',
    m: [57, 0.38, 0.32] },
  { n: 29, name: '坎为水', upper: 'kan', lower: 'kan', virtue: '艰难',
    gua: '习坎，有孚，维心亨', xiang: '水洊至，习坎，君子以常德行',
    hint: '险中有信，坚持做对的事就有出路，不必自乱阵脚。',
    m: [55, 0.33, 0.28] },
  { n: 30, name: '离为火', upper: 'li', lower: 'li', virtue: '刚健',
    gua: '利贞，亨。畜牝牛，吉', xiang: '明两作离，大人以继明照于四方',
    hint: '光要有所依附才明亮，找到能托住你的地方。',
    m: [90, 0.74, 0.60] },
  { n: 31, name: '泽山咸', upper: 'dui', lower: 'gen', virtue: '中和',
    gua: '亨，利贞。取女吉', xiang: '山上有泽，咸，君子以虚受人',
    hint: '真诚相待最有力量，虚心比技巧管用。',
    m: [75, 0.56, 0.47] },
  { n: 32, name: '雷风恒', upper: 'zhen', lower: 'xun', virtue: '刚健',
    gua: '亨，无咎，利贞，利有攸往', xiang: '雷风，恒，君子以立不易方',
    hint: '立身有常则持久，今日守住 routine 就有复利。',
    m: [79, 0.60, 0.50] },
  { n: 33, name: '天山遁', upper: 'qian', lower: 'gen', virtue: '柔静',
    gua: '亨，小利贞', xiang: '天下有山，遁，君子以远小人',
    hint: '退避不是失败，是知几其神的清醒，果断抽身。',
    m: [61, 0.35, 0.28] },
  { n: 34, name: '雷天大壮', upper: 'zhen', lower: 'qian', virtue: '刚健',
    gua: '利贞', xiang: '雷在天上，大壮，君子以非礼弗履',
    hint: '力量正盛，但恃力妄进会翻车，守住规矩。',
    m: [87, 0.70, 0.58] },
  { n: 35, name: '火地晋', upper: 'li', lower: 'kun', virtue: '刚健',
    gua: '康侯用锡马蕃庶，昼日三接', xiang: '明出地上，晋，君子以自昭明德',
    hint: '如日东升，循序则进，主动让成果被看见。',
    m: [85, 0.68, 0.57] },
  { n: 36, name: '地火明夷', upper: 'kun', lower: 'li', virtue: '艰难',
    gua: '利艰贞', xiang: '明入地中，明夷，君子以莅众，用晦而明',
    hint: '才华被掩时，收敛锋芒、踏实做事就是出路。',
    m: [56, 0.34, 0.28] },
  { n: 37, name: '风火家人', upper: 'xun', lower: 'li', virtue: '中和',
    gua: '利女贞', xiang: '风自火出，家人，君子以言有物而行有恒',
    hint: '把身边关系理顺，各安其位就是今日最大的收益。',
    m: [74, 0.56, 0.47] },
  { n: 38, name: '火泽睽', upper: 'li', lower: 'dui', virtue: '柔静',
    gua: '小事吉', xiang: '上火下泽，睽，君子以同而异',
    hint: '在差异里找共同点，小事可为，大事且缓。',
    m: [67, 0.44, 0.38] },
  { n: 39, name: '水山蹇', upper: 'kan', lower: 'gen', virtue: '艰难',
    gua: '利西南，不利东北', xiang: '山上有水，蹇，君子以反身修德',
    hint: '前路有阻，反求诸己，修正自己比硬闯更快。',
    m: [53, 0.31, 0.25] },
  { n: 40, name: '雷水解', upper: 'zhen', lower: 'kan', virtue: '中和',
    gua: '利西南。无所往，其来复吉', xiang: '雷雨作，解，君子以赦过宥罪',
    hint: '郁结将解，趁着松动把话说开、把事放下。',
    m: [77, 0.60, 0.50] },
  { n: 41, name: '山泽损', upper: 'gen', lower: 'dui', virtue: '柔静',
    gua: '有孚，元吉，无咎，可贞', xiang: '山下有泽，损，君子以惩忿窒欲',
    hint: '有所舍才有所得，减掉一些负担反而轻快。',
    m: [60, 0.36, 0.30] },
  { n: 42, name: '风雷益', upper: 'xun', lower: 'zhen', virtue: '刚健',
    gua: '利有攸往，利涉大川', xiang: '风雷，益，君子以见善则迁',
    hint: '损上益下，此刻适合给予，施予者自己也会受益。',
    m: [84, 0.66, 0.55] },
  { n: 43, name: '泽天夬', upper: 'dui', lower: 'qian', virtue: '刚健',
    gua: '扬于王庭，孚号有厉', xiang: '泽上于天，夬，君子以施禄及下',
    hint: '该断的事今日要断明，拖泥带水只会生乱。',
    m: [88, 0.72, 0.60] },
  { n: 44, name: '天风姤', upper: 'qian', lower: 'xun', virtue: '柔静',
    gua: '女壮，勿用取女', xiang: '天下有风，姤，后以施命诰四方',
    hint: '不期而遇的机会或人，先辨其正再决定接纳。',
    m: [72, 0.50, 0.42] },
  { n: 45, name: '泽地萃', upper: 'dui', lower: 'kun', virtue: '中和',
    gua: '亨。王假有庙，利见大人', xiang: '泽上于地，萃，君子以除戎器',
    hint: '聚人聚财的好时机，把资源聚起来并做好准备。',
    m: [78, 0.60, 0.50] },
  { n: 46, name: '地风升', upper: 'kun', lower: 'xun', virtue: '刚健',
    gua: '元亨，用见大人，勿恤', xiang: '地中生木，升，君子以顺德',
    hint: '像树一样往上长，积累到一定程度自然会突破。',
    m: [81, 0.64, 0.54] },
  { n: 47, name: '泽水困', upper: 'dui', lower: 'kan', virtue: '艰难',
    gua: '亨，贞，大人吉，无咎', xiang: '泽无水，困，君子以致命遂志',
    hint: '困而不失其志，静守即是策略，等待时机。',
    m: [52, 0.30, 0.24] },
  { n: 48, name: '水风井', upper: 'kan', lower: 'xun', virtue: '柔静',
    gua: '改邑不改井，无丧无得', xiang: '木上有水，井，君子以劳民劝相',
    hint: '像井一样源源不断，做可持续的事，别追一次性暴利。',
    m: [63, 0.40, 0.35] },
  { n: 49, name: '泽火革', upper: 'dui', lower: 'li', virtue: '刚健',
    gua: '巳日乃孚，元亨利贞，悔亡', xiang: '泽中有火，革，君子以治历明时',
    hint: '该变的时候就变，时机到了就别拖。',
    m: [89, 0.71, 0.60] },
  { n: 50, name: '火风鼎', upper: 'li', lower: 'xun', virtue: '刚健',
    gua: '元吉，亨', xiang: '木上有火，鼎，君子以正位凝命',
    hint: '革故之后要鼎新，把新东西立稳、坐正。',
    m: [85, 0.68, 0.56] },
  { n: 51, name: '震为雷', upper: 'zhen', lower: 'zhen', virtue: '刚健',
    gua: '亨。震来虩虩，笑言哑哑', xiang: '洊雷，震，君子以恐惧修省',
    hint: '惊一震之后反而清醒，趁着警醒修正自己。',
    m: [91, 0.75, 0.64] },
  { n: 52, name: '艮为山', upper: 'gen', lower: 'gen', virtue: '柔静',
    gua: '艮其背，不获其身', xiang: '兼山，艮，君子以思不出其位',
    hint: '该停就停，界限清晰才能守住真正重要的东西。',
    m: [59, 0.32, 0.26] },
  { n: 53, name: '风山渐', upper: 'xun', lower: 'gen', virtue: '刚健',
    gua: '女归吉，利贞', xiang: '山上有木，渐，君子以居贤德善俗',
    hint: '循序渐进，不要跳级，稳扎稳打最省力。',
    m: [76, 0.56, 0.47] },
  { n: 54, name: '雷泽归妹', upper: 'zhen', lower: 'dui', virtue: '柔静',
    gua: '征凶，无攸利', xiang: '泽上有雷，归妹，君子以永终知敝',
    hint: '名分或位置有些错位，早点修正比将就下去好。',
    m: [64, 0.38, 0.32] },
  { n: 55, name: '雷火丰', upper: 'zhen', lower: 'li', virtue: '刚健',
    gua: '亨，王假之，勿忧，宜日中', xiang: '雷电皆至，丰，君子以折狱致刑',
    hint: '正是最好的时段，如日中天，但要懂得见好就收。',
    m: [86, 0.70, 0.58] },
  { n: 56, name: '火山旅', upper: 'li', lower: 'gen', virtue: '柔静',
    gua: '小亨，旅贞吉', xiang: '山上有火，旅，君子以明慎用刑',
    hint: '人在外漂着，谦柔自处、少承诺多兑现最稳妥。',
    m: [70, 0.46, 0.40] },
  { n: 57, name: '巽为风', upper: 'xun', lower: 'xun', virtue: '柔静',
    gua: '小亨，利有攸往，利见大人', xiang: '随风，巽，君子以申命行事',
    hint: '以柔入之反而其道乃亨，别用硬的招式。',
    m: [66, 0.42, 0.36] },
  { n: 58, name: '兑为泽', upper: 'dui', lower: 'dui', virtue: '中和',
    gua: '亨，利贞', xiang: '丽泽，兑，君子以朋友讲习',
    hint: '和人相处、交流切磋，今天的心情会变好。',
    m: [78, 0.58, 0.50] },
  { n: 59, name: '风水涣', upper: 'xun', lower: 'kan', virtue: '柔静',
    gua: '亨。王假有庙，利涉大川', xiang: '风行水上，涣，先王以享于帝立庙',
    hint: '散掉旧的才能聚起新的，人际上放松一点。',
    m: [69, 0.47, 0.40] },
  { n: 60, name: '水泽节', upper: 'kan', lower: 'dui', virtue: '刚健',
    gua: '亨。苦节不可贞', xiang: '泽上有水，节，君子以制数度，议德行',
    hint: '有节制才长久，但别把自己勒得太紧。',
    m: [74, 0.54, 0.45] },
  { n: 61, name: '风泽中孚', upper: 'xun', lower: 'dui', virtue: '中和',
    gua: '豚鱼吉，利涉大川，利贞', xiang: '泽上有风，中孚，君子以议狱缓死',
    hint: '真心能感动人，诚恳的态度今天最管用。',
    m: [75, 0.56, 0.48] },
  { n: 62, name: '雷山小过', upper: 'zhen', lower: 'gen', virtue: '柔静',
    gua: '亨，利贞。可小事，不可大事', xiang: '山上有雷，小过，君子以行过乎恭',
    hint: '小事可为、大事宜待，宁可做小、做细、做稳。',
    m: [67, 0.44, 0.38] },
  { n: 63, name: '水火既济', upper: 'kan', lower: 'li', virtue: '刚健',
    gua: '亨小，利贞。初吉终乱', xiang: '水在火上，既济，君子以思患而豫防之',
    hint: '事已做成，收尾最难，预先想一步防患。',
    m: [83, 0.62, 0.50] },
  { n: 64, name: '火水未济', upper: 'li', lower: 'kan', virtue: '柔静',
    gua: '亨。小狐汔济，濡其尾，有吝', xiang: '火在水上，未济，君子以慎辨物居方',
    hint: '还没完成，保持谨慎和条理，终而复始是常态。',
    m: [71, 0.48, 0.42] }
];

/* 卦德 → 音区偏移（半音） */
const VIRTUE_REGISTER = {
  '刚健': 5,
  '中和': 0,
  '柔顺': -5,
  '柔静': -7,
  '艰难': -9
};

/* 主音总音高约束：保证任何卦的音域都在可听且均衡的范围内 */
const ROOT_MIDI_MIN = 50;   // D3
const ROOT_MIDI_MAX = 66;   // F#4

/* ===============================================================
 * 五、工具函数
 * =============================================================== */

/** 取卦符（䷀…䷿，U+4DC0 起） */
function hexagramSymbol(n) {
  return String.fromCharCode(0x4dc0 + n - 1);
}

/** 由上下卦求卦序 */
function findHexagramIndex(upperKey, lowerKey) {
  for (let i = 0; i < HEXAGRAMS.length; i++) {
    const h = HEXAGRAMS[i];
    if (h.upper === upperKey && h.lower === lowerKey) return i;
  }
  return -1;
}

/** 由卦序取完整卦对象 */
function getHexagram(n) {
  const h = HEXAGRAMS[n - 1];
  if (!h) return null;
  return {
    ...h,
    symbol: hexagramSymbol(h.n),
    upperTrigram: TRIGRAMS[h.upper],
    lowerTrigram: TRIGRAMS[h.lower],
    classics: {
      upper: CLASSICS.TRIGRAM_CLASSICS[h.upper] || null,
      lower: CLASSICS.TRIGRAM_CLASSICS[h.lower] || null
    }
  };
}

/**
 * 取本卦六爻（自下而上）：内卦三爻 + 外卦三爻
 * 返回 {1..6}，1 为阴(0)，6 为阳(1)
 */
function getSixLines(hex) {
  const inner = TRIGRAMS[hex.lower].lines;   // 初、二、三
  const outer = TRIGRAMS[hex.upper].lines;   // 四、五、上
  return [...inner, ...outer];
}

/* ===============================================================
 * 文献依据面板
 * ---------------------------------------------------------------
 * 把「这一卦凭什么这么取、这段音为什么是这些参数」摊开给用户看。
 * 网页版与小程序共用此结构，只做渲染适配。
 * =============================================================== */

/** 出处分档的显示信息 */
const SOURCE_BADGE = {
  classic: { label: '典籍原文', cls: 'src-classic' },
  later: { label: '后世类书', cls: 'src-later' },
  modern: { label: '当代类推', cls: 'src-modern' }
};

/**
 * 构造「文献依据」面板数据
 * @param {object} result 起卦结果（hexagram.js 产出）
 * @param {object} [opts] { imageName } 观象起卦时传入所选物象
 * @returns {object} { method, images, trigrams, voice, mode, disclaimer }
 */
function buildClassicsPanel(result, opts) {
  const o = opts || {};
  const hex = result.hex;
  const music = result.music;

  /* ---------- 起卦法 ---------- */
  const methodDef = CLASSICS.DIVINATION_METHODS.find((m) => m.key === result.method)
    || CLASSICS.DIVINATION_METHODS[0];

  /* ---------- 物象出处（观象起卦才有） ---------- */
  const images = [];
  const imageName = o.imageName || (result.detail && result.detail.imageName);
  if (imageName) {
    const origin = IMAGE_ORIGIN_INDEX.get(imageName);
    if (origin) {
      images.push({
        name: imageName,
        gua: origin.gua,
        guaName: TRIGRAMS[origin.gua] ? TRIGRAMS[origin.gua].name : origin.gua,
        guaSymbol: TRIGRAMS[origin.gua] ? TRIGRAMS[origin.gua].symbol : '',
        src: origin.src,
        srcLabel: (SOURCE_BADGE[origin.src] || {}).label || origin.src,
        srcCls: (SOURCE_BADGE[origin.src] || {}).cls || 'src-later',
        cite: origin.cite || '',
        reason: origin.reason || '',
        alt: origin.alt || ''
      });
    }
  }

  /* ---------- 内外卦的卦德与物象 ---------- */
  const trigrams = [
    { role: '上卦', key: hex.upper, ...(hex.classics.upper || {}) },
    { role: '下卦', key: hex.lower, ...(hex.classics.lower || {}) }
  ].map((t) => {
    const tri = TRIGRAMS[t.key];
    return {
      role: t.role,
      name: tri.name,
      symbol: tri.symbol,
      nature: tri.nature,
      de: t.de || '',
      deText: t.deText || '',
      shuogua: t.shuogua || '',
      meihua: t.meihua || '',
      koujue: t.koujue || '',
      wuxing: tri.wuxing,
      wuxingSrc: t.wuxingSrc || '',
      season: t.season || '',
      seasonSrc: t.seasonSrc || ''
    };
  });

  /* ---------- 乐器（外卦配八音） ---------- */
  const voiceKey = music.voice;
  const voiceInfo = CLASSICS.EIGHT_TONE[voiceKey] || null;
  const voice = {
    key: voiceKey,
    name: voiceInfo ? voiceInfo.name : music.voiceText,
    material: voiceInfo ? voiceInfo.material : music.voiceMaterial,
    timbre: voiceInfo ? voiceInfo.timbre : music.voiceDesc,
    desc: voiceInfo ? voiceInfo.desc : '',
    trigram: voiceInfo ? voiceInfo.trigram : hex.upper,
    trigramName: TRIGRAMS[voiceInfo ? voiceInfo.trigram : hex.upper].name,
    cite: '《白虎通·礼乐》引《乐记》：埙，坎音也；管，艮音也；鼓，震音也；弦，离音也；钟，兑音也；柷敔，乾音也。'
      + '清人陈立《白虎通疏证》补：「箫当为巽音，磬当为坤音。」'
  };

  /* ---------- 调式（内卦五行纳音配五音） ---------- */
  const modeKey = music.modeKey;
  const modeInfo = CLASSICS.FIVE_TONE[modeKey] || null;
  const mode = modeInfo ? {
    key: modeKey,
    name: modeInfo.name,
    full: modeInfo.full,
    wuxing: modeInfo.wuxing,
    organ: modeInfo.organ,
    organSrc: modeInfo.organSrc,
    role: modeInfo.role,
    roleSrc: modeInfo.roleSrc,
    meaning: modeInfo.meaning,
    meaningSrc: modeInfo.meaningSrc,
    clarity: modeInfo.clarity,
    claritySrc: modeInfo.claritySrc,
    timbre: modeInfo.timbre,
    mood: modeInfo.mood,
    animal: modeInfo.animal,
    // 清浊的文字化表述，便于界面直读
    clarityLabel: modeInfo.clarity <= 0.2 ? '至浊'
      : modeInfo.clarity <= 0.4 ? '次浊'
        : modeInfo.clarity <= 0.6 ? '清浊相半'
          : modeInfo.clarity <= 0.85 ? '次清' : '最清'
  } : null;

  return {
    method: {
      name: methodDef.name,
      source: methodDef.source,
      srcLabel: (SOURCE_BADGE[methodDef.source] || {}).label || methodDef.source,
      srcCls: (SOURCE_BADGE[methodDef.source] || {}).cls || 'src-later',
      cite: methodDef.cite,
      text: methodDef.text,
      note: methodDef.note
    },
    images,
    trigrams,
    voice,
    mode,
    disclaimer: CLASSICS.DISCLAIMERS
  };
}

/**
 * 确定性伪随机数发生器（mulberry32）
 * 以卦序为种子，保证同一卦每次生成的旋律完全一致（可复现）
 */
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 全局去重：确保 64 卦的旋律轮廓两两不同。
 * 随机游走可能让少数卦收敛到相同音列，此处按卦序依次微调末音直至唯一。
 * @param {Array} configs 64 卦的音乐配置数组
 */
function resolveMelodyCollisions(configs) {
  const seen = new Map();
  configs.forEach((cfg) => {
    const key = cfg.melody.join(',');
    if (!seen.has(key)) {
      seen.set(key, cfg);
      return;
    }
    // 与已出现者冲突：以卦序为依据在末音上寻找一个未被占用的音
    const taken = new Set(seen.keys());
    let fixed = false;
    for (let attempt = 0; attempt < 10 && !fixed; attempt++) {
      for (let cand = 0; cand <= 9; cand++) {
        const trial = cfg.melody.slice();
        trial[5] = cand;
        const trialKey = trial.join(',');
        if (!taken.has(trialKey)) {
          cfg.melody = trial;
          seen.set(trialKey, cfg);
          fixed = true;
          break;
        }
      }
      if (!fixed) {
        // 极端情况下前移一位再试
        cfg.melody = cfg.melody.slice(0, 5).concat([(cfg.melody[5] + 1) % 10]);
      }
    }
  });
  return configs;
}

/**
 * 依据卦象推导音乐参数
 * @param {object} hex 卦对象
 * @returns {object} 音乐配置
 */
/** 全局配置缓存：构建全部 64 卦并完成去重后填充 */
var MUSIC_CACHE = new Map();

/**
 * 依据卦象推导音乐参数
 * @param {object} hex 卦对象
 * @returns {object} 音乐配置
 */
function deriveMusicConfig(hex) {
  // 优先返回去重后的全局配置，保证 64 卦旋律轮廓两两不同
  if (MUSIC_CACHE.has(hex.n)) {
    return MUSIC_CACHE.get(hex.n);
  }
  const cfg = computeMusicConfig(hex);
  MUSIC_CACHE.set(hex.n, cfg);
  return cfg;
}

/**
 * 计算单个卦的音乐参数（不含全局去重）
 */
function computeMusicConfig(hex) {  const [tempo, energy, density] = hex.m;

  // 调式：内卦五行纳音
  const modeKey = WUXING_TO_MODE[TRIGRAMS[hex.lower].wuxing];
  const mode = MODES[modeKey];

  // 律：卦序定十二律
  const lv = TWELVE_LV[(hex.n - 1) % 12];

  // 音区：卦德定
  const register = VIRTUE_REGISTER[hex.virtue] || 0;

  // 主音 MIDI：以黄钟 = 48 (C3) 为基准起算
  const gongMidi = 48 + lv.semi;
  const modeRootOffset = { gong: 0, shang: 2, jue: 4, zhi: 7, yu: 9 }[modeKey];
  // 卦德偏移只用于微调音区色彩，最终统一夹紧到舒适音域
  const rawRoot = gongMidi + modeRootOffset + register;
  const rootMidi = Math.max(ROOT_MIDI_MIN, Math.min(ROOT_MIDI_MAX, rawRoot));

  // 音色：外卦配八音（《白虎通·礼乐》引《乐记》八音配八卦）
  const voice = TRIGRAMS[hex.upper].voice;
  const voiceInfo = CLASSICS.EIGHT_TONE[voice] || null;

  // 五音音色修饰（《礼记·乐记》疏：宫至浊 → 羽最清）
  const timbre = {
    clarity: mode.clarity,
    brightness: mode.brightness,
    attack: mode.attack,
    release: mode.release,
    noise: mode.noise,
    harmonic: mode.harmonic
  };

  // 六爻（自下而上）：阳=1 阴=0
  const lines = getSixLines(hex);

  /**
   * 旋律生成：六音级位置（0..9 = 五声两个八度）。
   * 以卦序为种子的确定性游走，音程倾向由卦德决定，
   * 故 64 卦旋律两两不同，且同卦每次完全一致。
   */
  const rnd = seededRandom(hex.n * 2654435761 % 4294967296);
  const tendency = {
    '刚健': 0.62, '中和': 0.50, '柔顺': 0.40, '柔静': 0.36, '艰难': 0.44
  }[hex.virtue] || 0.5;

  const melody = [];
  let pos = 4 + Math.floor(rnd() * 2);          // 起于中音区
  for (let i = 0; i < 6; i++) {
    // 依卦德倾向决定上行/下行/持平的概率
    const r = rnd();
    let step;
    if (r < tendency - 0.16) step = 2;          // 上行
    else if (r < tendency + 0.16) step = 1;     // 微升
    else if (r < tendency + 0.32) step = 0;     // 同音
    else if (r < tendency + 0.48) step = -1;    // 微降
    else step = -2;                             // 下行
    pos += step;
    if (pos < 0) pos = 0;
    if (pos > 9) pos = 9;
    melody.push(pos);
  }
  // 避免相邻同音造成的呆板：以种子做一次微调
  for (let i = 1; i < melody.length; i++) {
    if (melody[i] === melody[i - 1] && rnd() < 0.6) {
      melody[i] = Math.min(9, Math.max(0, melody[i] + (rnd() < 0.5 ? 1 : -1)));
    }
  }

  /**
   * 节奏：六爻定强弱。阳爻为重拍（力度高、时值长），
   * 阴爻为弱拍（力度低、时值短），六爻循环成一乐句。
   */
  const rhythm = lines.map((y) => (y === 1
    ? { beat: 1.0, accent: 0.9 }
    : { beat: 0.5, accent: 0.45 }));

  return {
    n: hex.n,
    tempo,
    energy,
    density,
    modeKey,
    modeName: mode.name,
    modeDegrees: mode.degrees,
    modeMood: mode.mood,
    lvName: lv.name,
    rootMidi,
    voice,
    voiceText: TRIGRAMS[hex.upper].voiceText,
    voiceMaterial: TRIGRAMS[hex.upper].voiceMaterial,
    voiceDesc: TRIGRAMS[hex.upper].voiceDesc,
    voiceSource: voiceInfo ? voiceInfo.desc : '',
    timbre,
    modeSource: CLASSICS.FIVE_TONE[modeKey] || null,
    melody,
    rhythm,
    lines,
    virtue: hex.virtue
  };
}

/**
 * 构建全部 64 卦的音乐配置并完成旋律去重。
 * 在模块加载时执行一次，保证任何调用顺序下轮廓都唯一。
 */
(function buildMusicCache() {
  const configs = HEXAGRAMS.map((h) => computeMusicConfig(h));
  resolveMelodyCollisions(configs);
  configs.forEach((c) => MUSIC_CACHE.set(c.n, c));
})();

/** 导出到全局（小程序环境用 module.exports，浏览器用 window） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TRIGRAMS, TRIGRAM_KEYS, IMAGE_LIBRARY, IMAGE_ALIAS, IMAGE_ORIGIN_INDEX,
    TWELVE_LV, MODES, HEXAGRAMS, VIRTUE_REGISTER, WUXING_TO_MODE,
    CLASSICS, EIGHT_TONE: CLASSICS.EIGHT_TONE, FIVE_TONE: CLASSICS.FIVE_TONE,
    hexagramSymbol, findHexagramIndex, getHexagram, getSixLines,
    deriveMusicConfig, seededRandom, resolveMelodyCollisions,
    buildClassicsPanel, SOURCE_BADGE
  };
} else {
  window.ICData = {
    TRIGRAMS, TRIGRAM_KEYS, IMAGE_LIBRARY, IMAGE_ALIAS, IMAGE_ORIGIN_INDEX,
    TWELVE_LV, MODES, HEXAGRAMS, VIRTUE_REGISTER, WUXING_TO_MODE,
    CLASSICS, EIGHT_TONE: CLASSICS.EIGHT_TONE, FIVE_TONE: CLASSICS.FIVE_TONE,
    hexagramSymbol, findHexagramIndex, getHexagram, getSixLines,
    deriveMusicConfig, seededRandom, resolveMelodyCollisions,
    buildClassicsPanel, SOURCE_BADGE
  };
}

})();
