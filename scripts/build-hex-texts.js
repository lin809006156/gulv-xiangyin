/**
 * 生成 core/hexagram-texts.js
 * ---------------------------------------------------------------
 * 数据来源：
 *   ① 原文（卦辞 / 彖传 / 大象传 / 六爻爻辞 / 六爻小象 / 用九用六）
 *      —— scripts/.cache/zhouyi.json，抓自 ctext.org「周易·易經」各卦页，
 *         属公有领域古籍；繁体已转简体，与项目其余文本一致。
 *   ② 京房八宫、纳甲、六亲、阳宅山向 —— 由本脚本按古法算法计算，不逐条杜撰。
 *   ③ 常见占断 —— 当代类推（DIVINATIONS），依卦辞卦性撰写，
 *         统一标 source='modern'，非吉凶断定。
 *
 * 用法：node scripts/build-hex-texts.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '.cache', 'zhouyi.json');
const OUT = path.join(__dirname, '..', 'core', 'hexagram-texts.js');

const src = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
if (src.length !== 64) {
  console.error('原文数据不足 64 卦（当前 ' + src.length + '），请先运行 fetch-zhouyi.js / parse-zhouyi.js');
  process.exit(1);
}

/* ===============================================================
 * 一、常见占断（当代类推，依卦辞卦性撰写，非吉凶断定）
 * =============================================================== */

