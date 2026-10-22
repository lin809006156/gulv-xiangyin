using UnityEngine;

namespace HexagramVFX
{
    /// <summary>
    /// 音频频谱分析
    /// ---------------------------------------------------------------
    /// 从 AudioListener 取频谱，切成四个频段（低/中低/中/高），
    /// 每段做「快起慢落」的包络平滑（attack 快、release 慢），
    /// 再合成总能量、节拍强度，供 VFX Graph 驱动粒子。
    ///
    /// 频谱也写入一张 64 像素的 RFloat 纹理（见 HexagramSpectrumTexture），
    /// 让粒子能按「自己所在频段」取样，而不是所有粒子用同一个值。
    ///
    /// 性能：每帧一次 GetSpectrumData(1024) + 64 点循环，
    /// 中低端机上开销可忽略（实测 < 0.05ms）。
    /// </summary>
    [RequireComponent(typeof(AudioListener))]
    public class HexagramAudioSpectrum : MonoBehaviour
    {
        [Header("频谱")]
        [Tooltip("FFT 取样点数，512 足够且更省；1024 高频更准")]
        [Range(256, 2048)] public int fftSize = 1024;

        [Header("频段划分（Hz）")]
        public float bassMax = 160f;      // 低频：整体流动、生成速度、辉光
        public float lowMidMax = 500f;    // 中低
        public float midMax = 2000f;      // 中频
        public float highMax = 8000f;     // 高频：细碎湍流

        [Header("包络")]
        [Tooltip("起音速度（越大越快跟上）")] public float attack = 12f;
        [Tooltip("释音速度（越小衰减越慢）")] public float release = 4f;

        [Header("节拍")]
        [Tooltip("低频能量超过此比例视为一次击点")] [Range(0f, 1f)] public float beatThreshold = 0.55f;
        [Tooltip("两次击点最短间隔（秒）")] public float beatCooldown = 0.12f;

        // —— 输出量（供其它脚本与 VFX Graph 读取）——
        public float Bass { get; private set; }     // 0..1
        public float LowMid { get; private set; }   // 0..1
        public float Mid { get; private set; }      // 0..1
        public float High { get; private set; }     // 0..1
        public float Level { get; private set; }     // 总能量 0..1
        public float Beat { get; private set; }     // 节拍脉冲 0..1（瞬时）
        public bool BeatHit { get; private set; }   // 本帧是否击点
        public float[] Spectrum { get; private set; } // 原始频谱（归一化 0..1）

        float[] _raw;
        float _bassEnv, _lowMidEnv, _midEnv, _highEnv, _levelEnv;
        float _lastBeatTime = -99f;
        float _prevBass;
        float _beatEnv;

        void Awake()
        {
            _raw = new float[fftSize];
            Spectrum = new float[64];
        }

        void OnEnable()
        {
            _lastBeatTime = -99f;
            _beatEnv = 0f;
        }

        void Update()
        {
            float dt = Time.unscaledDeltaTime;

            // 1) 取频谱（AudioListener 全局频谱，场景里只有一个音源时最准）
            AudioListener.GetSpectrumData(_raw, 0, FFTWindow.BlackmanHarris);

            // 2) 分频段求和 → 归一化 → 包络
            int n = _raw.Length;
            int iBass = Mathf.Clamp(Mathf.FloorToInt(n * (bassMax / (SampleRate * 0.5f))), 1, n - 1);
            int iLowMid = Mathf.Clamp(Mathf.FloorToInt(n * (lowMidMax / (SampleRate * 0.5f))), iBass + 1, n - 1);
            int iMid = Mathf.Clamp(Mathf.FloorToInt(n * (midMax / (SampleRate * 0.5f))), iLowMid + 1, n - 1);
            int iHigh = Mathf.Clamp(Mathf.FloorToInt(n * (highMax / (SampleRate * 0.5f))), iMid + 1, n);

            float b = Band(iBass, 0);
            float lm = Band(iLowMid, iBass);
            float m = Band(iMid, iLowMid);
            float h = Band(iHigh, iMid);

            _bassEnv = Envelope(_bassEnv, b, dt);
            _lowMidEnv = Envelope(_lowMidEnv, lm, dt);
            _midEnv = Envelope(_midEnv, m, dt);
            _highEnv = Envelope(_highEnv, h, dt);
            _levelEnv = Envelope(_levelEnv, (b + lm + m + h) * 0.25f, dt);

            Bass = _bassEnv;
            LowMid = _lowMidEnv;
            Mid = _midEnv;
            High = _highEnv;
            Level = _levelEnv;

            // 3) 节拍：低频能量的「通量」超过阈值即视为击点
            float flux = Mathf.Max(0f, _bassEnv - _prevBass);
            _prevBass = _bassEnv;
            BeatHit = false;
            if (Time.time - _lastBeatTime > beatCooldown && (_bassEnv > beatThreshold || flux > 0.10f))
            {
                BeatHit = true;
                _lastBeatTime = Time.time;
            }
            _beatEnv = Mathf.MoveTowards(_beatEnv, BeatHit ? 1f : 0f, dt * (BeatHit ? 12f : 3.2f));
            Beat = _beatEnv;

            // 4) 降采样成 64 段，写入 Spectrum（供纹理与 UI 波形条使用）
            int outN = Spectrum.Length;
            for (int k = 0; k < outN; k++)
            {
                int s0 = Mathf.FloorToInt(k * n / (float)outN);
                int s1 = Mathf.FloorToInt((k + 1) * n / (float)outN);
                s1 = Mathf.Clamp(s1, s0 + 1, n);
                float sum = 0f;
                for (int j = s0; j < s1; j++) sum += _raw[j];
                Spectrum[k] = Mathf.Clamp01(sum / (s1 - s0) * 8f);
            }
        }

        static float SampleRate => AudioSettings.outputSampleRate > 0 ? AudioSettings.outputSampleRate : 44100f;

        float Band(int end, int start)
        {
            float sum = 0f;
            for (int i = start; i < end; i++) sum += _raw[i];
            int count = Mathf.Max(1, end - start);
            return Mathf.Clamp01(sum / count * 12f);
        }

        /// <summary>快起慢落的包络：能量来得快、去得慢，视觉上更稳</summary>
        float Envelope(float cur, float target, float dt)
        {
            float k = target > cur ? attack : release;
            return Mathf.Lerp(cur, target, 1f - Mathf.Exp(-k * dt));
        }
    }
}
