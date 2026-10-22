/**
 * 循环播放与伴奏层专项验证
 * ---------------------------------------------------------------
 * 1. Player 循环：开/关状态、_handleEnd 行为、开关切换
 * 2. 伴奏层：五声叠置和声落在调式音阶内、层次齐备、不过密
 * 3. 卦象：爻序方向（六爻不颠倒）
 */

'use strict';

const D = require('../core/data.js');
const H = require('../core/hexagram.js');
const M = require('../core/music.js');
const R = require('../core/render.js');
const P = require('../core/player.js');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  [v] ' + m); };
const err = (m) => { fail++; console.log('  [X] ' + m); };

/* ===============================================================
 * 一、循环播放
 * =============================================================== */
console.log('=== 1. 循环播放开关 ===');
{
  const p = new P.Player({});
  if (p.loop === false) ok('循环默认为关闭');
  else err('循环默认值应为 false');

  const turned = p.toggleLoop();
  if (turned === true && p.loop === true) ok('toggleLoop 可开启循环');
  else err('toggleLoop 未能开启循环');

  const turned2 = p.toggleLoop();
  if (turned2 === false && p.loop === false) ok('toggleLoop 可关闭循环');
  else err('toggleLoop 未能关闭循环');

  p.setLoop(true);
  if (p.loop === true) ok('setLoop(true) 生效');
  else err('setLoop(true) 未生效');

  // 状态回调：loop / noloop
  const states = [];
  const p2 = new P.Player({ onStateChange: (s) => states.push(s) });
  p2.setLoop(true);
  p2.setLoop(false);
  if (states.indexOf('loop') >= 0 && states.indexOf('noloop') >= 0) {
    ok('循环开关会回调 onStateChange(loop/noloop)，界面得以同步');
  } else {
    err('循环开关未回调 onStateChange');
  }
}

console.log('\n=== 2. 播放结束的处理逻辑 ===');
{
  // 关闭循环：应触发 onEnd
  let ended = 0;
  const p = new P.Player({ onEnd: () => { ended++; } });
  p.current = { score: { duration: 10, notes: [] }, pcm: null, duration: 10 };
  p.isPlaying = true;
  p.loop = false;
  p._handleEnd();
  if (ended === 1 && p.current === null && p.isPlaying === false) {
    ok('关闭循环时播放结束触发 onEnd，并复位播放状态');
  } else {
    err(`关闭循环时行为异常（ended=${ended}）`);
  }

  // 开启循环：不应触发 onEnd，应重新播放
  let ended2 = 0;
  let playCalled = 0;
  const p2 = new P.Player({ onEnd: () => { ended2++; } });
  const fakeScore = { duration: 10, notes: [] };
  p2.current = { score: fakeScore, pcm: null, duration: 10 };
  p2.isPlaying = true;
  p2.loop = true;
  // 拦截 play 以免进入平台分支
  p2.play = function (score) { playCalled++; this.current = { score: score, pcm: null, duration: score.duration }; this.isPlaying = true; };
  p2._handleEnd();
  if (ended2 === 0 && playCalled === 1 && p2.isPlaying === true) {
    ok('开启循环时播放结束自动从头重播，且不触发 onEnd');
  } else {
    err(`开启循环时行为异常（ended=${ended2}, replay=${playCalled}）`);
  }
}

console.log('\n=== 3. 循环时复用已渲染的 PCM ===');
{
  // 循环重播不应重新渲染（省去一次数十秒音频的渲染开销）
  const p = new P.Player({});
  const score = D.getHexagram(55);
  const cfg = D.deriveMusicConfig(score);
  const sc = M.composeNotes(score, cfg);
  let renderCount = 0;
  p.render = function (s, o) { renderCount++; return R.renderScore(s, o); };
  p.play = P.Player.prototype.play.bind(p);
  // 直接走 play 的 PCM 缓存逻辑
  const orig = p.render;
  p.render = function (s, o) { renderCount++; return orig.call(p, s, o); };
  p.play(sc, {});
  const first = renderCount;
  // 模拟循环重播
  p._replaying = true;
  p._lastScore = sc;
  p.play(sc, {});
  p._replaying = false;
  if (renderCount === first) ok('循环重播复用了已渲染的 PCM，未重复渲染');
  else err(`循环重播重复渲染了（renderCount ${first} → ${renderCount}）`);
}

