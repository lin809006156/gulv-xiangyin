using System.Collections.Generic;
using UnityEngine;

namespace HexagramVFX
{
    /// <summary>
    /// 程序化生成六爻卦象模型
    /// ---------------------------------------------------------------
    /// 结构（自下而上 = 初爻在上爻）：
    ///   圆形金属底座（直径 3.2，高 0.12）
    ///   六根厚实长方体爻（厚 0.34、宽 2.6、间距 0.52）
    ///   阳爻 = 一整根；阴爻 = 两截，中间留 0.34 的缝
    /// 材质：古铜 PBR（金属度 1、粗糙度 0.34），边缘由着色器输出暖金自发光。
    ///
    /// 同时生成一张 **模型 SDF 纹理**（R8，模型 XY 平面的有符号距离），
    /// 供 VFX Graph 采样：粒子靠近卦爻时按距离被推开、湍流增强。
    /// 之所以用 SDF 而不是体渲染/光线步进：手机上 SDF 贴图最便宜。
    /// </summary>
    public class HexagramModelBuilder : MonoBehaviour
    {
        [Header("尺寸")]
        public float barWidth = 2.6f;      // 爻长
        public float barHeight = 0.34f;     // 爻厚
        public float barDepth = 0.34f;     // 爻进深
        public float barGap = 0.52f;       // 爻间距
        public float brokenGap = 0.36f;    // 阴爻中间的缝
        public float baseRadius = 1.7f;    // 底座半径
        public float baseHeight = 0.12f;

        [Header("材质")]
        public Material bronzeMaterial;    // 古铜 PBR（含边缘暖金自发光）
        public Material baseMaterial;      // 底座金属

        [Header("动爻高亮")]
        public Color movingLineColor = new Color(0.86f, 0.28f, 0.20f, 1f);
        public bool highlightMovingLine = true;

        [Header("SDF")]
        [Tooltip("SDF 纹理边长（移动端 96~128 足够）")]
        [Range(32, 256)] public int sdfResolution = 128;
        [Tooltip("SDF 覆盖的模型局部范围（XY 半宽）")]
        public float sdfExtent = 2.0f;

        [Header("当前卦")]
        [Tooltip("卦序 1..64")] [Range(1, 64)] public int hexNumber = 11;
        [Tooltip("动爻（1..6，0 = 无）")] [Range(0, 6)] public int movingLine = 0;

        /// <summary>卦体根节点（VFX 的 ModelSDF 包围盒与之对齐）</summary>
        public Transform ModelRoot { get; private set; }
        /// <summary>模型 SDF 纹理</summary>
        public Texture2D SdfTexture { get; private set; }
        /// <summary>模型在 VFX 世界空间的包围盒（xyz = 中心，w = 半径）</summary>
        public Vector4 ModelBounds { get; private set; }

        readonly List<GameObject> _parts = new List<GameObject>();
        readonly List<BoxCollider> _colliders = new List<BoxCollider>();
        Texture2D _sdf;
        float[] _sdfPixels;
        // 局部空间的爻盒（用于算 SDF）：xMin,xMax,yMin,yMax,zMin,zMax
        readonly List<float[]> _boxes = new List<float[]>();

        void Awake()
        {
            Build();
        }

        /// <summary>按当前卦序重建模型</summary>
        public void Build()
        {
            EnsureSdf();
            ClearParts();

            var info = HexagramData.Get(hexNumber);

            // 底座
            var baseGo = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            baseGo.name = "Base";
            baseGo.transform.SetParent(transform, false);
            baseGo.transform.localPosition = new Vector3(0f, -baseHeight * 0.5f, 0f);
            baseGo.transform.localScale = new Vector3(baseRadius * 2f, baseHeight * 0.5f, baseRadius * 2f);
            var bc = baseGo.GetComponent<Collider>();
            if (bc) Destroy(bc);
            if (baseMaterial) baseGo.GetComponent<Renderer>().sharedMaterial = baseMaterial;
            _parts.Add(baseGo);

            // 六爻（自下而上）
            ModelRoot = new GameObject("HexagramRoot").transform;
            ModelRoot.SetParent(transform, false);
            // 让模型中心大致在原点：六爻居中，底座在下
            float totalH = 5 * barGap;
            for (int i = 0; i < 6; i++)
            {
                float y = -totalH * 0.5f + i * barGap;   // i=0 是初爻（最下）
                bool isYang = info.Lines[i] == 1;
                bool isMoving = highlightMovingLine && movingLine == i + 1;
                if (isYang)
                {
                    AddBar(i, y, -barWidth * 0.5f, barWidth * 0.5f, isMoving);
                }
                else
                {
                    float half = (barWidth - brokenGap) * 0.5f;
                    AddBar(i, y, -barWidth * 0.5f, -barWidth * 0.5f + half, isMoving);
                    AddBar(i, y, barWidth * 0.5f - half, barWidth * 0.5f, isMoving);
                }
            }

            // 模型根节点抬到底座之上
            ModelRoot.localPosition = new Vector3(0f, baseHeight + totalH * 0.5f, 0f);

            BuildSdf();
            ComputeBounds();
        }

