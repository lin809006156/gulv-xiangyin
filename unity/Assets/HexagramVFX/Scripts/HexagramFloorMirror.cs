using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace HexagramVFX
{
    /// <summary>
    /// 镜面地面反射
    /// ---------------------------------------------------------------
    /// 移动端不能开 SSR（开销大且部分 GPU 不支持），故用「平面反射相机」：
    /// 一台额外相机镜像渲染到 RenderTexture，地面材质用它做镜面反射。
    ///
    /// 成本控制：
    ///   · 反射只渲染「卦体 + 底座」两层（用 cullingMask 排除 VFX 粒子与 UI），
    ///     粒子不反射（真要反射也得单独处理，成本翻倍）；
    ///   · 反射分辨率 128~256，模糊靠材质里的 mip + 粗糙度；
    ///   · 性能档可整体关闭，只留「假反射」（地面网格的径向光斑）。
    ///
    /// 相机固定居中、不旋转 —— 反射相机也固定，只随主相机位置平移。
    /// </summary>
    [ExecuteAlways]
    public class HexagramFloorMirror : MonoBehaviour
    {
        [Header("反射相机")]
        public Camera targetCamera;          // 主相机
        public Camera reflectionCamera;     // 反射相机（场景里手动放置）
        public LayerMask reflectionLayers = ~0;

        [Header("地面")]
        public Material floorMaterial;       // 使用 HexagramFloorMirror.shader
        public Renderer floorRenderer;

        [Header("画质")]
        [Tooltip("反射渲染分辨率（正方形边长）")]
        public int resolution = 256;
        [Tooltip("每 N 帧更新一次反射（2 = 半速，省一半开销）")]
        [Range(1, 4)] public int updateEveryNFrames = 2;
        public bool enabled_ = true;

        RenderTexture _rt;
        int _frame;

        void OnEnable()
        {
            EnsureTarget();
            ApplyQuality(HexagramQualityProfile.Standard);
        }

        void OnDisable()
        {
            if (_rt)
            {
                if (Application.isPlaying) Destroy(_rt); else DestroyImmediate(_rt);
                _rt = null;
            }
        }

        void EnsureTarget()
        {
            if (_rt && _rt.width == resolution) return;
            if (_rt)
            {
                if (Application.isPlaying) Destroy(_rt); else DestroyImmediate(_rt);
            }
            _rt = new RenderTexture(resolution, resolution, 16, RenderTextureFormat.ARGBHalf)
            {
                name = "HexagramReflection",
                antiAliasing = 1
            };
            _rt.Create();
            if (reflectionCamera)
            {
                reflectionCamera.targetTexture = _rt;
                reflectionCamera.enabled = false;   // 手动渲染
            }
            if (floorMaterial && floorMaterial.HasProperty("_ReflectionTex"))
            {
                floorMaterial.SetTexture("_ReflectionTex", _rt);
            }
        }

        /// <summary>由画质档位统一设置</summary>
        public void ApplyQuality(HexagramQualityProfile p)
        {
            enabled_ = p.floorReflection;
            resolution = Mathf.Max(64, p.reflectionResolution);
            EnsureTarget();
            if (reflectionCamera)
            {
                reflectionCamera.enabled = false;
                reflectionCamera.cullingMask = reflectionLayers;
            }
            if (floorMaterial && floorMaterial.HasProperty("_ReflectStrength"))
            {
                floorMaterial.SetFloat("_ReflectStrength", p.floorReflection ? 1f : 0f);
            }
        }

        void LateUpdate()
        {
            if (!enabled_ || !reflectionCamera || !targetCamera) return;
            _frame++;
            if (updateEveryNFrames > 1 && (_frame % updateEveryNFrames) != 0) return;

            RenderReflection();
        }

        void RenderReflection()
        {
            // 相机固定居中：反射相机只做「镜像 + 上下颠倒」的姿态，
            // 不做任何旋转漫游。
            var camT = reflectionCamera.transform;
            var srcT = targetCamera.transform;
            camT.position = new Vector3(srcT.position.x, -srcT.position.y, srcT.position.z);
            camT.rotation = Quaternion.Euler(-srcT.eulerAngles.x, srcT.eulerAngles.y, 0f);

            // 反射里要把画面上下翻转（镜像）：用一个全局矩阵
            var prev = reflectionCamera.projectionMatrix;
            reflectionCamera.ResetProjectionMatrix();
            reflectionCamera.projectionMatrix = prev * Matrix4x4.Scale(new Vector3(1f, -1f, 1f));
            reflectionCamera.Render();
            reflectionCamera.projectionMatrix = prev;
        }
    }
}
