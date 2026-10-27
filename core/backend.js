/**
 * 古律象音 · 播放后端契约
 * ---------------------------------------------------------------
 * core/player.js 只管「业务编排」：起卦 → 作曲 → 交给后端出声 → 回报状态。
 * 「怎么出声」是平台专属的事，由各端各自实现一份后端，构造 Player 时注入：
 *
 *   web/js/audio-backend-web.js          —— Web Audio（网页版 + Capacitor APP）
 *   miniprogram/utils/audio-backend-mini.js —— InnerAudioContext（微信小程序）
 *
 * 这样拆分之后：
 *   · 改小程序播放逻辑 → 只动 miniprogram/utils/，网页端一行不受影响；
 *   · 改网页播放逻辑   → 只动 web/js/，小程序一行不受影响；
 *   · 改共享逻辑（编曲、循环、导出）→ 动 core/player.js，两端同时生效（这是应有之义）。
 *
 * ── 契约 ──────────────────────────────────────────────────
 *
 *   name            'web' | 'miniprogram' | 'Node'
 *   liveAmbient     是否支持「实时音层总线」（只有 web 有：音层不烘进 PCM，
 *                   开关即时可闻；小程序与 Node 把音层烘进 PCM）
 *   worker          是否支持后台 Worker 渲染（只有 web 有：编曲渲染搬离主线程）
 *   analyser        频谱分析器（waveform 台取频谱用；小程序无，返回 null）
 *
 *   now()                    当前播放位置（秒）。与 round.startAt 同一基准。
 *   playScore(score, pcm, offset, hooks)   播放一段既定乐谱（乐器试听）
 *   playRound(round, g, hooks)             播放即兴连播的一轮
 *   scheduleRound(prev, next, g)           把下一轮接到时间轴上（仅调度型后端用）
 *   pause() / resume() / stop()            播放控制
 *   setVolume(v)                           音量 0..1
 *   contextSuspended()                      音频上下文是否被系统挂起
 *   applyLiveAmbient(amb, fade) / silenceLiveAmbient(fade)   实时音层
 *   teardown()                              释放全部音频资源
 *
 * ── hooks（后端向引擎回报） ────────────────────────────────
 *
 *   onProgress(elapsed, duration)   进度
 *   onRoundEnded(g, round)          这一轮自然结束（串行型后端据此续下一轮）
 *   onStateChange(state, progress)  状态：rendering / playing / paused / stopped
 *   onError(msg)                    错误
 *   composeRound(g, roundNo)        引擎的编曲渲染（同步，返回一轮）
 *   isLoop()                        引擎当前的循环开关
 *
 * ── 两类续播模型 ──────────────────────────────────────────
 *
 *   调度型（web）：引擎提前把下一轮排到 Web Audio 时间轴上，与本轮尾部叠尾相接。
 *   串行型（小程序）：本轮播完 → 后端回报 onRoundEnded → 引擎编下一轮 → 再播。
 *
 * 引擎不判断平台，只看后端行为；后端也不认识 core，两边只通过这份契约对话。
 */

'use strict';

/* __IC_IIFE__ */
(function () {

/**
 * 空后端 —— Node 环境与未注入后端时使用
 * ---------------------------------------------------------------
 * Node 只做渲染与导出，本就没有声音；这里给出明确报错而不是静默失败。
 * name 用 'Node'：既有的错误文案与断言依赖这个词。
 */
function createNullBackend() {
  const noop = () => {};
  return {
    name: 'Node',
    liveAmbient: false,
    worker: false,
    analyser: null,

    now: () => 0,
    playScore(score, pcm, offset, hooks) {
      if (hooks && hooks.onError) hooks.onError('Node 环境不支持播放');
    },
    playRound(round, g, hooks) {
      if (hooks && hooks.onError) hooks.onError('Node 环境不支持播放');
    },
    scheduleRound: noop,
    pause: () => false,
    resume: () => false,
    stop: noop,
    setVolume: noop,
    contextSuspended: () => false,
    applyLiveAmbient: noop,
    silenceLiveAmbient: noop,
    teardown: noop
  };
}

const API = { createNullBackend };

/* 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else {
  window.ICBackend = API;
}

})();
