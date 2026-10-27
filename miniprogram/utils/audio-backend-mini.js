/**
 * 古律象音 · 微信小程序端播放后端（InnerAudioContext）
 * ---------------------------------------------------------------
 * 职责：把引擎（core/player.js）算好的 PCM 变成声音，并管住播放文件。
 * 小程序没有 Web Audio，故采用两级策略：
 *   ① 主路径 —— 写 WAV 落盘，用 InnerAudioContext 播放
 *      （可后台播放、进度精确、文件可分享）
 *   ② 降级   —— 落盘失败时用 wx.createWebAudioContext() 实时合成
 *
 * 与网页端的关键差异：
 *   · 音层烘进 PCM（小程序无实时音层总线）→ backend.liveAmbient = false
 *   · 续播是「串行」的：本轮播完 → 回报引擎 → 引擎编下一轮 → 再播
 *     （InnerAudioContext 无法交叉淡入，故不做叠尾）
 *   · 无 Worker（小程序主线程即渲染线程）→ backend.worker = false
 *
 * 契约见 core/backend.js。
 */

'use strict';

const render = require('../core/render.js');

/**
 * 小程序端后端
 */
class MiniBackend {
  constructor() {
    this.name = 'miniprogram';
    this.liveAmbient = false;   // 音层烘进 PCM，无实时总线
    this.worker = false;        // 无后台 Worker

    this._inner = null;
    this._fileCache = new Map();   // 缓存键 → 本地文件路径
    this._volume = null;
    this._paused = false;
  }

  get analyser() { return null; }   // 小程序无频谱分析器（波形台改由乐谱推算）

  contextSuspended() { return false; }

  now() {
    if (this._inner && typeof this._inner.currentTime === 'number') {
      return this._inner.currentTime;
    }
    return 0;
  }

  /* ---------- 播放 ---------- */

  /**
   * 播放一段既定乐谱（乐器试听）
   * 优先写 WAV 落盘后用 InnerAudioContext 播；落盘失败则降级实时合成。
   */
  playScore(score, pcm, offset, hooks) {
    const key = this._cacheKey(score);
    const cached = this._fileCache.get(key);

    if (cached) {
      this._playInner(cached, offset, hooks);
      return;
    }

    // 落盘需要时间，用 loading 反馈
    if (hooks && hooks.onStateChange) hooks.onStateChange('rendering');

    let wav;
    try {
      wav = render.encodeWav(pcm);
    } catch (e) {
      if (hooks && hooks.onError) hooks.onError('编码失败：' + e.message);
      return;
    }

    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/gx_${key}.wav`;

    const writeTask = fs.writeFile({
      filePath,
      data: wav,
      success: () => {
        this._fileCache.set(key, filePath);
        this._playInner(filePath, offset, hooks);
      },
      fail: (err) => {
        // 落盘失败则降级为实时合成
        this._playRealtime(score, pcm, offset, hooks, err);
      }
    });
    if (writeTask && writeTask.onProgressUpdate) {
      writeTask.onProgressUpdate((res) => {
        if (hooks && hooks.onStateChange) hooks.onStateChange('rendering', res.progress);
      });
    }
  }

  /**
   * 播放即兴连播的一轮
   * 小程序无法交叉淡入，故为「串行」：一轮播完由 onEnded 回调引擎续下一轮。
   */
  playRound(round, g, hooks) {
    if (hooks && hooks.onStateChange) hooks.onStateChange('rendering');
    let wav;
    try {
      wav = render.encodeWav(round.pcm);
    } catch (e) {
      if (hooks && hooks.onError) hooks.onError('编码失败：' + e.message);
      return;
    }
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/gxgen_${g.hex.n}_${round.round}.wav`;
    fs.writeFile({
      filePath,
      data: wav,
      success: () => {
        const inner = wx.createInnerAudioContext();
        this._inner = inner;
        inner.obeyMuteSwitch = false;
        // 新建的 inner 要继承当前音量 —— 否则换轮后音量会被重置为默认
        if (this._volume != null) inner.volume = this._volume;
        // 进度上报（播放条的时间显示）
        inner.onTimeUpdate(() => {
          if (!hooks || !hooks.onProgress) return;
          if (!hooks.currentDuration) return;
          hooks.onProgress(inner.currentTime, hooks.currentDuration());
        });
        inner.onEnded(() => {
          if (!hooks || !hooks.onRoundEnded) return;
          hooks.onRoundEnded(g, round);
        });
        inner.onError((err) => {
          if (hooks && hooks.onError) hooks.onError('播放失败：' + (err.errMsg || '未知错误'));
        });
        inner.src = filePath;
        inner.play();
        this._paused = false;
        if (hooks && hooks.onStateChange) hooks.onStateChange('playing');
      },
      fail: (err) => {
        if (hooks && hooks.onError) hooks.onError('写盘失败：' + (err.errMsg || '未知错误'));
      }
    });
  }

