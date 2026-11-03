/**
 * 古律象音 · 乐器试听乐谱（两端共用）
 * ---------------------------------------------------------------
 * 乐器园的「试听」用：以五声写一句短句，用指定乐器的音色奏出。
 *
 * 为何放在 core/：这段是纯逻辑（不碰任何平台 API），
 * 网页端与小程序端必须听到**完全一样**的试听效果。
 * 此前两端各存一份同样的代码，改一处忘一处就会漂移。
 *
 * 音色修饰取「中性」（clarity/brightness/attack 皆 0.5）：
 * 试听要展示**乐器本色**，不该套上某个调式的清浊。
 * （先前取宫调式的浊值 harmonic=0.95，把高次泛音压到 10%，
 *  钟、磬、弦、柷敔听起来全成了一个干瘪的正弦音。）
 */

'use strict';

/* __IC_IIFE__ */
(function () {

/** 试听短句：宫 商 角 徵 羽 徵 角 商（八音同一句，各以本音色奏出） */
const AUDITION_PHRASE = [0, 2, 4, 7, 9, 7, 4, 2];

/**
 * 试听的音色修饰 —— 中性
 * ---------------------------------------------------------------
 * 各项取 0.5，即「不偏向任何一个调式」：
 *   attack 0.5 → 调制因子恰为 1.0，各乐器用各自的原始起音，
 *                拨弦的「弹」与吹管的「缓」得以保留；
 *   harmonic 0.5 → 泛音浓度不被压制，钟磬的非谐泛音得以显露。
 */
const AUDITION_TIMBRE = {
  clarity: 0.50,
  brightness: 0.52,
  attack: 0.50,
  release: 0.85,
  noise: 0.20,
  harmonic: 0.50
};

/**
 * 造一段试听乐谱
 * @param {string} voice 八音 key（zhu/zhong/xian/gu/xiao/xun/guan/qing）
 * @returns {object} 可直接交给 renderScore 的乐谱
 */
function buildAuditionScore(voice) {
  const percussive = voice === 'gu';
  const highClack = voice === 'zhu';
  // 打击类移低、柷敔移高，贴合其物理音区；有音高的六器同用中音区
  const root = percussive ? 36 : highClack ? 72 : 62;
  const beat = percussive ? 0.34 : 0.44;
  const durs = [0.9, 0.7, 0.9, 1.2, 1.4, 0.8, 0.9, 1.7];

  const notes = [];
  let t = 0;
  for (let i = 0; i < AUDITION_PHRASE.length; i++) {
    const dur = durs[i] * beat;
    notes.push({
      time: +t.toFixed(3),
      dur: +dur.toFixed(3),
      midi: root + AUDITION_PHRASE[i],
      vel: 0.32,
      voice,
      pan: 0,
      timbre: AUDITION_TIMBRE
    });
    t += dur * 0.92;
  }
  return { notes, duration: t + 0.5, sections: {} };
}

const API = { AUDITION_PHRASE, AUDITION_TIMBRE, buildAuditionScore };

/* 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else {
  window.ICAudition = API;
}

})();
