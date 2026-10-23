/**
 * 古律象音 · 音乐引擎
 * ---------------------------------------------------------------
 * 分两层：
 *   composeNotes()  —— 纯函数，把卦象 + 音乐配置变成音符表，可离线校验
 *   MusicEngine     —— Web Audio 渲染，负责合成、混响、播放与导出
 *
 * 曲式设计（四段式，承自中国器乐"散序"传统）：
 *   起  卦音一击 + 低音持续，确立调式
 *   承  主题乐句（六爻为骨）完整陈述
 *   转  主题在高/低八度变奏，加入装饰音与打击乐
 *   合  主题残句收束，尾音渐隐
 *
 * 六爻为骨：每一爻对应主题中的一个音，
 *   阳爻 → 重拍长音，附打击点缀
 *   阴爻 → 弱拍短音，气息轻灵
 *
 * 伴奏层（中国传统器乐「丝竹」体制，非简单加背景音乐）：
 *   ① 宫音踏板  宫音贯串全曲不换，君为主、臣民附之（《乐记》「宫为君」）
 *   ② 和声垫    只取五声内的三度叠置（徵-羽-宫、羽-宫-角、宫-角-徵），
 *                绝不引入变宫变徵，以免半音化而失五声本色
 *   ③ 支声      取主旋律骨架音作同度/低八度应和，「一主一从」而非对位和声
 *   ④ 节奏骨架  柷敔落板定拍、鼓落重拍（《白虎通》八音配卦）
 *   ⑤ 散板      密度随卦德与段落变化，不套西方固定拍号
 *
 * 即兴层（实时生成的关键）：
 *   同一卦的「身份」是固定的——调式、律吕、主音、音色、六爻旋律骨架、
 *   六爻节奏，皆由卦象逻辑决定，每次编曲都不变（故听得出是这一卦）。
 *   在此之上，有两层即兴：
 *   ① 演奏法层（variant）：散板引子、装饰疏密、和声轮转、支声模式、
 *      低音句读、句尾应和、八度升降、终止式和弦、力度弧线；
 *   ② 发展层（form）：轮内用「加花/换头/隔凡/压上/分裂」等传统发展手法
 *      让同一动机逐遍生长，轮间走八轮一循环的宏曲式（呈示·应和·加花·
 *      隔凡·分裂·压上·换头·再现）。不传 form 时该层关闭，行为与旧版一致。
 *   composeNotes 传入不同的 seed、variant 与 form，
 *   同一卦便得到一段新的编曲——循环连播时每轮皆新，绝非一个音频反复播。
 *
 *   默认（不传 opts）走确定性旧行为：seed 取卦序、variant 取固定值，
 *   保证离线测试可复现。
 */

'use strict';