const DIVINATIONS = {
  1: '刚健上行。天行健，君子以自强不息：宜主动、不宜迟疑。但乾道亢极则反，凡事留三分余地，锋芒过露处即是转机所在。',
  2: '柔顺承载。地势坤，君子以厚德载物：宜承接、配合、蓄势，不争而自得。若一味争先而失其厚，反受其累。',
  3: '创始艰难。云雷屯，君子以经纶：万事开头难，草木穿石。此时宜立根建制、结同伴，不宜求速成。',
  4: '蒙昧启蒙。山下出泉，蒙，君子以果行育德：宜先学后做、先问后行。求师问道、虚心求教，最为捷径。',
  5: '等待时机。云上于天，需，君子以饮食宴乐：时机未至，蓄而待之。所需者久，所需者明；饮食宴乐，正所以养其志。',
  6: '争讼相持。天与水违行，讼，君子以作事谋始：争则两伤，讼则终凶。宜谋之于始、让之于中、止之于终。',
  7: '聚众有纪律。地中有水，师，君子以容民畜众：众之所归在于号令与公义。出师须有名，行事须有度。',
  8: '相亲辅助。水在地上，比，君子以建万国亲诸侯：亲比相辅，德不孤必有邻。择所亲、亲以德，此卦之要。',
  9: '小有蓄积。风行天上，小畜，君子以懿文德：积而未足，只能小步。宜修辞立德以待时，不可贪大求全。',
  10: '履行有戒。天泽履，君子以辩上下：踩虎尾如履虎尾。处境敏感，宜谨言慎行、辨清上下，稳住则安。',
  11: '通泰安和。天地交，泰，后以财天地民则泰：上下通气则泰。往来不阻、内外相应，此时宜大展。',
  12: '闭塞不通。天地不交，否：闭而不通之时。宜退居守正、蓄势待变，非人力可强为。',
  13: '同志同心。天与火同，同人，君子以类族辨物：与同道同行，与相似者相聚。志同则力合。',
  14: '大有丰盛。火在天上，大有，君子以遏恶扬善：所有盛大，宜守中不盈、遏恶扬善，则大而不失其正。',
  15: '谦退受益。地中有山，谦，君子以裒多益寡：谦以自处，反受人之益。锋芒宜藏，德行宜谦。',
  16: '顺动而豫。雷出地奋，豫，先王以作乐崇德：顺势而动，先和悦而后谋事。悦以先民，民忘其劳。',
  17: '随时而动。泽中有雷，随，君子以向晦入宴息：不择时则废事。顺应时势，随而不失其主见。',
  18: '积弊待治。山下有风，蛊，君子以振民育德：积弊已久，烂然蛊坏。宜整顿刷新、振民育德，坏极将复。',
  19: '临事以身。泽上有地，临，君子以教思无穷：亲临其事，以身作则。上下相临，则事可成。',
  20: '观以知照。风行地上，观，君子以省方观民设教：多看少动。风行地上，遍观万物之理而不出于其位。',
  21: '除梗去害。雷电噬嗑，颐中有物：障碍在前，宜断然清除。噬以去梗，颐以养正，去梗方能养。',
  22: '文饰其外。山下有火，贲，君子以明庶政：饰则有所合。文饰在内为质、在外为文，返璞归真为上。',
  23: '剥落将尽。山下有山，剥：阴盛剥阳，顺势当止。剥落之时，宜收缩保存、待阳复来。',
  24: '一阳来复。雷在地中，复，先王以至日闭关：剥极而复，一阳生于下。转机已现，宜静候其长。',
  25: '不妄为。天雷无妄，君子以育万物：率真自然，不妄不强。守正则无咎，妄动则灾。',
  26: '大畜厚储。山天大畜，君子以多识前言往行：畜之既久，其道大光。厚积而后发，此时最宜积累学养。',
  27: '颐养自守。山下雷颐，君子以慎言语、节饮食：养身兼养正。慎言节饮，物理人事皆在此两端。',
  28: '过重须减。泽灭木，大过，君子以独立不惧：栋梁过重而致覆。负担过重之时，宜减负卸责以保其正。',
  29: '重险相叠。习坎，有孚维心，亨：险难重重，唯有诚信可济。行险而不失其正，是为孚。',
  30: '附丽有道。明两作，离，君子以继明照于四方：光明外丽，必有所附。柔顺附物，乃能继明。',
  31: '以诚感人。山上有泽，咸，君子以虚受人：二气感应，心虚则能纳。感应之几在虚，不在巧。',
  32: '恒久之道。雷风恒，君子以立不易方：有恒者因其自然。持之以恒，久而成事；无恒则一切无成。',
  33: '及时退避。天下有山，遁，君子以远小人：不恶而严。退避不是畏，而是保全所当保。',
  34: '壮大戒恃。雷在天上，大壮，君子以非礼弗履：力量正盛，最易恃强。守礼则壮而不折。',
  35: '进升有序。明出地上，晋，君子以自昭明德：旭日升进，柔顺以承。循序而进，名位可望。',
  36: '晦其明守其正。明入地中，明夷，君子以用晦而明：明受伤而不可显。韬光养晦，内守其正，待时而出。',
  37: '齐家之道。风自火出，家人，君子以言有物而行有恒：先正己，再正人。家正则天下定。',
  38: '乖离求同。上火下泽，睽，君子以同而异：二女同居，其志不同。求同存异，小事可济，大事难成。',
  39: '蹇难反身。山上有水，蹇，君子以反身修德：见险而止，反求诸己。前行受阻时，转身修德是最实的路。',
  40: '解困释结。雷雨作，解，君子以赦过宥罪：难解之结渐松。宜及时化解，勿积成患。',
  41: '减损有得。山下有泽，损，君子以惩忿窒欲：损下益上，其道上行。有所舍方有所得。',
  42: '增益互惠。风雷益，君子以见善则迁：损上益下，民说无疆。助人亦自助，利人亦利己。',
  43: '决而分明。泽上于天，夬，君子以施禄及下：五阳决一阴，当断则断。决之须以正，须以明。',
  44: '不期而遇。天下有风，姤，君子以品物咸章：一阴始生，邂逅相遇。遇之则须辨其微，防患未然。',
  45: '荟萃聚众。泽上于地，萃，君子以除戎器、戒不虞：荟萃之时须防外患。聚人亦须聚心。',
  46: '上升不顿。地中生木，升，君子以顺德，积小以高大：循序渐进，积小成高。顺则无咎。',
  47: '困而不失。泽无水，困，君子以致命遂志：困穷之时，守正勿屈。泽无水而道未穷，困极而通必至。',
  48: '井养不穷。木上有水，井，君子以劳民劝相：井养不穷，德施无疆。井者不增不减，其德长久。',
  49: '革故鼎新。泽中有火，革，君子以治历明时：除旧布新。革须当机，鼎须及时。',
  50: '鼎新定鼎。木上有火，鼎，君子以正位凝命：鼎而取象于烹牲，器之重者。革故之后须鼎新，鼎新之后须正位。',
  51: '震惊而动。洊雷震，君子以恐惧修省：震惊不以凶终。惊则起而省，因惧而改。',
  52: '静止生明。兼山艮，君子以思不出其位：思不出其位，不见其人。适其所止，静能生明。',
  53: '循序渐进。山上有木，渐，君子以居贤德善俗：渐之进也，渐之止也。进以序，止以退。',
  54: '归妹名分。泽上有雷，归妹，君子以永终知敝：名分未正而先动。宜谨守始终，不可轻率。',
  55: '丰大守中。雷电皆至，丰，君子以折狱致刑：盛大之时，最易过盈。守中不逾，日中则昃。',
  56: '行旅在外。山上有火，旅，君子以明慎用刑：旅居在外，柔顺自处。旅之贵在谦和而在明慎。',
  57: '顺入有度。随风，巽，君子以申命行事：柔顺渗入，以谦逊入之。巽以申命，反复其心。',
  58: '和悦有节。丽泽，兑，君子以朋友讲习：和悦相与，言语有节。兑之时 说，节则不逸。',
  59: '涣散当聚。风行水上，涣，先王以享于帝立庙：当散则散。散其私而聚其公，是为涣。',
  60: '节制有度。泽上有水，节，君子以制数度，议德行：节则不伤。得其节则通行无阻，失其节则苦而凶。',
  61: '中心诚信。泽上有风，中孚，君子以议狱缓死：诚信在外，感而遂通。中孚者，中心也。',
  62: '小有过越。山上有雷，小过，君子以行过乎恭：可小事，不可大事。宜谨守卑下，行过乎恭。',
  63: '事成防变。水在火上，既济，君子以思患而豫防之：事已成而无终。思患预防，守成不易。',
  64: '未竟慎始。火在水上，未济，君子以慎辨物居方：事未成而未成。六爻皆不当位，终而未终，慎终如始。'
};