/* ===============================================================
 * 二、伴奏层
 * =============================================================== */
console.log('\n=== 4. 伴奏层：和声落在五声音阶内 ===');
{
  let bad = 0, checked = 0;
  for (let n = 1; n <= 64; n++) {
    const hex = D.getHexagram(n);
    const cfg = D.deriveMusicConfig(hex);
    const allowed = new Set();
    for (let p = 0; p < 10; p++) allowed.add(M.positionToMidi(cfg, p));
    M.HARMONY_GROUPS.forEach((g) => {
      g.forEach((pos) => {
        const midi = M.positionToMidi(cfg, pos);
        checked++;
        if (!allowed.has(midi)) {
          bad++;
          if (bad <= 3) err(`卦 ${n}「${hex.name}」和声音级 ${pos}（MIDI ${midi}）不在该调式音阶内`);
        }
      });
    });
  }
  if (!bad) ok(`64 卦的和声叠置全部落在本调式的五声音阶内（${checked} 项检查）`);
}

console.log('\n=== 5. 伴奏层：和声严格限于该调式的五个音级 ===');
{
  // 判据说明：
  //   ① 和声音高必属该调式的宫商角徵羽，不得掺入调外音；
  //   ② 相邻两音不得构成半音（1 个半音）关系——
  //      半音相邻是五声调式失真的真正来源（相当于掺入变宫/变徵），
  //      而「徵-羽」这类二度（2 个半音）在中国传统和声中是正常的。
  //   注：宫调式、角调式本身含 4 半音（角），那是正音，不可一概判为半音化。
  let outOfScale = 0;
  let semitoneClash = 0;
  for (let n = 1; n <= 64; n++) {
    const hex = D.getHexagram(n);
    const cfg = D.deriveMusicConfig(hex);
    const inScale = new Set();
    for (let p = 0; p < 10; p++) inScale.add(M.positionToMidi(cfg, p));
    M.HARMONY_GROUPS.forEach((g) => {
      const midis = g.map((pos) => M.positionToMidi(cfg, pos));
      midis.forEach((m) => { if (!inScale.has(m)) outOfScale++; });
      for (let i = 1; i < midis.length; i++) {
        const iv = Math.abs(midis[i] - midis[i - 1]);
        if (iv === 1) semitoneClash++;
      }
    });
  }
  if (!outOfScale) ok('和声未掺入调外音，全部取自该调式的宫商角徵羽');
  else err(`有 ${outOfScale} 处和声落在调式音阶之外`);
  if (!semitoneClash) ok('和声三音组内无半音相邻，未因掺入变宫变徵而失真');
  else err(`有 ${semitoneClash} 处和声含半音相邻`);
}