  /** 用 InnerAudioContext 播放本地 WAV */
  _playInner(filePath, offset, hooks) {
    const inner = wx.createInnerAudioContext();
    this._inner = inner;

    inner.autoplay = false;
    inner.obeyMuteSwitch = false;

    inner.onTimeUpdate(() => {
      if (!hooks || !hooks.onProgress) return;
      if (!hooks.currentDuration) return;
      hooks.onProgress(inner.currentTime, hooks.currentDuration());
    });
    inner.onEnded(() => {
      if (hooks && hooks.onEnded) hooks.onEnded();
    });
    inner.onError((err) => {
      if (hooks && hooks.onError) hooks.onError('播放失败：' + (err.errMsg || '未知错误'));
    });

    inner.src = filePath;
    if (offset > 0) inner.seek(offset);
    inner.play();
    this._paused = false;
    if (hooks && hooks.onStateChange) hooks.onStateChange('playing');
  }

  /**
   * 降级方案：wx.createWebAudioContext() 实时合成
   * 注意：该 API 不支持 createConvolver / createStereoPanner，
   * 因此这里用延迟反馈网络模拟混响、用声道分离模拟声像。
   */
  _playRealtime(score, pcm, offset, hooks, writeErr) {
    if (typeof wx === 'undefined' || !wx.createWebAudioContext) {
      if (hooks && hooks.onError) {
        hooks.onError('当前环境无法播放音频' + (writeErr ? '：' + writeErr.errMsg : ''));
      }
      return;
    }
    try {
      const ctx = wx.createWebAudioContext();
      if (ctx.state === 'suspended') ctx.resume();

      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);

      // 简易混响：延迟 + 反馈
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.18;
      const fb = ctx.createGain();
      fb.gain.value = 0.34;
      const wet = ctx.createGain();
      wet.gain.value = 0.26;
      master.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(master);

      // 声像：用声道分离 + 增益模拟 StereoPanner
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const gl = ctx.createGain();
      const gr = ctx.createGain();
      gl.gain.value = 0.707;
      gr.gain.value = 0.707;
      master.connect(splitter);
      splitter.connect(gl, 0);
      splitter.connect(gr, 1);
      gl.connect(merger, 0, 0);
      gr.connect(merger, 0, 1);
      merger.connect(ctx.destination);

      // 把渲染好的 PCM 灌进去
      const buf = ctx.createBuffer(2, pcm.length, pcm.sampleRate);
      buf.getChannelData(0).set(pcm.left);
      buf.getChannelData(1).set(pcm.right);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(master);
      src.onended = () => {
        if (hooks && hooks.onEnded) hooks.onEnded();
      };
      src.start(0, offset);

      this._paused = false;
      if (hooks && hooks.onStateChange) hooks.onStateChange('playing');
    } catch (e) {
      if (hooks && hooks.onError) hooks.onError('实时合成失败：' + e.message);
    }
  }

  /* ---------- 控制 ---------- */

  pause() {
    if (!this._inner) return false;
    try { this._inner.pause(); } catch (e) { return false; }
    this._paused = true;
    return true;
  }

  resume() {
    if (!this._inner) return false;
    try { this._inner.play(); } catch (e) { return false; }
    this._paused = false;
    return true;
  }

  stop() {
    if (this._inner) {
      try { this._inner.stop(); } catch (e) { /* noop */ }
      try { this._inner.destroy(); } catch (e) { /* noop */ }
      this._inner = null;
    }
    this._paused = false;
  }

  setVolume(v) {
    const vol = Math.max(0, Math.min(1, v));
    this._volume = vol;
    if (this._inner) this._inner.volume = vol;
  }

  teardown() {
    this.stop();
    this._fileCache.clear();
  }

  /* ---------- 工具 ---------- */

  /** 缓存键：按卦序与起始偏移区分 */
  _cacheKey(score) {
    const first = score.notes[0];
    const h = first ? (first.midi * 1000 + Math.round(first.time * 10)) : 0;
    return `${h}_${score.notes.length}`;
  }
}

/* 导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MiniBackend };
}