/* __IC_IIFE__ */
(function () {


/* 跨端依赖注入：浏览器靠全局，小程序/Node 走 require */
const seededRandom = require('./bootstrap.js').loadData().seededRandom;

/* ===============================================================
 * 一、作曲（纯函数层）
 * =============================================================== */

/** position(0..9) → MIDI 音高：五声阶梯 = 音级 + 八度层 */
function positionToMidi(cfg, position) {
  const degree = cfg.modeDegrees[position % 5];
  const octave = Math.floor(position / 5);
  return cfg.rootMidi + degree + 12 * octave;
}

/**
 * 五声内的三度叠置和声组
 * ---------------------------------------------------------------
 * 五声音阶自带三度关系，故和声垫可由三个相邻音级叠成：
 *   徵-羽-宫、羽-宫-角、宫-角-徵
 * 各组皆为该调式内的纯五度框架，不含变宫、变徵。
 * 下标为「调式内音级序号」（0=宫 1=商 2=角 3=徵 4=羽），可跨八度。
 */
const HARMONY_GROUPS = [
  [3, 4, 5],   // 徵-羽-宫（下一八度的宫）
  [4, 5, 7],   // 羽-宫-角（下一八度的角）
  [5, 7, 8]    // 宫-角-徵（下一八度的徵）
];

/**
 * 取五声叠置和声组的中音
 * @param {object} cfg
 * @param {number} groupIndex HARMONY_GROUPS 的下标
 * @param {number} octaveShift 整体移调八度数
 * @returns {Array<number>} 三个 MIDI 音高
 */
function harmonyTones(cfg, groupIndex, octaveShift) {
  const g = HARMONY_GROUPS[groupIndex % HARMONY_GROUPS.length];
  return g.map((pos) => positionToMidi(cfg, pos + octaveShift * 5));
}

/* ===============================================================
 * 一之二、即兴变体
 * ---------------------------------------------------------------
 * variant 只改变「怎么演奏」，不改变「奏的是什么」：
 * 调式、律、主音、音色、六爻旋律与节奏一概由卦象决定。
 * =============================================================== */

/** 确定性默认变体（不传 opts 时的旧行为，保证测试可复现） */
const DEFAULT_VARIANT = {
  introStyle: 0,    // 散板引子：0 不起 / 1 二点 / 2 三点
  decoRate: 0.55,   // 装饰音概率
  harmStart: 0,     // 和声垫轮转起始组
  counterMode: 0,   // 支声模式：0 常式 / 1 疏 / 2 密
  bassPhrase: 0.32, // 低音句读概率（句首踏板由宫移徵/羽）
  answerRate: 0.45, // 句尾应和概率
  themeLift: 0,     // 主题后半移高八度（0/1）
  varDown: 0,       // 转段移低八度（0/1，默认移高）
  codaChord: 0,     // 终止式和弦（HARMONY_GROUPS 下标）
  dyn: 1.0          // 力度弧线总倍率
};

/**
 * 随机生成一个即兴变体
 * @param {function} rnd 随机源（seededRandom 的产出）
 * @returns {object} variant
 */
function randomVariant(rnd) {
  return {
    introStyle: Math.floor(rnd() * 3),
    decoRate: 0.40 + rnd() * 0.30,
    harmStart: Math.floor(rnd() * HARMONY_GROUPS.length),
    counterMode: Math.floor(rnd() * 3),
    bassPhrase: 0.18 + rnd() * 0.40,
    answerRate: 0.30 + rnd() * 0.50,
    themeLift: rnd() < 0.5 ? 1 : 0,
    varDown: rnd() < 0.35 ? 1 : 0,
    codaChord: Math.floor(rnd() * HARMONY_GROUPS.length),
    dyn: 0.94 + rnd() * 0.12
  };
}

/* ===============================================================
 * 一之三、旋律发展手法与跨轮曲式
 * ---------------------------------------------------------------
 * 要解决的问题：同一卦的六爻动机若原样反复，听感是「一小段不停重复」。
 * 中国传统器乐的答案是「一曲多变」—— 用发展手法让同一动机生生不息
 * （民间「一曲可变三十五调」之说，见百度百科「借字」）：
 *
 *   加花      重复时围绕骨干音以五声阶级进环绕装饰，骨干音位置多不移动
 *             （华音网《民间器乐曲中常用的变奏手法》）
 *   换头合尾  改变乐句头部而结尾音不变，各段「形变而尾合」
 *             （《春江花月夜》换头合尾，海淀敬德书院名曲赏析）
 *   隔凡      角音变换为清角音、「清角为宫」，旋律下五度移宫
 *             （百度百科「隔凡」；《倒八板》即用此法）
 *   压上      宫音改奏变宫，上五度移宫（百度百科「借字」）
 *   分裂重组  动机单元重新组合 —— 生成音乐研究中的 pattern 重组，
 *             用以获得长程结构（Herremans et al. 2018，
 *             《A Functional Taxonomy of Music Generation Systems》）
 *
 * 轮内：主题的每一遍陈述选用一种手法（原型 → 加花 → 换头 → 移宫 → 分裂，
 *       末遍回归原型），故一段之内动机已在发展，不再是原样复读。
 * 轮间：八轮一循环的宏曲式（呈示·应和·加花·隔凡·分裂·压上·换头·再现），
 *       与生成音乐研究所说「乐句—应和—回归」的长程结构同理；
 *       再现轮主题回到原调，听得出是这一卦，却已走过一段路程。
 *
 * 默认（不传 opts.form）不启用发展层：每一遍都是原型，
 * 保持旧的确定性行为，供离线校验与小程序端复现。
 * =============================================================== */

/** 轮内发展序列（form 未指定时的默认次序） */
const DEV_SEQ = ['jiahua', 'huantou', 'yigong', 'fenlie'];

/** 该遍主题用的发展手法 */
function devAt(rep, repeats, form) {
  if (!form) return 'yuan';
  if (rep === 0) return 'yuan';
  if (repeats >= 4 && rep === repeats - 1) return 'yuan';   // 末遍回归原型，合尾之意
  let seq = DEV_SEQ;
  if (form === 'gefan' || form === 'yashang') seq = ['yigong', 'jiahua', 'fenlie', 'huantou'];
  else if (form === 'fenlie') seq = ['fenlie', 'jiahua', 'yigong', 'huantou'];
  else if (form === 'huantou') seq = ['huantou', 'jiahua', 'fenlie', 'yigong'];
  return seq[(rep - 1) % seq.length];
}

/**
 * 发展后的六爻旋律
 *   换头合尾：前四音轮转、后两音不动（尾合而头变）
 *   分裂重组：动机前后两半对置或交错
 *   其余手法不改音列（加花只加装饰、移宫只整体平移）
 */
function developMotif(melody, dev, rnd) {
  const a = melody.slice();
  if (dev === 'huantou') return [a[1], a[2], a[3], a[0], a[4], a[5]];
  if (dev === 'fenlie') {
    return rnd() < 0.5
      ? [a[3], a[4], a[5], a[0], a[1], a[2]]   // 后半前置
      : [a[0], a[3], a[1], a[4], a[2], a[5]];  // 两半交错
  }
  return a;
}

/**
 * 该遍整体的移宫（MIDI 偏移）
 * 隔凡 = 下五度（-7），压上 = 上五度（+7）。
 * 五声音列移一个纯五度仍落回本音列，故不破五声之本。
 */
function transOf(dev, form) {
  if (dev !== 'yigong') return 0;
  return form === 'yashang' ? 7 : -7;
}

/** 跨轮宏曲式：八轮一循环 */
const ARC = ['chengshi', 'yinghe', 'jiahua', 'gefan', 'fenlie', 'yashang', 'huantou', 'zaixian'];
const ARC_NAMES = {
  chengshi: '呈示', yinghe: '应和', jiahua: '加花', gefan: '隔凡',
  fenlie: '分裂', yashang: '压上', huantou: '换头', zaixian: '再现'
};

/** 第 round 轮（从 0 起）所处的宏曲式阶段 */
function arcAt(round) {
  return ARC[((round % ARC.length) + ARC.length) % ARC.length];
}

/** 宏曲式对演奏密度的影响：应和轮句尾应和更主动、加花轮装饰更密、再现轮更饱满 */
const FORM_TUNE = {
  chengshi: { deco: 1.0, dyn: 1.0, answer: 1.0, counter: -1 },
  yinghe: { deco: 1.0, dyn: 1.0, answer: 1.6, counter: 2 },
  jiahua: { deco: 1.35, dyn: 1.0, answer: 1.0, counter: -1 },
  gefan: { deco: 1.0, dyn: 1.0, answer: 1.0, counter: -1 },
  fenlie: { deco: 1.1, dyn: 1.0, answer: 1.0, counter: -1 },
  yashang: { deco: 1.0, dyn: 1.0, answer: 1.0, counter: -1 },
  huantou: { deco: 1.0, dyn: 1.0, answer: 1.2, counter: -1 },
  zaixian: { deco: 1.15, dyn: 1.05, answer: 1.2, counter: 2 }
};

/**
 * 生成伴奏层
 * ---------------------------------------------------------------
 * 依《白虎通·礼乐》八音配卦与《礼记·乐记》「一主一从」之制，
 * 在主旋律之外铺四层：宫音踏板、和声垫、支声、节奏骨架。
 *
 * @param {object} cfg       音乐配置
 * @param {object} ctx       { beat, cycleBeats, themeStart, themeEnd, codaStart, duration, energy, density, transAt, counterOverride }
 * @param {function} push    音符推入函数
 * @param {function} rnd     随机源
 * @param {object} variant   即兴变体（缺省为确定性默认）
 */
function composeAccompaniment(cfg, ctx, push, rnd, variant) {
  const v = variant || DEFAULT_VARIANT;
  const { beat, cycleBeats, themeStart, themeEnd, codaStart, duration } = ctx;
  const energy = ctx.energy;
  const density = ctx.density;
  // 移宫跟随：主题某遍整体移宫时，伴奏层同步平移（隔凡/压上是全曲移宫，非单声部）
  const transAt = ctx.transAt || (() => 0);

  /* ---------- ① 宫音踏板 + ② 和声垫（合并为多音 pad）---------- */
  // 《乐记》「宫为君」：君为主、臣民附之，故低音踏板只取宫音，且不随旋律移动。
  // 和声垫取五声内的三度叠置（徵-羽-宫、羽-宫-角、宫-角-徵），
  // 随段落轮转；与踏板合并为同一个多音 pad 音符一次渲染，
  // 既避免两套低音互相干扰，也大幅削减渲染采样量。
  const droneMidi = cfg.rootMidi - 12;
  const harmStep = 8 * beat;
  // 踏板音的起点：等距 8 拍一处，另在各段边界（换宫处）必换一次 ——
  // 否则旧宫的踏板会跨过移宫边界持续发声，与新宫形成半音撞音。
  const starts = [];
  for (let t = 0; t < duration; t += harmStep) starts.push(t);
  (ctx.regionStarts || []).forEach((t) => {
    if (t > 0 && t < duration) starts.push(t);
  });
  starts.sort((a, b) => a - b);
  // 去重：同一时刻只起一次踏板（否则零长音会中断整段铺底）
  const uniqStarts = starts.filter((t, i) => i === 0 || t - starts[i - 1] > 0.01);
  const harmCount = uniqStarts.length;
  const groupAt = (t) => {
    if (t < themeStart) return 0;
    if (t < themeEnd) return 1;
    if (t < codaStart) return 2;
    return 0;
  };
  for (let i = 0; i < harmCount; i++) {
    const t = uniqStarts[i];
    const nextT = i + 1 < harmCount ? uniqStarts[i + 1] : duration;
    // 踏板音不越过下一个起点：换宫处旧音即止，新音另起
    const len = Math.min(harmStep * 1.02, duration - t, nextT - t);
    if (len <= 0) continue;
    // 一个 pad 音符里同时含：宫音踏板 + 本段和声的三音
    // 和声组的起始轮转由变体决定，故每轮的垫色不同
    const tr = transAt(t);
    const tones = [droneMidi + tr].concat(harmonyTones(cfg, groupAt(t) + v.harmStart, 0).map((m) => m - 12 + tr));
    push(t, droneMidi + tr, len, 0.115 * energy + 0.03, 'pad', 0, tones);
  }

  /* ---------- ③ 支声：一主一从，取主旋律骨架音应和 ---------- */
  // 密度与变体共同决定支声的疏密（《乐记》「一主一从」）：
  //   模式 1 —— 疏：只在句首应和
  //   模式 0 —— 常式：每两拍一问一答
  //   模式 2 —— 密：逐音跟随
  // 宏曲式的应和轮/再现轮可强制置密（ctx.counterOverride）
  const counterMode = ctx.counterOverride >= 0 ? ctx.counterOverride : v.counterMode;
  const counterStep = counterMode === 1 ? 4 * beat : 2 * beat;
  const regionEndAt = ctx.regionEndAt || (() => Infinity);
  const followAll = v.counterMode === 2 || density > 0.45;
  const counterFrom = themeStart;
  const counterTo = codaStart;
  const counterCount = Math.max(0, Math.floor((counterTo - counterFrom) / counterStep));
  for (let i = 0; i < counterCount; i++) {
    const t = counterFrom + i * counterStep;
    // 支声取主旋律在该时点附近的骨架音：取乐句起始音的低八度
    const phrasePos = Math.floor(i * counterStep / (cycleBeats * beat)) * 6;
    const m = cfg.melody[phrasePos % 6];
    const midi = positionToMidi(cfg, m) - 12 + transAt(t);
    // 支声不越过移宫边界（跨界的旧宫音即止）
    const len = Math.min(counterStep * (followAll ? 0.92 : 0.6), counterTo - t, regionEndAt(t) - t);
    if (len < 0.05) continue;
    // 支声用「弦」音色，弱于主旋律，形成应答
    push(t, midi, len, 0.075 * energy + 0.022, 'xian', i % 2 ? 0.35 : -0.35);
  }

  /* ---------- ④ 节奏骨架：柷敔落板、鼓落重拍 ---------- */
  // 《白虎通·礼乐》引《乐记》八音配八卦：「鼓，震音也；柷敔，乾音也。」
  // 柷敔干硬短促宜落板，鼓低频冲击宜落重拍。
  // 「一主一从」：主旋律若已是鼓声，节奏骨架则只用柷敔，避同器相糊。
  const mainIsDrum = cfg.voice === 'gu';
  const rhythmFrom = themeStart;
  const rhythmTo = codaStart;
  const bar = 4 * beat;                      // 散板：以四拍为一「板」，不立小节线
  const barCount = Math.max(0, Math.floor((rhythmTo - rhythmFrom) / bar));
  for (let i = 0; i < barCount; i++) {
    const t = rhythmFrom + i * bar;
    if (!mainIsDrum) {
      // 板首：鼓落重拍
      push(t, cfg.rootMidi - 24, 0.2 * beat, 0.14 * energy + 0.035, 'gu', 0);
    }
    // 板中：柷敔落板
    push(t + 2 * beat, cfg.rootMidi - 12, 0.13 * beat, 0.085 * energy + 0.02, 'zhu', 0.12);
    // 密度高时于板末加一击轻柷敔，是散板的疏密对比
    if (density > 0.5 && rnd() < 0.45) {
      push(t + 3 * beat, cfg.rootMidi - 12, 0.1 * beat, 0.05 * energy, 'zhu', -0.18);
    }
  }
}

/**
 * 生成音符表
 * @param {object} hex        卦对象
 * @param {object} cfg        deriveMusicConfig 的输出
 * @param {object} changedCfg 变卦配置（可选，用于尾声音色变化）
 * @param {object} opts       { seed, variant } —— 缺省走确定性旧行为
 * @returns {object} { notes, duration, sections }
 */
function composeNotes(hex, cfg, changedCfg, opts) {
  const notes = [];
  const o = opts || {};
  // 即兴种子：缺省取卦序（同卦同谱，供离线校验）；实时播放时传时间种子
  const seed = o.seed !== undefined ? o.seed : (hex.n * 97 + 13);
  const v = Object.assign({}, DEFAULT_VARIANT, o.variant || {});
  const rnd = seededRandom(seed);
  const beat = 60 / cfg.tempo;
  const melody = cfg.melody;
  const rhythm = cfg.rhythm;

  // 一个乐句（六爻）的总时值
  const cycleBeats = rhythm.reduce((s, r) => s + r.beat, 0);
  const cycleDur = cycleBeats * beat;

  // 目标时长约 46 秒，据此决定主题陈述次数
  const repeats = Math.max(3, Math.min(9, Math.round(46 / cycleDur)));

  const push = (time, midi, dur, vel, voice, pan, tones, velScale) => {
    // 时值为零（或过短，四舍五入即为零）的音不入表 —— 渲染器不接受零长音
    if (!(dur > 0.02)) return;
    const n = {
      time: +time.toFixed(4),
      dur: +dur.toFixed(4),
      midi: Math.max(28, Math.min(104, midi)),   // 限制在可听且不刺耳的范围内
      vel: +vel.toFixed(4),
      voice,
      pan: pan === undefined ? 0 : +pan.toFixed(3),
      // 五音音色修饰（《礼记·乐记》清浊次第），随调式注入每一音符
      timbre: cfg.timbre
    };
    // 力度弧线：起弱 → 承渐强 → 转最盛 → 合渐敛（段内比重由 velScale 给出）
    if (velScale !== undefined) n.vel = +(n.vel * velScale).toFixed(4);
    // pad 可一次发出多个音（伴奏的宫音踏板与和声垫合并渲染）
    if (tones && tones.length) n.tones = tones.slice();
    notes.push(n);
  };

  let t = 0;

  /* ---------- 起：卦音一击 ---------- */
  const introVoice = cfg.voice;
  const introDyn = 0.90 * v.dyn;
  push(t, cfg.rootMidi, 2.4 * beat, 0.5 * cfg.energy + 0.2, introVoice, 0, null, introDyn);
  // 低音持续（每 2 拍一换，模拟长音踏板）。
  // 先记下位置，等主题段编完再落音：踏板不得越过首个移宫遍，
  // 否则旧宫长音会与新宫相撞（详见主题段之后的落音处）。
  const dronePts = [];
  const droneCount = 4;
  for (let i = 0; i < droneCount; i++) {
    dronePts.push({ time: t + i * 2 * beat, dur: 2.1 * beat });
  }
  // 散板引子：主题进入前的一两点自由音，如独奏者试音（变体决定有无与疏密）
  if (v.introStyle > 0) {
    const pts = v.introStyle === 2
      ? [0.45 * beat, 1.15 * beat, 1.85 * beat]
      : [0.55 * beat, 1.5 * beat];
    pts.forEach((dt, k) => {
      const pos = 5 + Math.floor(rnd() * 5);        // 高音区五声，不越出音列
      push(dt, positionToMidi(cfg, pos), 0.55 * beat,
        0.13 * cfg.energy, 'xian', k % 2 ? 0.32 : -0.32, null, v.dyn);
    });
  }
  t += 2 * beat;

  /* ---------- 承：主题陈述（每一遍用一种发展手法） ---------- */
  const themeStart = t;
  const form = o.form || null;
  const tune = FORM_TUNE[form] || FORM_TUNE.chengshi;
  // 每遍的移宫量（伴奏层据此同步平移，见 composeAccompaniment 的 transAt）
  const repSpans = [];
  for (let rep = 0; rep < repeats; rep++) {
    const dev = devAt(rep, repeats, form);
    const trans = transOf(dev, form);
    const m = developMotif(melody, dev, rnd);
    const jiahua = dev === 'jiahua';
    // 力度弧线：同一主题逐遍渐强；变体可将后半主题移高八度，换一种光度
    const lift = (v.themeLift && rep >= repeats / 2) ? 12 : 0;
    const themeDyn = (0.92 + 0.12 * (rep / Math.max(1, repeats - 1))) * v.dyn * tune.dyn;
    const repStart = t;
    let ct = t;
    for (let i = 0; i < 6; i++) {
      const r = rhythm[i];
      const midi = positionToMidi(cfg, m[i]) + lift + trans;
      const dur = r.beat * beat * 0.92;

      // 主旋律
      push(ct, midi, dur, (0.35 + 0.45 * r.accent) * (0.6 + 0.5 * cfg.energy), cfg.voice, 0, null, themeDyn);

      // 装饰音：密度越高，装饰越密（颤音式回环）；加花遍再加密一档
      const decoCount = Math.round(cfg.density * 2 * (jiahua ? 2 : 1));
      const decoRate = Math.min(0.95, v.decoRate * tune.deco * (jiahua ? 1.4 : 1));
      for (let d = 0; d < decoCount; d++) {
        if (rnd() > decoRate) continue;
        const above = rnd() < 0.5 ? 1 : -1;
        const dPos = m[i] + above;
        if (dPos < 0 || dPos > 9) continue;
        push(ct + dur * (0.15 + 0.5 * rnd()), positionToMidi(cfg, dPos) + lift + trans, dur * 0.35,
          0.14 * cfg.energy, 'xian', (rnd() - 0.5) * 0.5, null, themeDyn);
      }

      // 加花：骨干音之间补一枚五声阶级进的过门音
      // （华音网《民间器乐曲中常用的变奏手法》：骨干音位置不动，级进环绕）
      if (jiahua && i < 5 && rnd() < 0.75) {
        const up = m[i + 1] >= m[i];
        const pPos = m[i] + (up ? 1 : -1) * (rnd() < 0.7 ? 1 : 2);
        if (pPos >= 0 && pPos <= 9) {
          push(ct + dur * 0.68, positionToMidi(cfg, pPos) + lift + trans, dur * 0.3,
            0.10 * cfg.energy, 'xian', (rnd() - 0.5) * 0.4, null, themeDyn);
        }
      }

      // 阳爻加打击点（对应"刚"）
      if (r.accent > 0.8) {
        push(ct, cfg.rootMidi - 24, 0.22 * beat, 0.3 * cfg.energy, 'click', 0, null, themeDyn);
      }

      // 泛音点：主题后半的重拍之上，加一记高八度清音（弹拨乐器泛音之意，
      // 音仍取本爻旋律音的八度，不越五声），令主题越奏越亮
      if (rep >= repeats / 2 && r.accent > 0.8 && m[i] + 5 <= 9) {
        push(ct + dur * 0.12, positionToMidi(cfg, m[i] + 5) + trans, dur * 0.5,
          0.10 * cfg.energy, 'xian', 0.42, null, themeDyn);
      }

      // 低音在句首落定：变体可让句首踏板由宫移往徵/羽，
      // 宫音踏板仍在底层不动（《乐记》「宫为君」），此为上方句读
      if (i === 0 || i === 3) {
        const bassMove = i === 0 && rep > 0 && rnd() < v.bassPhrase;
        const bm = bassMove
          ? positionToMidi(cfg, rnd() < 0.5 ? 3 : 4) - 12
          : cfg.rootMidi - 12;
        // 低音踏板不越出本遍：移宫处旧宫音即止，不与新宫相撞
        const bassLen = Math.min(r.beat * beat * 1.4, repStart + cycleBeats * beat - ct);
        if (bassLen > 0) {
          push(ct, bm + trans, bassLen, 0.26 * cfg.energy, 'pad', 0, null, themeDyn);
        }
      }

      // 句尾应和：乐句收处一点回声，取句末音上/下三度（皆在五声内）
      if (i === 5 && rnd() < v.answerRate * tune.answer) {
        const ansPos = Math.max(0, Math.min(9, m[5] + (rnd() < 0.5 ? 2 : -2)));
        push(ct + r.beat * beat * 0.72, positionToMidi(cfg, ansPos) + trans, 0.5 * beat,
          0.12 * cfg.energy, 'xian', 0.28, null, themeDyn);
      }

      ct += r.beat * beat;
    }
    t = ct;
    repSpans.push({ start: repStart, end: t, trans });

    // 句间留白（偶数句后略长）
    if (rep < repeats - 1) {
      const rest = (rep % 2 === 0 ? 1 : 0.5) * beat;
      t += rest;
    }
  }
  const transAt = (time) => {
    for (let i = 0; i < repSpans.length; i++) {
      if (time >= repSpans[i].start && time < repSpans[i].end) return repSpans[i].trans;
    }
    return 0;
  };
  // 某时点所在遍的结束时刻：移宫处，跨界的伴奏音在此截止
  const regionEndAt = (time) => {
    for (let i = 0; i < repSpans.length; i++) {
      if (time >= repSpans[i].start && time < repSpans[i].end) return repSpans[i].end;
    }
    return Infinity;
  };
  // 首个移宫遍的起点：引子的长音踏板到此为止（旧宫不越入新宫）
  const firstTransStart = repSpans.find((sp) => sp.trans !== 0)
    ? repSpans.find((sp) => sp.trans !== 0).start
    : Infinity;

  /* ---------- 引子的长音踏板（此刻才落音：不得越过首个移宫遍） ---------- */
  dronePts.forEach((d) => {
    const dur = Math.min(d.dur, firstTransStart - d.time);
    if (dur <= 0.01) return;
    push(d.time, cfg.rootMidi - 12, dur, 0.22 * cfg.energy + 0.06, 'pad', 0, null, introDyn);
  });

  /* ---------- 转：变奏，主题移高（或移低）八度 ---------- */
  const variationStart = t;
  const varRepeats = Math.max(2, Math.round(repeats * 0.5));
  const varShift = v.varDown ? -12 : 12;
  const varDyn = 1.06 * v.dyn;
  for (let rep = 0; rep < varRepeats; rep++) {
    let ct = t;
    for (let i = 0; i < 6; i++) {
      const r = rhythm[i];
      const midi = positionToMidi(cfg, melody[i]) + varShift;
      const dur = r.beat * beat * 0.85;
      push(ct, midi, dur, (0.3 + 0.42 * r.accent) * (0.6 + 0.5 * cfg.energy), cfg.voice, (i % 2 ? 0.25 : -0.25), null, varDyn);

      // 变奏段加花：更多装饰与打击
      if (cfg.density > 0.45 && rnd() < 0.5) {
        const dPos = melody[i] + 1;
        if (dPos <= 9) {
          push(ct + dur * 0.3, positionToMidi(cfg, dPos) + varShift, dur * 0.3, 0.12 * cfg.energy, 'xian', 0.4, null, varDyn);
        }
      }
      if (r.accent > 0.8) {
        push(ct, cfg.rootMidi - 24, 0.2 * beat, 0.26 * cfg.energy, 'click', 0.15, null, varDyn);
      }
      ct += r.beat * beat;
    }
    t = ct;
    if (rep < varRepeats - 1) t += 0.5 * beat;
  }

  /* ---------- 合：尾声 ---------- */
  const codaStart = t;
  const codaDyn = 0.88 * v.dyn;
  const codaVoice = changedCfg ? changedCfg.voice : cfg.voice;
  // 主题残句下行
  const tail = [4, 3, 2, 1, 0];
  tail.forEach((p, i) => {
    const midi = positionToMidi(cfg, p);
    push(t, midi, 0.9 * beat, 0.3 * cfg.energy + 0.08, codaVoice, 0, null, codaDyn);
    t += 0.9 * beat;
  });
  // 终音长延 + 终止式和声：五声内三度叠置（宫-角-徵一类），
  // 变体轮选组别，使每轮的收束色彩略异；主音（宫）始终在旋律声部。
  // pad 的名义音高取本调主音（各调式 degrees[0] 恒为 0，必在五声内）。
  const cadTones = harmonyTones(cfg, v.codaChord, 0);
  push(t, cfg.rootMidi, 5.0 * beat, 0.34 * cfg.energy + 0.1, codaVoice, 0, null, codaDyn);
  push(t, cfg.rootMidi, 5.0 * beat, 0.16 * cfg.energy, 'pad', 0, cadTones, codaDyn);
  t += 5.0 * beat;

  const duration = t + 0.6;

  /* ---------- 伴奏层：宫音踏板、五声和声垫、支声、节奏骨架 ---------- */
  composeAccompaniment(cfg, {
    beat,
    cycleBeats,
    themeStart,
    themeEnd: variationStart,
    codaStart,
    duration,
    energy: cfg.energy,
    density: cfg.density,
    transAt,
    regionEndAt,
    counterOverride: tune.counter,
    // 各遍的起点（移宫处踏板音必须在此换一次），
    // 另含变奏段与尾声的起点 —— 出了移宫遍，宫音踏板即回到本调
    regionStarts: repSpans.map((sp) => sp.start).concat([variationStart, codaStart])
  }, push, rnd, v);

  // 按时间排序，保证渲染顺序与时间轴一致
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);

  return {
    notes,
    duration,
    tempo: cfg.tempo,
    seed,
    variant: v,
    form: form || null,
    arcName: form ? ARC_NAMES[form] : null,
    // 主题段各遍的起止与移宫量（供校验与界面按段取用）
    reps: repSpans.map((sp) => ({ start: sp.start, end: sp.end, trans: sp.trans })),
    sections: {
      intro: { start: 0, end: themeStart },
      theme: { start: themeStart, end: variationStart },
      variation: { start: variationStart, end: codaStart },
      coda: { start: codaStart, end: duration }
    }
  };
}

/* ===============================================================
 * 二、工具
 * =============================================================== */

/** MIDI → 频率 */
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    composeNotes, positionToMidi, midiToFreq, harmonyTones, HARMONY_GROUPS,
    DEFAULT_VARIANT, randomVariant,
    devAt, developMotif, transOf, arcAt, ARC, ARC_NAMES, FORM_TUNE, DEV_SEQ
  };
} else {
  window.ICMusic = {
    composeNotes, positionToMidi, midiToFreq, harmonyTones, HARMONY_GROUPS,
    DEFAULT_VARIANT, randomVariant,
    devAt, developMotif, transOf, arcAt, ARC, ARC_NAMES, FORM_TUNE, DEV_SEQ
  };
}

})();
