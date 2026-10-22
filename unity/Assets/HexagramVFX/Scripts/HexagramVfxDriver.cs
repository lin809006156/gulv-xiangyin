using UnityEngine;
using UnityEngine.VFX;

namespace HexagramVFX
{
    /// <summary>
    /// VFX Graph 参数桥
    /// ---------------------------------------------------------------
    /// 把 C# 侧的状态（频段能量、播放阶段、流速、卦序、画质档…）
    /// 写进 VFX Graph 的 Exposed Properties，并发送自定义事件。
    ///
    /// 【重要】属性名必须与 VFX Graph 里「Exposed Properties」面板中的
    /// 名称完全一致，否则不会生效。完整清单见
    /// Assets/HexagramVFX/VFX/VFX-GRAPH-SETUP.md。
    ///
    /// 所有写入都用字符串重载（可读性好）；若追求极致性能，可在初始化时
    /// 用 Shader.PropertyToID 转成 int 缓存（VisualEffect.SetFloat(int,float)）。
    /// </summary>
    [RequireComponent(typeof(VisualEffect))]
    public class HexagramVfxDriver : MonoBehaviour
    {
        public enum Phase
        {
            Intro = 0,   // 音乐渐入：雾气自左右两端浮现，向中心汇聚
            Playing = 1, // 音乐进行中：横向声波穿过卦象
            Outro = 2    // 音乐渐出：粒子衰减消散
        }

        [Header("VFX 资源")]
        [Tooltip("烟雾主 VFX（声波云雾）")]
        public VisualEffect smokeVfx;

        [Tooltip("可选：命中卦爻时的扰动/爆散 VFX")]
        public VisualEffect impactVfx;

        [Header("颜色（线性空间）")]
        [Tooltip("主色：冰蓝")]
        public Color primaryColor = new Color(0.42f, 0.72f, 1.0f, 1f);
        [Tooltip("内层暖金辉光")]
        public Color accentColor = new Color(1.0f, 0.72f, 0.34f, 1f);

        // —— 对外可读的状态（由控制器写入）——
        public Phase Phase3 { get; private set; } = Phase.Intro;
        public float FlowSpeed { get; private set; } = 1f;
        public float Turbulence { get; private set; } = 1f;
        public float Glow { get; private set; } = 1f;
        public float Direction { get; private set; } = 0f;

        VisualEffect _vfx;

        // Exposed property 名称（与 VFX Graph 保持一致）
        public const string P_AudioLevel = "AudioLevel";
        public const string P_Bass = "Bass";
        public const string P_LowMid = "LowMid";
        public const string P_Mid = "Mid";
        public const string P_High = "High";
        public const string P_Beat = "Beat";
        public const string P_FlowSpeed = "FlowSpeed";
        public const string P_Turbulence = "Turbulence";
        public const string P_Glow = "Glow";
        public const string P_Direction = "Direction";
        public const string P_Phase = "Phase";
        public const string P_SpawnRate = "SpawnRate";
        public const string P_MaxParticles = "MaxParticles";
        public const string P_SpectrumTex = "SpectrumTex";
        public const string P_ModelSDF = "ModelSDF";
        public const string P_ModelBounds = "ModelBounds";
        public const string P_ColorPrimary = "ColorPrimary";
        public const string P_ColorAccent = "ColorAccent";
        public const string P_HexIndex = "HexIndex";

        // 事件名（VFX Graph 里用 Event 节点接收）
        public const string E_Spawn = "OnSpawn";
        public const string E_Dissolve = "OnDissolve";
        public const string E_Beat = "OnBeat";
        public const string E_Impact = "OnImpact";

        void Awake()
        {
            if (!smokeVfx) smokeVfx = GetComponent<VisualEffect>();
            _vfx = smokeVfx;
            ApplyColors();
        }

        public void ApplyColors()
        {
            if (!_vfx) return;
            _vfx.SetVector4(P_ColorPrimary, primaryColor);
            _vfx.SetVector4(P_ColorAccent, accentColor);
        }

        /// <summary>设置播放阶段（0 渐入 / 1 进行中 / 2 渐出）</summary>
        public void SetPhase(Phase p)
        {
            Phase3 = p;
            if (!_vfx) return;
            _vfx.SetInt(P_Phase, (int)p);
            if (p == Phase.Intro) _vfx.SendEvent(E_Spawn);
            if (p == Phase.Outro) _vfx.SendEvent(E_Dissolve);
        }

        /// <summary>每帧写入频谱与流动参数</summary>
        public void PushAudio(HexagramAudioSpectrum spec, HexagramQualityProfile q)
        {
            if (!_vfx) return;
            _vfx.SetFloat(P_AudioLevel, spec.Level);
            _vfx.SetFloat(P_Bass, spec.Bass);
            _vfx.SetFloat(P_LowMid, spec.LowMid);
            _vfx.SetFloat(P_Mid, spec.Mid);
            _vfx.SetFloat(P_High, spec.High);
            _vfx.SetFloat(P_Beat, spec.Beat);
            _vfx.SetFloat(P_FlowSpeed, FlowSpeed);
            _vfx.SetFloat(P_Turbulence, Turbulence);
            _vfx.SetFloat(P_Glow, Glow);
            _vfx.SetFloat(P_SpawnRate, q.spawnRate);
            _vfx.SetInt(P_MaxParticles, q.maxParticles);
            if (spec.BeatHit) _vfx.SendEvent(E_Beat);
        }

        /// <summary>设置喷射方向：-1 自左、+1 自右、0 双向（渐入/渐出用双向）</summary>
        public void SetDirection(float d)
        {
            Direction = d;
            if (_vfx) _vfx.SetFloat(P_Direction, d);
        }

        /// <summary>把卦体碰撞用的 SDF 纹理与包围盒交给 VFX</summary>
        public void SetModel(Texture2D sdf, Vector4 bounds)
        {
            if (!_vfx) return;
            _vfx.SetTexture(P_ModelSDF, sdf);
            _vfx.SetVector4(P_ModelBounds, bounds);
        }

        public void SetHexIndex(int index)
        {
            if (_vfx) _vfx.SetInt(P_HexIndex, index);
        }

        public void SetSpectrumTexture(Texture2D tex)
        {
            if (_vfx) _vfx.SetTexture(P_SpectrumTex, tex);
        }

        /// <summary>在卦爻附近触发一次扰动爆散（由碰撞检测或节拍调用）</summary>
        public void PlayImpact(Vector3 position, float strength)
        {
            if (!impactVfx) return;
            impactVfx.transform.position = position;
            impactVfx.SetFloat("Strength", strength);
            impactVfx.SendEvent(E_Impact);
        }
    }
}