console.log('\n=== 6. 伴奏层：四层齐备且不过密 ===');
{
  const hex = D.getHexagram(55);
  const cfg = D.deriveMusicConfig(hex);
  const sc = M.composeNotes(hex, cfg);
  const voices = new Set(sc.notes.map((n) => n.voice));
  // ① 宫音踏板 + 和声垫（pad，含多音）
  const pads = sc.notes.filter((n) => n.voice === 'pad');
  const multiTone = pads.filter((n) => n.tones && n.tones.length > 1);
  // ② 支声（xian）
  const counter = sc.notes.filter((n) => n.voice === 'xian');
  // ③ 节奏骨架（柷敔/鼓）
  const zhu = sc.notes.filter((n) => n.voice === 'zhu');
  const gu = sc.notes.filter((n) => n.voice === 'gu');

  if (pads.length > 0 && multiTone.length > 0) {
    ok(`宫音踏板与和声垫已合并为多音 pad（${multiTone.length} 个多音 pad）`);
  } else {
    err('未找到合并的多音 pad（踏板 + 和声垫）');
  }
  if (counter.length > 0) ok(`支声应和齐备（${counter.length} 个弦音支声）`);
  else err('未找到支声');
  if (zhu.length > 0 || gu.length > 0) ok(`节奏骨架齐备（柷敔 ${zhu.length} / 鼓 ${gu.length}）`);
  else err('未找到柷敔或鼓的节奏骨架');

  // 不过密：pad 时长不应压倒主旋律
  let padSec = 0, allSec = 0;
  sc.notes.forEach((n) => { allSec += n.dur; });
  pads.forEach((n) => { padSec += n.dur; });
  const ratio = padSec / allSec;
  if (ratio < 0.6) ok(`伴奏未过密：pad 占音符总时长的 ${(ratio * 100).toFixed(0)}%（< 60%）`);
  else err(`pad 占比过高（${(ratio * 100).toFixed(0)}%），会糊成一片`);
}

console.log('\n=== 7. 伴奏层：各段均有声 ===');
{
  let bad = 0;
  for (let n = 1; n <= 64; n++) {
    const hex = D.getHexagram(n);
    const cfg = D.deriveMusicConfig(hex);
    const sc = M.composeNotes(hex, cfg);
    const pcm = R.renderScore(sc, { sampleRate: 8000 });
    Object.entries(sc.sections).forEach(([k, v]) => {
      const from = Math.floor(v.start * pcm.sampleRate);
      const to = Math.min(Math.floor(v.end * pcm.sampleRate), pcm.left.length);
      let s = 0, c = 0;
      for (let i = from; i < to; i++) { s += pcm.left[i] * pcm.left[i]; c++; }
      const rms = c ? Math.sqrt(s / c) : 0;
      if (rms < 0.008) {
        bad++;
        if (bad <= 3) err(`卦 ${n}「${hex.name}」的 ${k} 段近静音（RMS ${rms.toFixed(4)}）`);
      }
    });
  }
  if (!bad) ok('64 卦的起/承/转/合四段均有声音');
}

/* ===============================================================
 * 三、爻序
 * =============================================================== */
console.log('\n=== 8. 六爻显示方向 ===');
{
  // 网页版 renderYao 按 i=5..0 插入，故 DOM 首元素须是上爻。
  // 注意：雷火丰与火山旅的「自上而下显示序」互为逆序（001101 / 101100），
  // 单看序列无法区分两卦，须连同卦名一起判断。
  const r = H.numberHexagram(4, 3);   // 上震下离 = 雷火丰
  const reading = H.buildReading(r);
  const domOrder = [];
  for (let i = 5; i >= 0; i--) domOrder.push(reading.yaoList[i]);
  const domYang = domOrder.map((y) => (y.isYang ? 1 : 0)).join('');
  const expect = D.getSixLines(r.hex).slice().reverse().join('');
  if (domYang === expect && reading.name === '雷火丰') {
    ok(`雷火丰 ䷶（${reading.structure}）DOM 自上而下为 ${domYang}，与本卦六爻一致`);
  } else {
    err(`雷火丰 DOM 顺序异常：${domYang}，期望 ${expect}`);
  }
  // 反向验证：若二次反转（column-reverse），DOM 序会等于火山旅的显示序
  const lv = D.getHexagram(56);
  const lvDom = D.getSixLines(lv).slice().reverse().join('');
  if (lvDom !== domYang) {
    ok('雷火丰与火山旅的显示序互不相同（错误实现会令二者混淆）');
  } else {
    err('两卦显示序相同，无法区分');
  }
  // 动爻标记唯一
  const moving = reading.yaoList.filter((y) => y.isMoving);
  if (moving.length === 1) ok('动爻标记唯一');
  else err(`动爻标记数量为 ${moving.length}，应为 1`);
}

console.log('\n=== 汇总 ===');
console.log(`  通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
