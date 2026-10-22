using System;
using UnityEngine;
using UnityEngine.UI;

namespace HexagramVFX
{
    /// <summary>
    /// 播放器 UI：播放 / 循环 / 导出 WAV 入口（预留回调）/ 波形预览条
    /// ---------------------------------------------------------------
    /// 波形预览条：把当前音频的采样降采样成 128 段，生成一张 Texture2D，
    /// 交给 UI RawImage 显示（比逐帧画线便宜得多，手机上友好）。
    /// 播放中可用频谱实时覆盖（由 SpectrumTexture 提供）。
    ///
    /// 导出 WAV：只留回调接口，由宿主工程决定怎么落地
    /// （本项目里由 Web/Capacitor 侧导出，Unity 侧只负责通知）。
    /// </summary>
    public class HexagramPlayerUI : MonoBehaviour
    {
        /// <summary>导出 WAV 的回调（宿主实现）</summary>
        public interface IExportWavCallback
        {
            /// <summary>请求导出当前音频为 WAV</summary>
            void OnExportWavRequested(AudioClip clip);
        }

        [Header("引用")]
        public AudioSource audioSource;
        public Button playButton;
        public Toggle loopToggle;
        public Button exportButton;
        public RawImage waveformImage;
        public Text statusText;

        [Header("导出")]
        public IExportWavCallback exportCallback;

        [Header("波形预览")]
        [Tooltip("波形条边长（像素）")]
        public int waveformResolution = 128;
        [Tooltip("波形颜色")]
        public Color waveformColor = new Color(0.42f, 0.72f, 1f, 1f);

        Texture2D _waveTex;
        Color[] _wavePixels;
        HexagramAudioSpectrum spectrum;

        void Awake()
        {
            if (!spectrum) spectrum = FindObjectOfType<HexagramAudioSpectrum>();
            _wavePixels = new Color[waveformResolution];
            _waveTex = new Texture2D(waveformResolution, 1, TextureFormat.RGBA32, false)
            {
                name = "HexagramWaveform",
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp
            };
            if (waveformImage) waveformImage.texture = _waveTex;
        }

        void OnEnable()
        {
            if (playButton) playButton.onClick.AddListener(TogglePlay);
            if (loopToggle) loopToggle.onValueChanged.AddListener(v => {
                if (audioSource) audioSource.loop = v;
            });
            if (exportButton) exportButton.onClick.AddListener(RequestExport);
        }

        void OnDisable()
        {
            if (playButton) playButton.onClick.RemoveListener(TogglePlay);
            if (exportButton) exportButton.onClick.RemoveListener(RequestExport);
        }

        // ---------- 播放控制 ----------

        public void TogglePlay()
        {
            if (!audioSource) return;
            if (audioSource.isPlaying) Pause();
            else Play();
        }

        public void Play()
        {
            if (!audioSource) return;
            audioSource.Play();
            SetPlaying(true);
        }

        public void Pause()
        {
            if (!audioSource) return;
            audioSource.Pause();
            SetPlaying(false);
        }

        public void Stop()
        {
            if (!audioSource) return;
            audioSource.Stop();
            SetPlaying(false);
        }

        public void SetPlaying(bool playing)
        {
            if (playButton)
            {
                var label = playButton.GetComponentInChildren<Text>();
                if (label) label.text = playing ? "暂停" : "播放";
            }
            if (statusText) statusText.text = playing ? "正在奏" : "已停";
        }

        public void SetLoop(bool loop)
        {
            if (audioSource) audioSource.loop = loop;
            if (loopToggle) loopToggle.isOn = loop;
        }

        /// <summary>导出 WAV：只发回调，具体落地交给宿主</summary>
        public void RequestExport()
        {
            if (!audioSource || !audioSource.clip)
            {
                if (statusText) statusText.text = "暂无音频可导出";
                return;
            }
            exportCallback?.OnExportWavRequested(audioSource.clip);
            if (statusText) statusText.text = "已请求导出";
        }

        // ---------- 波形预览条 ----------

        /// <summary>用音频采样画一条静态波形（一次性）</summary>
        public void ShowClipWaveform(AudioClip clip)
        {
            if (!_waveTex) return;
            if (clip == null)
            {
                for (int i = 0; i < _wavePixels.Length; i++) _wavePixels[i] = new Color(0, 0, 0, 0.18f);
            }
            else
            {
                float[] data = new float[clip.samples];
                clip.GetData(data, 0);
                int n = _wavePixels.Length;
                for (int i = 0; i < n; i++)
                {
                    int s0 = Mathf.FloorToInt(i * data.Length / (float)n);
                    int s1 = Mathf.FloorToInt((i + 1) * data.Length / (float)n);
                    s1 = Mathf.Clamp(s1, s0 + 1, data.Length);
                    float peak = 0f;
                    for (int j = s0; j < s1; j++) peak = Mathf.Max(peak, Mathf.Abs(data[j]));
                    float a = Mathf.Clamp01(peak * 1.6f);
                    _wavePixels[i] = new Color(waveformColor.r, waveformColor.g, waveformColor.b, a);
                }
            }
            _waveTex.SetPixels(_wavePixels);
            _waveTex.Apply();
        }

        /// <summary>播放中用实时频谱覆盖波形条</summary>
        void Update()
        {
            if (!spectrum || !_waveTex) return;
            if (!audioSource || !audioSource.isPlaying) return;

            var spec = spectrum.Spectrum;
            int n = _wavePixels.Length;
            for (int i = 0; i < n; i++)
            {
                float v = spec.Length > 0 ? spec[Mathf.Clamp(i, 0, spec.Length - 1)] : 0f;
                _wavePixels[i] = new Color(waveformColor.r, waveformColor.g, waveformColor.b, Mathf.Clamp01(v));
            }
            _waveTex.SetPixels(_wavePixels);
            _waveTex.Apply();
        }
    }
}
