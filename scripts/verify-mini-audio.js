/**
 * 微信小程序端 · 播放链路校验
 * ---------------------------------------------------------------
 * 小程序端没有 Web Audio，走的是「写 WAV 落盘 + InnerAudioContext 播放」。
 * 本脚本以「小程序环境」加载 core/player.js（挂上 wx、屏蔽 Node 特征），
 * 校验整条链路：
 *   ① 既定乐谱播放（乐器试听）—— 不报错、创建了 InnerAudioContext
 *   ② 即兴连播（音乐页主路径）—— 不报错、**不得触碰 Web Audio**
 *   ③ genPos —— 能取到当前轮的乐谱与播放位置（波形台据此推算频谱）
 *   ④ 端到端 —— 播放 → genPos → 波形台频谱推算有能量
 *
 * 用法：node scripts/verify-mini-audio.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MP_ROOT = path.join(ROOT, 'miniprogram');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  [OK] ' + m); };
const err = (m) => { fail++; console.log('  [!!] ' + m); };
const assert = (cond, msg) => { if (cond) ok(msg); else err(msg); };

/* ---------- 小程序 API 桩 ---------- */

const writtenFiles = [];
const audioContexts = [];

const wx = {
  getSystemInfoSync: () => ({ platform: 'devtools', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  getWindowInfo: () => ({ pixelRatio: 2, windowWidth: 375, windowHeight: 667 }),
  env: { USER_DATA_PATH: '/tmp/gx' },
  getFileSystemManager: () => ({
    writeFile: (opts) => {
      try {
        fs.mkdirSync('/tmp/gx', { recursive: true });
        const p = path.join('/tmp/gx', path.basename(opts.filePath));
        fs.writeFileSync(p, Buffer.from(opts.data));
        writtenFiles.push(opts.filePath);
        if (opts.success) opts.success({});
      } catch (e) {
        if (opts.fail) opts.fail({ errMsg: e.message });
      }
      return { onProgressUpdate: () => {} };
    }
  }),
  createInnerAudioContext: () => {
    const ctx = {
      autoplay: false, obeyMuteSwitch: false, volume: 1,
      currentTime: 0, duration: 0, src: '',
      _cb: { time: null, ended: null, error: null },
      onTimeUpdate: (f) => { ctx._cb.time = f; },
      onEnded: (f) => { ctx._cb.ended = f; },
      onError: (f) => { ctx._cb.error = f; },
      play: () => { ctx.playing = true; audioContexts.push(ctx); },
      pause: () => { ctx.playing = false; },
      stop: () => { ctx.playing = false; ctx.currentTime = 0; },
      seek: (t) => { ctx.currentTime = t; },
      destroy: () => {}
    };
    return ctx;
  }
};

global.wx = wx;

/**
 * 以「小程序环境」加载小程序侧的模块
 * 说明：core 的环境判定已改为「先看 wx」，
 * 故这里只需挂上 global.wx，无需摘掉 global.process。
 */
function loadAsMiniprogram(relPath) {
  const full = path.join(MP_ROOT, relPath);
  const hadWx = 'wx' in global;
  const oldWx = global.wx;
  global.wx = wx;
  try {
    const Module = require('module');
    const m = new Module(full, null);
    m.filename = full;
    m.paths = Module._nodeModulePaths(path.dirname(full));
    const code = fs.readFileSync(full, 'utf8');
    const fn = new Function('wx', 'module', 'exports', 'require', 'console', code);
    fn(wx, m, m.exports, m.require.bind(m), console);
    return m.exports;
  } finally {
    if (hadWx) global.wx = oldWx;
    else { try { delete global.wx; } catch (e) { /* noop */ } }
  }
}

/* ---------- 测试 ---------- */

(async () => {
  console.log('=== 微信小程序端 · 播放链路校验 ===\n');

  const P = loadAsMiniprogram('core/player.js');
  assert(P.IS_MINIPROGRAM === true, '环境判定为小程序（IS_MINIPROGRAM）');
  assert(P.IS_NODE === false, '环境判定非 Node（IS_NODE）');

  /* 小程序端专属的播放后端（InnerAudioContext + WAV 落盘）。
     它只存在于 miniprogram/utils/ —— 网页端有自己的一份，互不干涉。 */
  const { MiniBackend } = loadAsMiniprogram('utils/audio-backend-mini.js');

  const D = require(path.join(ROOT, 'core/data.js'));
  const hex = D.HEXAGRAMS[0];
  const cfg = D.deriveMusicConfig(hex);

  const backend = new MiniBackend();
  const pl = new P.Player({ backend });
  const errors = [];
  pl.onError = (m) => errors.push(String(m));

  /* ① 既定乐谱（乐器试听路径） */
  pl.play({ notes: [{ time: 0, dur: 0.5, midi: 60, vel: 0.8 }], duration: 0.6, sections: {} }, { offset: 0 });
  assert(errors.length === 0, '既定乐谱播放：无错误（' + errors.join('；') + '）');
  assert(audioContexts.length > 0, '既定乐谱播放：已创建 InnerAudioContext');
  assert(writtenFiles.length > 0, '既定乐谱播放：WAV 已写盘');

  /* ② 即兴连播（音乐页主路径） */
  errors.length = 0;
  pl.playGenerative(hex, cfg, null, {});
  assert(errors.length === 0, '即兴连播：无错误（' + errors.join('；') + '）');
  assert(!errors.some((e) => /Web Audio/.test(e)),
    '即兴连播：未触碰 Web Audio（不报「不支持 Web Audio API」）');

  /* 等首轮编完（走 Promise） */
  await new Promise((r) => setTimeout(r, 2500));

  /* ③ genPos */
  const pos = pl.genPos;
  assert(!!pos, 'genPos：能取到当前轮');
  if (pos) {
    assert(!!pos.score && !!pos.score.notes && pos.score.notes.length > 0,
      'genPos：含乐谱（波形台据此推算频谱）');
    assert(typeof pos.elapsed === 'number' && pos.duration > 0,
      `genPos：含播放位置（${pos.elapsed.toFixed(2)} / ${pos.duration.toFixed(2)} 秒）`);
  }

  /* ④ 端到端：播放 → genPos → 波形台频谱 */
  if (pos) {
    const V = loadAsMiniprogram('core/viz-stage.js');
    const bins = V.spectrumFromScore(pos.score, pos.elapsed, 64);
    let mx = 0;
    for (let i = 0; i < bins.length; i++) if (bins[i] > mx) mx = bins[i];
    assert(mx > 0, `端到端：波形台频谱有能量（峰值 ${mx.toFixed(2)}）`);
  }

  /* ⑤ 暂停 / 继续 —— 小程序端走 InnerAudioContext，不能依赖 Web Audio 的 _ctx */
  {
    const inner = audioContexts[audioContexts.length - 1];
    assert(!!inner, '暂停测试：有 InnerAudioContext 可操作');
    let innerPaused = false;
    let innerPlayed = false;
    if (inner) {
      const origPause = inner.pause.bind(inner);
      const origPlay = inner.play.bind(inner);
      inner.pause = () => { innerPaused = true; origPause(); };
      inner.play = () => { innerPlayed = true; origPlay(); };
    }
    const states = [];
    pl.onStateChange = (s) => states.push(s);

    const okPause = pl.pause();
    assert(okPause === true, '暂停：返回成功（小程序端不依赖 Web Audio 上下文）');
    assert(innerPaused === true, '暂停：调用了 InnerAudioContext.pause()');
    assert(pl.paused === true, '暂停：paused 标记已置');
    assert(states.indexOf('paused') >= 0, '暂停：发出了 paused 状态事件');

    const okResume = pl.resume();
    assert(okResume === true, '继续：返回成功');
    assert(innerPlayed === true, '继续：调用了 InnerAudioContext.play()');
    assert(pl.paused === false, '继续：paused 标记已清');
    assert(states.indexOf('playing') >= 0, '继续：发出了 playing 状态事件');
  }

  /* ⑥ 暂停后 isPlaying 仍为 true —— 这是「图标不切换」类 bug 的根源。
   *    引擎语义：暂停 = 挂起（仍在播），停止才是结束。
   *    UI 若拿 isPlaying 判断图标，暂停后就永远看不到变化。
   *    注意：上面刚做过 resume()，paused 已被清，故这里要重新暂停再断言。 */
  {
    pl.pause();
    assert(pl.isPlaying === true, '暂停后 isPlaying 仍为 true（暂停≠停止）');
    assert(pl.paused === true, '暂停后 paused 为 true');
    pl.resume();
  }

  /* ⑦ 音量：新建的音频源须继承当前音量（否则换轮后音量被重置） */
  {
    pl.setVolume(0.42);
    assert(Math.abs(pl._volume - 0.42) < 1e-6, 'setVolume 记住了音量值');
    const innerVol = audioContexts.length
      ? audioContexts[audioContexts.length - 1].volume : null;
    assert(innerVol != null && Math.abs(innerVol - 0.42) < 1e-6,
      '当前播放中的音频源音量已生效（' + innerVol + '）');
  }

  pl.stop();

  console.log('\n' + '='.repeat(46));
  console.log(`通过 ${pass} 项，失败 ${fail} 项`);
  console.log('='.repeat(46));
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('校验异常终止：', e);
  process.exit(1);
});
