using System;
using UnityEngine;

namespace HexagramVFX
{
    /// <summary>
    /// 与宿主（网页 / Capacitor App）的桥
    /// ---------------------------------------------------------------
    /// 现有 App 是 Web + Capacitor，音频由 Web Audio 播放。若要接 Unity 可视化，
    /// 推荐路径是 **Unity 独立播放音频**（把该轮音乐渲染成 WAV 交给 Unity），
    /// 这样 Unity 的 AudioListener 能直接拿到频谱，不必跨语言逐帧传数据
    /// （那会杀掉移动端的帧率）。
    ///
    /// 本类提供双向接口：
    ///   JS → Unity：SetHexagram / PlayWav / Stop / SetLoop / SetQuality / RequestExport
    ///   Unity → JS：OnReady / OnStateChanged / OnProgress / OnExportReady
    ///
    /// 在 WebGL 里可用 Application.ExternalCall；在 Android/iOS 的
    /// Unity-as-a-Library 里，用宿主工程注入的委托（见 SetHostCallbacks）。
    /// </summary>
    public class HexagramBridge : MonoBehaviour
    {
        public enum PlayState { Idle, Intro, Playing, Outro }

        [Header("引用")]
        public HexagramVizController viz;
        public HexagramPlayerUI player;

        [Header("WebGL")]
        [Tooltip("WebGL 里 Unity → JS 的函数名（挂在 window 上）")]
        public string jsCallbackPrefix = "HexagramVFX";

        // —— 宿主注入的委托（Android / iOS 用）——
        public Action<string, string> HostNotify;   // (事件名, JSON 参数)

        // 收到的音频（由宿主调用 LoadWav 塞进来）
        AudioClip _clip;

        void Awake()
        {
            if (viz)
            {
                // 播放状态与可视化三段保持一致
                viz.player = player;
            }
        }

        // ---------- JS → Unity ----------

        /// <summary>切换卦象：1..64</summary>
        public void SetHexagram(int number, int moving = 0)
        {
            viz?.SetHexagram(number, moving);
            Notify("hexagram", $"{{\"number\":{number}}}");
        }

        /// <summary>播放一段 WAV（字节数组，44 头 PCM）</summary>
        public void PlayWav(byte[] wavBytes, bool loop = false)
        {
            if (!player || !player.audioSource) return;
            _clip = WavUtility.Load(wavBytes);
            player.audioSource.clip = _clip;
            player.audioSource.loop = loop;
            player.audioSource.Play();
            player.SetPlaying(true);
            player.ShowClipWaveform(_clip);
            viz?.OnPlaybackStarted();
            Notify("state", "{\"state\":\"playing\"}");
        }

        /// <summary>停止播放（进入渐出消散）</summary>
        public void Stop()
        {
            player?.Stop();
            viz?.OnPlaybackStopped();
            Notify("state", "{\"state\":\"idle\"}");
        }

        /// <summary>循环开关</summary>
        public void SetLoop(bool loop)
        {
            player?.SetLoop(loop);
            if (player && player.audioSource) player.audioSource.loop = loop;
        }

        /// <summary>画质档位：0 性能 / 1 标准 / 2 高清</summary>
        public void SetQuality(int level)
        {
            var q = FindObjectOfType<HexagramQualityManager>();
            if (q) q.SetLevel(level);
        }

        /// <summary>请求导出 WAV（宿主自行落地）</summary>
        public void RequestExport()
        {
            player?.RequestExport();
        }

        // ---------- Unity → JS ----------

        void Notify(string evt, string json)
        {
            if (HostNotify != null) { HostNotify(evt, json); return; }
            #if UNITY_WEBGL && !UNITY_EDITOR
            var js = $"window.{jsCallbackPrefix}__{evt} && window.{jsCallbackPrefix}__{evt}('{json}')";
            Application.ExternalEval(js);
            #endif
        }

        void Start()
        {
            Notify("ready", "{\"ok\":true}");
        }

        void Update()
        {
            if (player && player.audioSource)
            {
                // 播完（不循环）时进入渐出
                if (!player.audioSource.isPlaying && viz && viz.CurrentStage == HexagramVizController.Stage.Playing)
                {
                    viz.OnPlaybackStopped();
                    Notify("state", "{\"state\":\"idle\"}");
                }
            }
        }
    }

    /// <summary>
    /// 极简 WAV 读取（44 头 PCM 16bit）
    /// ---------------------------------------------------------------
    /// 只为「宿主把渲染好的音乐交给 Unity 播放」这一件事服务，
    /// 故不追求完备：支持 PCM 16bit 的单声道/立体声。
    /// </summary>
    public static class WavUtility
    {
        public static AudioClip Load(byte[] bytes)
        {
            if (bytes == null || bytes.Length < 44) return null;

            int channels = BitConverter.ToInt16(bytes, 22);
            int sampleRate = BitConverter.ToInt32(bytes, 24);
            int bits = BitConverter.ToInt16(bytes, 34);
            if (bits != 16 || (channels != 1 && channels != 2)) return null;

            int dataOffset = 44;
            int dataSize = bytes.Length - dataOffset;
            int sampleCount = dataSize / 2 / channels;

            var clip = AudioClip.Create("HexagramClip", sampleCount, channels, sampleRate, false);
            var samples = new float[sampleCount * channels];
            for (int i = 0; i < samples.Length; i++)
            {
                short v = BitConverter.ToInt16(bytes, dataOffset + i * 2);
                samples[i] = v / 32768f;
            }
            clip.SetData(samples, 0);
            return clip;
        }
    }
}