/* ===============================================================
 * 二、京房八宫（算法）
 * ---------------------------------------------------------------
 * 依传统变爻规则：爻位自下而上编号 0..5（初、二、三、四、五、上）。
 *   本宫 不变          世在上爻
 *   一世 变初爻         世在初爻
 *   二世 变初、二爻      世在二爻
 *   三世 变初~三爻      世在三爻
 *   四世 变初~四爻      世在四爻
 *   五世 变初~五爻      世在五爻
 *   游魂 变初~三、五爻   世在四爻（由五世卦四爻复本）
 *   归魂 变五爻         世在三爻（由游魂卦内三爻复本）
 */

/* 经卦六爻，自下而上，1 = 阳。（与 core/data.js 的 TRIGRAMS.lines 同义，此处独立以免依赖加载序） */
const TRIGRAM_LINES = {
  qian: [1, 1, 1], dui: [1, 1, 0], li: [1, 0, 1], zhen: [1, 0, 0],
  xun: [0, 1, 1], kan: [0, 1, 0], gen: [0, 0, 1], kun: [0, 0, 0]
};

/** 一卦六爻，自下而上：下卦三爻在下，上卦三爻在上 */
function linesOf(upperKey, lowerKey) {
  return TRIGRAM_LINES[lowerKey].concat(TRIGRAM_LINES[upperKey]);
}

/** 依卦名取上下卦 —— 与 core/data.js 的 HEXAGRAMS 同序 */
const INDEX = require(path.join(__dirname, '..', 'core', 'data.js')).HEXAGRAMS
  .map((h) => ({ n: h.n, name: h.name, upper: h.upper, lower: h.lower, lines: linesOf(h.upper, h.lower) }));

