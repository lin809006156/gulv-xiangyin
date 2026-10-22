using System;
using UnityEngine;

namespace HexagramVFX
{
    /// <summary>
    /// 性能档位
    /// ---------------------------------------------------------------
    /// 移动端要稳 60fps，粒子数、渲染分辨率、反射与后期都得能降级。
    /// 运行时可切换（设置页里给用户选「性能模式 / 高清模式」），
    /// 也可在低端机首次运行时自动降档。
    ///
    /// 各档的取舍依据见 performance-checklist.md。
    /// </summary>
    [Serializable]
    public class HexagramQualityProfile
    {
        [Tooltip("档位名（显示用）")] public string Label = "标准";
        [Tooltip("VFX 粒子数上限")] public int maxParticles = 4000;
        [Tooltip("每秒生成粒子数")] public float spawnRate = 60f;
        [Tooltip("VFX 渲染缩放（1 = 全分辨率，0.5 = 半分辨率）")] public float vfxRenderScale = 1f;
        [Tooltip("是否开启镜面地面反射")] public bool floorReflection = true;
        [Tooltip("反射渲染分辨率")] public int reflectionResolution = 256;
        [Tooltip("是否开启软粒子（需深度纹理，低端机可关）")] public bool softParticles = true;
        [Tooltip("是否开启辉光（Bloom）")] public bool bloom = true;
        [Tooltip("粒子湍流迭代档位（0 = 关，1 = 低，2 = 中，3 = 高）")] public int turbulenceLevel = 2;
        [Tooltip("是否开启地面网格反射（假反射，便宜）")] public bool fakeGridReflection = true;

        public static HexagramQualityProfile Performance = new HexagramQualityProfile
        {
            Label = "性能",
            maxParticles = 1500,
            spawnRate = 26f,
            vfxRenderScale = 0.5f,
            floorReflection = false,
            reflectionResolution = 128,
            softParticles = false,
            bloom = false,
            turbulenceLevel = 1,
            fakeGridReflection = true
        };

        public static HexagramQualityProfile Standard = new HexagramQualityProfile
        {
            Label = "标准",
            maxParticles = 4000,
            spawnRate = 60f,
            vfxRenderScale = 1f,
            floorReflection = true,
            reflectionResolution = 256,
            softParticles = true,
            bloom = true,
            turbulenceLevel = 2,
            fakeGridReflection = true
        };

        public static HexagramQualityProfile High = new HexagramQualityProfile
        {
            Label = "高清",
            maxParticles = 9000,
            spawnRate = 110f,
            vfxRenderScale = 1f,
            floorReflection = true,
            reflectionResolution = 512,
            softParticles = true,
            bloom = true,
            turbulenceLevel = 3,
            fakeGridReflection = true
        };

        public static HexagramQualityProfile Get(int index)
        {
            switch (index)
            {
                case 0: return Performance;
                case 2: return High;
                default: return Standard;
            }
        }
    }

    /// <summary>
    /// 质量档位管理器：对外只暴露一个档位索引，内部广播变更
    /// </summary>
    public class HexagramQualityManager : MonoBehaviour
    {
        [Tooltip("当前档位：0 性能 / 1 标准 / 2 高清")]
        [Range(0, 2)] public int level = 1;

        [Tooltip("低端机自动降档（按系统内存与 GPU 判断）")]
        public bool autoDowngrade = true;

        public HexagramQualityProfile Profile => HexagramQualityProfile.Get(level);
        public event Action<HexagramQualityProfile> OnChanged;

        void Start()
        {
            if (autoDowngrade && IsLowEndDevice() && level > 0) level = 0;
            Apply();
        }

        public void SetLevel(int l)
        {
            level = Mathf.Clamp(l, 0, 2);
            Apply();
        }

        void Apply()
        {
            OnChanged?.Invoke(Profile);
        }

        /// <summary>
        /// 粗判低端机：内存 < 4GB，或 GPU 明显偏弱。
        /// 真机机型库不好维护，故以内存与 SystemInfo.graphicsDeviceName 粗判，
        /// 另在性能自检里用帧率动态降档兜底（见 HexagramVizController）。
        /// </summary>
        static bool IsLowEndDevice()
        {
            int mem = SystemInfo.systemMemorySize;               // MB
            if (mem > 0 && mem < 4096) return true;
            string gpu = (SystemInfo.graphicsDeviceName ?? "").ToLowerInvariant();
            return gpu.Contains("adreno 3") || gpu.Contains("adreno 4")
                || gpu.Contains("mali-4") || gpu.Contains("mali-t6") || gpu.Contains("powervr sgx");
        }
    }
}