        void AddBar(int lineIndex, float y, float x0, float x1, bool isMoving)
        {
            float cx = (x0 + x1) * 0.5f;
            float len = x1 - x0;
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = $"Yao{lineIndex + 1}_{isMoving ? "moving" : "fixed"}";
            go.transform.SetParent(ModelRoot, false);
            go.transform.localPosition = new Vector3(cx, y, 0f);
            go.transform.localScale = new Vector3(len, barHeight, barDepth);
            var col = go.GetComponent<Collider>();
            if (col) Destroy(col);
            var mr = go.GetComponent<Renderer>();
            if (bronzeMaterial)
            {
                if (isMoving)
                {
                    // 动爻用独立材质实例，便于高亮
                    var m = new Material(bronzeMaterial) { name = bronzeMaterial.name + "_Moving" };
                    m.SetColor("_BaseColor", movingLineColor);
                    mr.sharedMaterial = m;
                }
                else mr.sharedMaterial = bronzeMaterial;
            }
            _parts.Add(go);

            // 记下盒体，供 SDF 使用（模型根节点的局部坐标）
            _boxes.Add(new[] { cx - len * 0.5f, cx + len * 0.5f, y - barHeight * 0.5f, y + barHeight * 0.5f });
        }

        void ClearParts()
        {
            foreach (var p in _parts)
            {
                if (!p) continue;
                if (Application.isPlaying) Destroy(p);
                else DestroyImmediate(p);
            }
            _parts.Clear();
            _boxes.Clear();
            if (ModelRoot)
            {
                if (Application.isPlaying) Destroy(ModelRoot.gameObject);
                else DestroyImmediate(ModelRoot.gameObject);
                ModelRoot = null;
            }
        }

        void EnsureSdf()
        {
            if (_sdf && _sdf.width == sdfResolution) { SdfTexture = _sdf; return; }
            if (_sdf)
            {
                if (Application.isPlaying) Destroy(_sdf); else DestroyImmediate(_sdf);
            }
            _sdf = new Texture2D(sdfResolution, sdfResolution, TextureFormat.R8, false, true)
            {
                name = "HexagramModelSDF",
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                hideFlags = HideFlags.DontSave
            };
            _sdfPixels = new float[sdfResolution * sdfResolution];
            SdfTexture = _sdf;
        }

        /// <summary>
        /// 逐纹素求模型 XY 平面的有符号距离（负=在模型内）
        /// 爻盒是轴对齐的，用盒 SDF 精确求解，比体渲染便宜得多。
        /// </summary>
        void BuildSdf()
        {
            int res = sdfResolution;
            float ext = sdfExtent;
            for (int y = 0; y < res; y++)
            {
                for (int x = 0; x < res; x++)
                {
                    // 纹素 → 模型根节点的局部 XY
                    float lx = (x + 0.5f) / res * 2f * ext - ext;
                    float ly = (y + 0.5f) / res * 2f * ext - ext;
                    float d = 1e9f;
                    foreach (var b in _boxes)
                    {
                        float dx = Mathf.Max(b[0] - lx, lx - b[1]);
                        float dy = Mathf.Max(b[2] - ly, ly - b[3]);
                        float outside = new Vector2(Mathf.Max(dx, 0f), Mathf.Max(dy, 0f)).magnitude;
                        float inside = Mathf.Min(Mathf.Max(dx, dy), 0f);
                        d = Mathf.Min(d, outside + inside);
                    }
                    // 归一化到 0..1：0 = 贴在模型表面，1 = 远离
                    float v = Mathf.Clamp01(d / (ext * 0.5f));
                    _sdfPixels[y * res + x] = v;
                }
            }
            _sdf.SetPixelData(_sdfPixels, 0);
            _sdf.Apply(false, false);
        }

        void ComputeBounds()
        {
            if (!ModelRoot) return;
            var r = new Bounds(ModelRoot.position + Vector3.up * 0f, Vector3.zero);
            bool first = true;
            foreach (var p in _parts)
            {
                if (!p) continue;
                if (first) { r = p.GetComponent<Renderer>().bounds; first = false; }
                else r.Encapsulate(p.GetComponent<Renderer>().bounds);
            }
            ModelBounds = new Vector4(r.center.x, r.center.y, r.center.z, r.extents.magnitude);
        }

        /// <summary>切换卦象（1..64），并可指定动爻</summary>
        public void SetHexagram(int number, int moving = 0)
        {
            hexNumber = Mathf.Clamp(number, 1, 64);
            movingLine = Mathf.Clamp(moving, 0, 6);
            Build();
        }

        void OnDisable()
        {
            ClearParts();
        }
    }
}