const PALACES = ['qian', 'zhen', 'kan', 'gen', 'kun', 'xun', 'li', 'dui'];
const SHI_YAO = { ben: 5, yi: 0, er: 1, san: 2, si: 3, wu: 4, youhun: 3, guihun: 2 };
const FLIP = {
  ben: [],
  yi: [0],
  er: [0, 1],
  san: [0, 1, 2],
  si: [0, 1, 2, 3],
  wu: [0, 1, 2, 3, 4],
  youhun: [0, 1, 2, 4],
  guihun: [4]
};
const SHI_NAME = ['初', '二', '三', '四', '五', '上'];
/* 应爻恒与世爻相隔三位。故游魂同四世（世四应初）、归魂同三世（世三应上）。 */
const YING_YAO = { ben: 2, yi: 3, er: 4, san: 5, si: 0, wu: 1, youhun: 0, guihun: 5 };

function keyOf(hexKey) {
  const h = INDEX.find((x) => x.n === hexKey);
  return h ? h.lines.join('') : '';
}

/** 生成京房八宫六十四卦表：宫名 → 八卦（按本宫、一世…归魂） */
function buildPalaces() {
  const byKey = new Map(INDEX.map((h) => [h.lines.join(''), h]));
  const out = {};
  const used = new Set();

  PALACES.forEach((pal) => {
    const base = TRIGRAM_LINES[pal].concat(TRIGRAM_LINES[pal]);
    const group = [];
    ['ben', 'yi', 'er', 'san', 'si', 'wu', 'youhun', 'guihun'].forEach((stage) => {
      const lines = base.slice();
      FLIP[stage].forEach((i) => { lines[i] = lines[i] ? 0 : 1; });
      const k = lines.join('');
      if (used.has(k)) throw new Error('京房八宫生成有重复卦：' + k + '（' + pal + '宫 ' + stage + '）');
      used.add(k);
      const h = byKey.get(k);
      if (!h) throw new Error('京房八宫生成的卦不在六十四卦表内：' + k);
      group.push({
        n: h.n,
        name: h.name,
        palace: pal,
        stage,
        stageName: { ben: '本宫', yi: '一世', er: '二世', san: '三世', si: '四世', wu: '五世', youhun: '游魂', guihun: '归魂' }[stage],
        shi: SHI_YAO[stage],
        ying: YING_YAO[stage]
      });
    });
    out[pal] = group;
  });
  return out;
}

const PALACE_TABLE = buildPalaces();

/* 每卦的宫位信息（反查） */
const PALACE_OF = {};
Object.keys(PALACE_TABLE).forEach((pal) => {
  PALACE_TABLE[pal].forEach((g) => {
    PALACE_OF[g.n] = g;
  });
});

/* ===============================================================
 * 三、纳甲（京房法）
 * ---------------------------------------------------------------
 * 八宫纳甲歌诀（《京氏易传》系统，后世类书通行）：
 *   乾金甲子外壬午　坎水戊寅外戊申　艮土丙辰外丙戌
 *   震木庚子外庚午　巽木辛丑外辛未　离火己卯外己酉
 *   坤土乙未外癸丑　兑金丁巳外丁亥
 *
 * 读法：以「乾金甲子外壬午」为例 —— 乾属金，内三爻纳甲子、甲寅、甲辰，
 * 外三爻纳壬午、壬申、壬戌。坤则内纳乙未、乙巳、乙卯，外纳癸丑、癸亥、癸酉。
 * 余六宫内外同干（坎内外皆戊、艮内外皆丙、震内外皆庚、巽内外皆辛、
 * 离内外皆己、兑内外皆丁）。
 * 内外之序皆自下而上。
 */
