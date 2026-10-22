using UnityEngine;

namespace HexagramVFX
{
    /// <summary>
    /// 可视化总控
    /// ---------------------------------------------------------------
    /// 把「音乐播放状态」翻译成「云雾的三段动画」，并逐帧把频谱推给 VFX。
    ///
    /// 三段（与音乐同步）：
    ///   渐入 Intro  —— 雾自画面左右两端慢慢生成、缓缓向中心卦象汇聚；
    ///                  低频控制生成速度与辉光亮度。
    ///   进行 Playing —— 多条横向声波自左向右穿过卦象；碰到卦爻时产生扰动、
    ///                  湍流、散开；音量越大流速越快、粒子越亮、扰动越强；
    ///                  高频控制细碎湍流，低频控制整体流动。
    ///   渐出 Outro  —— 粒子衰减消散，云雾变淡，向两侧飘走消失。
    ///
    /// 另外内置帧率兜底：连续低帧时自动降一档画质（见 CheckPerformance）。
    /// </summary>
    public class HexagramVizController : MonoBehaviour
    {
        [Header("引用")]
        public HexagramAudioSpectrum spectrum;
        public HexagramVfxDriver vfx;
        public HexagramModelBuilder model;
        public HexagramQualityManager quality;
        public HexagramSpectrumTexture spectrumTexture;
        public HexagramPlayerUI player;

        [Header("三段时长（秒）")]
        [Tooltip("渐入：雾自两端浮现并汇聚的时长")]
        public float introDuration = 3.0f;
        [Tooltip("渐出：粒子消散的时长")]
        public float outroDuration = 2.6f;

        [Header("流动映射")]
        [Tooltip("流速随音量的倍率区间")]
        public Vector2 speedByLevel = new Vector2(0.45f, 2.4f);
        [Tooltip("湍流随音量的倍率区间")]
        public Vector2 turbulenceByLevel = new Vector2(0.35f, 2.2f);
        [Tooltip("辉光随音量的倍率区间")]
        public Vector2 glowByLevel = new Vector2(0.5f, 2.6f);
        [Tooltip("高频对细碎湍流的额外贡献")]
        public float highFrequencyTurbulence = 0.85f;

        [Header("自动降档")]
        [Tooltip("低于此帧率持续一段时间则降一档画质")]
        public int lowFpsThreshold = 45;
        [Tooltip("观察窗口（秒）")]
        public float lowFpsWindow = 3f;
        public bool autoQualityDowngrade = true;

        // —— 状态 ——
        public enum Stage { Idle, Intro, Playing, Outro }
        public Stage CurrentStage { get; private set; } = Stage.Idle;
        public bool IsPlaying => CurrentStage == Stage.Intro || CurrentStage == Stage.Playing;

        float _stageTime;
        float _lowFpsTimer;
        int _fpsSamples;
        float _fpsSum;
        bool _downgraded;

        void Awake()
        {
            if (!spectrum) spectrum = FindObjectOfType<HexagramAudioSpectrum>();
            if (!vfx) vfx = FindObjectOfType<HexagramVfxDriver>();
            if (!model) model = FindObjectOfType<HexagramModelBuilder>();
            if (!quality) quality = FindObjectOfType<HexagramQualityManager>();
            if (!spectrumTexture) spectrumTexture = FindObjectOfType<HexagramSpectrumTexture>();
            if (quality) quality.OnChanged += ApplyQuality;
        }

        void OnDestroy()
        {
            if (quality) quality.OnChanged -= ApplyQuality;
        }

        void Start()
        {
            ApplyQuality(quality ? quality.Profile : HexagramQualityProfile.Standard);
            SyncModelToVfx();
        }

        void ApplyQuality(HexagramQualityProfile p)
        {
            if (vfx && vfx.smokeVfx)
            {
                vfx.smokeVfx.SetFloat("SpawnRate", p.spawnRate);
                vfx.smokeVfx.SetInt("MaxParticles", p.maxParticles);
            }
        }

        void SyncModelToVfx()
        {
            if (!vfx || !model) return;
            vfx.SetModel(model.SdfTexture, model.ModelBounds);
            vfx.SetHexIndex(model.hexNumber);
        }

