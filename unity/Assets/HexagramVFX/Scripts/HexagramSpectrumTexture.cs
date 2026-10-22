using UnityEngine;

namespace HexagramVFX
{
    /// <summary>
    /// 频谱纹理：把频谱写进一张 64×1 的 RFloat 纹理
    /// ---------------------------------------------------------------
    /// VFX Graph 里无法直接读 C# 数组，故用一张单行纹理做「数据总线」：
    /// 粒子按自身生命周期或位置取样 U 坐标 → 得到该处的频段能量，
    /// 于是不同频率的粒子会有不同的亮度、速度与湍流强度。
    ///
    /// 性能：64 texel 的 Texture2D，每帧 SetPixelData 一次，开销可忽略。
    /// 注意：RFloat 在部分移动端 GPU 上不受支持，故默认用 R8（0..1 精度足够）。
    /// </summary>
    [ExecuteAlways]
    public class HexagramSpectrumTexture : MonoBehaviour
    {
        public const int Resolution = 64;

        [Tooltip("写入的频谱来源；不指定则自动找 HexagramAudioSpectrum")]
        public HexagramAudioSpectrum source;

        Texture2D _tex;
        float[] _pixels;

        public Texture2D Texture => _tex;

        void OnEnable()
        {
            EnsureTexture();
            if (!source) source = FindObjectOfType<HexagramAudioSpectrum>();
        }

        void EnsureTexture()
        {
            if (_tex) return;
            _tex = new Texture2D(Resolution, 1, TextureFormat.R8, false, true)
            {
                name = "HexagramSpectrum",
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                hideFlags = HideFlags.DontSave
            };
            _pixels = new float[Resolution];
        }

        void Update()
        {
            EnsureTexture();
            if (!source) return;

            var spec = source.Spectrum;
            for (int i = 0; i < Resolution; i++)
            {
                // 对数化：人耳对高频更敏感，线性映射会让高频几乎不可见
                float v = i < spec.Length ? spec[i] : 0f;
                _pixels[i] = Mathf.Clamp01(Mathf.Pow(v, 0.75f));
            }
            _tex.SetPixelData(_pixels, 0);
            _tex.Apply(false, false);
        }

        void OnDisable()
        {
            if (_tex)
            {
                if (Application.isPlaying) Destroy(_tex);
                else DestroyImmediate(_tex);
                _tex = null;
            }
        }
    }
}