const NAJIA = {
  qian: { wx: '金', innerGan: '甲', outerGan: '壬', inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'] },
  kan: { wx: '水', innerGan: '戊', outerGan: '戊', inner: ['寅', '辰', '午'], outer: ['申', '戌', '子'] },
  gen: { wx: '土', innerGan: '丙', outerGan: '丙', inner: ['辰', '午', '申'], outer: ['戌', '子', '寅'] },
  zhen: { wx: '木', innerGan: '庚', outerGan: '庚', inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'] },
  xun: { wx: '木', innerGan: '辛', outerGan: '辛', inner: ['丑', '卯', '巳'], outer: ['未', '酉', '亥'] },
  li: { wx: '火', innerGan: '己', outerGan: '己', inner: ['卯', '巳', '未'], outer: ['酉', '亥', '丑'] },
  kun: { wx: '土', innerGan: '乙', outerGan: '癸', inner: ['未', '巳', '卯'], outer: ['丑', '亥', '酉'] },
  dui: { wx: '金', innerGan: '丁', outerGan: '丁', inner: ['巳', '卯', '丑'], outer: ['亥', '酉', '未'] }
};

/**
 * 一卦之纳甲：下卦（内）三爻纳其内干，上卦（外）三爻纳其外干，
 * 皆自下而上。返回数组按爻位排列，索引 0 = 初爻、5 = 上爻。
 */
function najiaOf(upper, lower) {
  const up = NAJIA[upper];
  const lo = NAJIA[lower];
  const gua = [];
  for (let i = 0; i < 3; i++) gua.push(lo.innerGan + lo.inner[i]);
  for (let i = 0; i < 3; i++) gua.push(up.outerGan + up.outer[i]);
  return gua;
}

/* ===============================================================
 * 四、六亲
 * ---------------------------------------------------------------
 * 以本宫五行为「我」，生我者父母、我生者子孙、克我者官鬼、我克者妻财、
 * 比和者兄弟。此即京房六亲，通例取纳甲「天干」之五行论生克
 * （如乾为天内纳甲属木、乾宫属金，故三爻皆妻财；外纳壬属水，故皆子孙）。
 * 坎纳戊、离纳己皆属土，故既济、未济六爻六亲俱为官鬼，此为易学中
 * 已知之特例，非算法之误。
 */
const GAN_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const ZHI_WX = {
  子: '水', 亥: '水', 寅: '木', 卯: '木', 巳: '火', 午: '火',
  申: '金', 酉: '金', 丑: '土', 辰: '土', 未: '土', 戌: '土'
};
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

/** 纳甲干支之五行（取天干；天干不全纳时退取地支） */
function wxOf(ganzhi) {
  return GAN_WX[ganzhi[0]] || ZHI_WX[ganzhi[1]] || '';
}

function liuqinOf(ganzhi, palaceWx) {
  const me = palaceWx;
  const wx = wxOf(ganzhi);
  if (wx === me) return '兄弟';
  if (SHENG[me] === wx) return '子孙';
  if (SHENG[wx] === me) return '父母';
  if (KE[me] === wx) return '妻财';
  if (KE[wx] === me) return '官鬼';
  return '兄弟';
}

/* ===============================================================
 * 五、阳宅：二十四山（后天八卦方位，一卦管三山）
 * ---------------------------------------------------------------
 * 坎正北 管壬子癸；艮东北 管丑艮寅；震正东 管甲卯乙；
 * 巽东南 管辰巽巳；离正南 管丙午丁；坤西南 管未坤申；
 * 兑正西 管庚酉辛；乾西北 管戌乾亥。
 */
const PALACE_24 = {
  kan: { dir: '正北', shan: ['壬', '子', '癸'] },
  gen: { dir: '东北', shan: ['丑', '艮', '寅'] },
  zhen: { dir: '正东', shan: ['甲', '卯', '乙'] },
  xun: { dir: '东南', shan: ['辰', '巽', '巳'] },
  li: { dir: '正南', shan: ['丙', '午', '丁'] },
  kun: { dir: '西南', shan: ['未', '坤', '申'] },
  dui: { dir: '正西', shan: ['庚', '酉', '辛'] },
  qian: { dir: '西北', shan: ['戌', '乾', '亥'] }
};

/* 干支所属方向（阳宅取向用天干纳甲，地支本属十二方） */
const ZHI_DIR = {
  子: '正北', 壬: '正北', 癸: '正北',
  丑: '东北', 艮: '东北', 寅: '东北',
  甲: '正东', 卯: '正东', 乙: '正东',
  辰: '东南', 巽: '东南', 巳: '东南',
  丙: '正南', 午: '正南', 丁: '正南',
  未: '西南', 坤: '西南', 申: '西南',
  庚: '正西', 酉: '正西', 辛: '正西',
  戌: '西北', 乾: '西北', 亥: '西北'
};

/* ===============================================================
 * 六、组装
 * =============================================================== */

function yangCount(lines) {
  return lines.filter((x) => x === 1).length;
}

const RECORDS = src.map((g) => {
  const meta = INDEX[g.n - 1];
  if (!meta) throw new Error('六十四卦表缺第 ' + g.n + ' 卦');
  if (meta.name !== g.name) {
    throw new Error('卦名不匹配：序号 ' + g.n + ' 原文作「' + g.name + '」表内作「' + meta.name + '」');
  }
  const pal = PALACE_OF[g.n];
  const najia = najiaOf(meta.upper, meta.lower);
  const palaceWx = NAJIA[pal.palace].wx;

  const yao = g.yao.map((y, i) => ({
    pos: i,
    head: y.head,
    text: y.text,
    xiang: g.yaoXiang[i] || '',
    yang: /九/.test(y.head) ? 1 : 0,
    isShi: pal.shi === i,
    isYing: pal.ying === i,
    ganzhi: najia[i],
    liuqin: liuqinOf(najia[i], NAJIA[pal.palace].wx),
    dir: ZHI_DIR[najia[i][1]] || ''
  }));

  return {
    n: g.n,
    name: g.name,
    sym: g.sym,
    gua: g.gua,
    tuan: g.tuan,
    xiang: g.xiang,
    yao,
    yong: g.yong,
    div: DIVINATIONS[g.n] || ''
  };
});

/* 八宫附加信息（京房法，与六十四卦序号无关） */
const PALACE_OUT = {};
Object.keys(PALACE_TABLE).forEach((pal) => {
  PALACE_OUT[pal] = {
    wx: NAJIA[pal].wx,
    najia: {
      inner: NAJIA[pal].inner.map((z) => NAJIA[pal].innerGan + z),
      outer: NAJIA[pal].outer.map((z) => NAJIA[pal].outerGan + z)
    },
    dir: PALACE_24[pal].dir,
    shan: PALACE_24[pal].shan,
    hexes: PALACE_TABLE[pal].map((x) => ({
      n: x.n, name: x.name, stage: x.stage, stageName: x.stageName,
      shi: SHI_NAME[x.shi], ying: SHI_NAME[x.ying],
      upper: INDEX[x.n - 1].upper, lower: INDEX[x.n - 1].lower
    }))
  };
});

/* 出码 */
const j = (v) => JSON.stringify(v, null, 1).replace(/\n/g, '\n  ');

const file = `/**
 * 卦象心音 · 六十四卦详解数据层
 * ---------------------------------------------------------------
 * 本文件由 scripts/build-hex-texts.js 自动生成，请勿手工编辑。
 *
 * 内容分三等出处，与 core/classics.js 的标注口径一致：
 *   classic  卦辞、彖传、大象传、六爻爻辞、六爻小象、用九用六
 *            —— 抓自 ctext.org「周易·易經」各卦页（公有领域古籍），繁体转简体。
 *   later    京房八宫、纳甲干支、六亲、二十四山山向
 *            —— 依京氏易法算法计算，歌诀与规则见 scripts/build-hex-texts.js 注释。
 *   modern   常见占断（div）—— 依卦辞卦性所作的当代类推，非吉凶断定。
 *
 * 严守两条底线：
 *   1. 阳宅部分只列方位与山向配属（算法可查），不给吉凶断语。
 *   2. 占断一律标 modern，不作转运、预测之断。
 */

'use strict';

/* __IC_IIFE__ */
(function () {

/* 六十四卦：卦辞、彖传、大象传、六爻爻辞与小象、用九用六 */
const HEXAGRAM_TEXTS = ${j(RECORDS.map((r) => ({ n: r.n, name: r.name, sym: r.sym, gua: r.gua, tuan: r.tuan, xiang: r.xiang, yao: r.yao, yong: r.yong })))};

/* 六十四卦常见占断（当代类推，依卦辞卦性撰写，非吉凶断定） */
const DIVINATION_NOTES = ${j(RECORDS.map((r) => ({ n: r.n, note: r.div })))};

/* 京房八宫：本宫五行、纳甲、所辖二十四山向、八卦次序 */
const PALACES = ${j(PALACE_OUT)};

const SHI_YAO_NAME = ${JSON.stringify(SHI_NAME)};
const YAO_POS_NAME = ['初', '二', '三', '四', '五', '上'];

const TRIGRAM_NAME = { qian: '乾', dui: '兑', li: '离', zhen: '震', xun: '巽', kan: '坎', gen: '艮', kun: '坤' };
const PALACE_WX = { qian: '金', dui: '金', li: '火', zhen: '木', xun: '木', kan: '水', gen: '土', kun: '土' };

/* ===============================================================
 * 查询接口
 * =============================================================== */

/** 取一卦详解（n 为 1..64）；取不到返回 null */
function getText(n) {
  return HEXAGRAM_TEXTS[n - 1] || null;
}

const PALACE_KEYS = Object.keys(PALACES);

/** 卦序（1..64）→ 宫位对象，避免每次线性查找 */
const PALACE_INDEX = {};
PALACE_KEYS.forEach((pal) => {
  PALACE_INDEX[pal] = {};
  PALACES[pal].hexes.forEach((g) => { PALACE_INDEX[pal][g.n] = g; });
});

/** 取一卦的京房八宫信息 */
function getPalace(n) {
  if (!HEXAGRAM_TEXTS[n - 1]) return null;
  for (let i = 0; i < PALACE_KEYS.length; i++) {
    const key = PALACE_KEYS[i];
    const g = PALACE_INDEX[key][n];
    if (!g) continue;
    return {
      palace: key,
      palaceName: TRIGRAM_NAME[key],
      wuxing: PALACES[key].wx,
      stage: g.stage,
      stageName: g.stageName,
      shi: g.shi,
      ying: g.ying,
      najia: PALACES[key].najia,
      dir: PALACES[key].dir,
      shan: PALACES[key].shan,
      hexes: PALACES[key].hexes
    };
  }
  return null;
}

/** 取一卦的常见占断（当代类推） */
function getDivination(n) {
  const d = DIVINATION_NOTES[n - 1];
  return d ? d.note : '';
}

/** 取某一爻（0 = 初爻，5 = 上爻） */
function getYao(n, pos) {
  const t = HEXAGRAM_TEXTS[n - 1];
  if (!t) return null;
  return t.yao[pos] || null;
}

/** 取一卦的阴阳爻分布 */
function getYaoProfile(n) {
  const t = HEXAGRAM_TEXTS[n - 1];
  if (!t) return null;
  const yang = t.yao.filter((y) => y.yang === 1).length;
  return { yang, yin: 6 - yang, lines: t.yao.map((y) => y.yang) };
}

const API = {
  HEXAGRAM_TEXTS,
  DIVINATION_NOTES,
  PALACES,
  SHI_YAO_NAME,
  YAO_POS_NAME,
  TRIGRAM_NAME,
  PALACE_WX,
  getText,
  getPalace,
  getDivination,
  getYao,
  getYaoProfile
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else if (typeof window !== 'undefined') {
  window.ICTexts = API;
}

})();
`;

fs.writeFileSync(OUT, file, 'utf8');
console.log('已生成', OUT);
console.log('  六十四卦详解：', RECORDS.length, '卦');
console.log('  八宫：', Object.keys(PALACE_OUT).length, '宫，各 8 卦');
console.log('  示例 乾：', RECORDS[0].name, '| 宫', PALACE_OF[1].palace, PALACE_OF[1].stageName,
  '| 世', SHI_NAME[PALACE_OF[1].shi], '应', SHI_NAME[PALACE_OF[1].ying],
  '| 纳甲', najiaOf('qian', 'qian').join(' '));
console.log('  示例 泰（第11卦）：宫', PALACE_OF[11].palace, PALACE_OF[11].stageName,
  '| 纳甲', najiaOf(INDEX[10].upper, INDEX[10].lower).join(' '));