        // ---------- 对外控制（UI / 桥调用） ----------

        /// <summary>开始（配合播放器播放）</summary>
        public void OnPlaybackStarted()
        {
            CurrentStage = Stage.Intro;
            _stageTime = 0f;
            vfx?.SetPhase(HexagramVfxDriver.Phase.Intro);
            vfx?.SetDirection(0f);              // 渐入：自左右两端向中心汇聚
            if (player) player.SetPlaying(true);
        }

        /// <summary>停止（进入渐出消散）</summary>
        public void OnPlaybackStopped()
        {
            if (CurrentStage == Stage.Idle) return;
            CurrentStage = Stage.Outro;
            _stageTime = 0f;
            vfx?.SetPhase(HexagramVfxDriver.Phase.Outro);
            vfx?.SetDirection(0f);              // 渐出：向两侧飘走
            if (player) player.SetPlaying(false);
        }

        /// <summary>暂停（定格，不进入消散）</summary>
        public void OnPlaybackPaused()
        {
            if (IsPlaying) vfx?.smokeVfx?.Pause();
        }

        public void OnPlaybackResumed()
        {
            if (IsPlaying) vfx?.smokeVfx?.Resume();
        }

        /// <summary>切换卦象</summary>
        public void SetHexagram(int number, int moving = 0)
        {
            model?.SetHexagram(number, moving);
            SyncModelToVfx();
        }

        // ---------- 每帧 ----------

        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            _stageTime += dt;

            switch (CurrentStage)
            {
                case Stage.Intro:
                    // 渐入阶段：生成速度与辉光由低频主导
                    vfx?.SetDirection(0f);
                    if (_stageTime >= introDuration) EnterPlaying();
                    break;

                case Stage.Playing:
                    // 进行中：单向横向流（左 → 右）
                    vfx?.SetDirection(1f);
                    break;

                case Stage.Outro:
                    if (_stageTime >= outroDuration)
                    {
                        CurrentStage = Stage.Idle;
                        vfx?.smokeVfx?.Stop();
                    }
                    break;
            }

            if (spectrum && vfx)
            {
                var q = quality ? quality.Profile : HexagramQualityProfile.Standard;
                vfx.PushAudio(spectrum, q);

                float lvl = spectrum.Level;
                // 流速 / 湍流 / 辉光：音量越大越快、越亮、越乱
                vfx.FlowSpeed = Mathf.Lerp(speedByLevel.x, speedByLevel.y, lvl);
                vfx.Turbulence = Mathf.Lerp(turbulenceByLevel.x, turbulenceByLevel.y, lvl)
                                + spectrum.High * highFrequencyTurbulence;
                vfx.Glow = Mathf.Lerp(glowByLevel.x, glowByLevel.y, lvl)
                           * (0.75f + spectrum.Bass * 0.6f);

                // 频谱纹理交给 VFX 采样
                if (spectrumTexture) vfx.SetSpectrumTexture(spectrumTexture.Texture);
            }

            CheckPerformance(dt);
        }

        void EnterPlaying()
        {
            CurrentStage = Stage.Playing;
            vfx?.SetPhase(HexagramVfxDriver.Phase.Playing);
        }

        /// <summary>
        /// 帧率兜底：连续一段时间低于阈值就降一档画质（只降一次，避免抖动）
        /// </summary>
        void CheckPerformance(float dt)
        {
            if (!autoQualityDowngrade || !quality || _downgraded) return;
            _fpsSum += 1f / Mathf.Max(0.0001f, dt);
            _fpsSamples++;
            if (_fpsSamples < 30) return;

            float avgFps = _fpsSum / _fpsSamples;
            _fpsSum = 0f; _fpsSamples = 0;

            if (avgFps < lowFpsThreshold)
            {
                _lowFpsTimer += 1f;
                if (_lowFpsTimer >= lowFpsWindow / 30f)
                {
                    if (quality.level > 0)
                    {
                        quality.SetLevel(quality.level - 1);
                        _lowFpsTimer = 0f;
                        if (quality.level == 0) _downgraded = true;
                    }
                    else _downgraded = true;
                }
            }
            else _lowFpsTimer = 0f;
        }
    }
}
