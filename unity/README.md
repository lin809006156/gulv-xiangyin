# 学易心音 · Unity 可视化模块（HexagramVFX）

面向移动端（Android / iOS）的**音频响应式易经卦象音乐可视化**模块：
Unity URP + VFX Graph，深色极简科技展厅、镜面地面、六爻古铜卦象、
由音频频谱驱动的体积云雾粒子。

> 本目录是**源码与配置说明**。`.vfx` 是 Unity 序列化的二进制资产，
> 无法用文本生成，故以 [VFX-GRAPH-SETUP.md](Assets/HexagramVFX/VFX/VFX-GRAPH-SETUP.md)
> 逐节点写清搭法（照着点一遍即可）。

---

## 一、目录

```
unity/
├── README.md                     本文件
├── INTEGRATION.md                嵌入现有 App（Capacitor / Android / iOS）方案
├── performance-checklist.md      真机 60fps 验收清单
├── ProjectSettings-notes.md      Unity 工程与 URP 关键设置
└── Assets/HexagramVFX/
    ├── Scripts/
    │   ├── HexagramData.cs               64 卦数据（由 scripts/gen-unity-hexagrams.js 生成，与三端同源）
    │   ├── HexagramAudioSpectrum.cs      频谱分析（频段/包络/节拍）
    │   ├── HexagramSpectrumTexture.cs    频谱 → 64×1 R8 纹理（VFX 采样用）
    │   ├── HexagramVfxDriver.cs          VFX Graph 参数桥（Exposed Properties + 事件）
    │   ├── HexagramModelBuilder.cs       程序化六爻模型 + 底座 + 模型 SDF
    │   ├── HexagramVizController.cs      三段动画状态机 + 帧率兜底降档
    │   ├── HexagramFloorMirror.cs        平面反射（镜面地面）
    │   ├── HexagramPlayerUI.cs           播放/循环/导出回调/波形预览条
    │   ├── HexagramQualityProfile.cs     性能档位（性能/标准/高清）
    │   └── HexagramBridge.cs             与宿主（网页/Capacitor）的双向桥
    ├── Shaders/
    │   ├── HexagramBronze.shader         古铜 PBR + 边缘暖金自发光
    │   ├── HexagramFloorMirror.shader    镜面地面
    │   └── HexagramSmokeAdditive.shader  加色柔边烟雾（VFX 自定义输出备用）
    └── VFX/
        └── VFX-GRAPH-SETUP.md             VFX Graph 逐节点配置说明
```

## 二、环境要求

| 项 | 要求 |
| ---- | ---- |
| Unity | 2022.3 LTS（内置 VFX Graph 14.x） |
| 渲染管线 | URP；移动端用 **Forward**（不要 Forward+） |
| 包 | `com.unity.render-pipelines.universal`（随 URP 模板自带）、`com.unity.visualeffectgraph`（随编辑器自带） |
| 目标 | Android 8.0+ / iOS 13+；**IL2CPP** + ARM64 |

## 三、场景搭建（10 分钟）

1. 新建 URP 项目（3D），把 `Assets/HexagramVFX` 整体拷入。
2. 场景里建一个空物体 `HexagramVFX`，挂上：
   `HexagramVizController`、`HexagramVfxDriver`、`HexagramModelBuilder`、
   `HexagramAudioSpectrum`、`HexagramQualityManager`、`HexagramSpectrumTexture`、
   `HexagramPlayerUI`、`HexagramBridge`、`HexagramFloorMirror`。
3. 建地面：Plane，尺寸 40×40，材质用 `HexagramVFX/FloorMirror`。
4. 建反射相机：Camera，置于原点、看向 +Z，**Clear Flags = Color**（黑），
   把 `HexagramFloorMirror.reflectionCamera` 指到它。
5. 建主相机：固定在 (0, 1.6, -9)，看向 (0, 1.4, 0)，**不做任何漫游**。
6. 灯光：一盏 Directional（弱）+ 4~6 盏 Point/Spot 当「天花板长条冷白筒灯」
   （Spot，角度 30~40，强度低，冷白色 6500K）。
7. 新建 VFX Graph，按 [VFX-GRAPH-SETUP.md](Assets/HexagramVFX/VFX/VFX-GRAPH-SETUP.md) 搭好，
   赋给 `HexagramVfxDriver.smokeVfx`。
8. 材质：`HexagramVFX/Bronze`（古铜）给爻条，`HexagramVFX/FloorMirror` 给地面。
9. 卦象数据表由 `node scripts/gen-unity-hexagrams.js` 生成（已在仓库中）。

## 四、对外接口（宿主工程用）

```csharp
// 换卦
viz.SetHexagram(11, moving: 1);

// 播放一段音乐（宿主渲染好的 WAV 字节）
bridge.PlayWav(wavBytes, loop: false);

// 停止（进入渐出消散）
bridge.Stop();

// 画质档：0 性能 / 1 标准 / 2 高清
bridge.SetQuality(1);

// 导出 WAV（预留回调，不在 Unity 内实现）
public class MyExporter : HexagramPlayerUI.IExportWavCallback {
    public void OnExportWavRequested(AudioClip clip) { /* 交给宿主导出 */ }
}
```

## 五、与现有 App 的关系（重要）

现有 App 是 **Web + Capacitor（Android）+ 小程序**，音频由 Web Audio 播放、
波形图由 Canvas 绘制。本模块是**可选的增强路径**，不替换现有实现：

- 现状（Canvas 波形图）：零依赖、三端同源、已在真机验证；
- 本模块（Unity）：写实渲染、粒子云雾，代价是要引入 Unity 运行时
  （Android 约 +25MB 包体，iOS 需嵌 UnityFramework）。

两条路可以共存：设置里加一个「波形图：Canvas / Unity」开关，
低配机走 Canvas，高配机走 Unity。**接入方案见 [INTEGRATION.md](INTEGRATION.md)。**

## 六、已交付 / 需在编辑器里完成

| 交付物 | 状态 |
| ------ | ---- |
| 全部 C# 脚本（11 个） | ✅ 已给出 |
| 3 个 URP 着色器 | ✅ 已给出 |
| VFX Graph 搭法说明（逐节点） | ✅ 已给出（`.vfx` 需在编辑器里按说明搭） |
| 64 卦数据表 | ✅ 已给出（与三端同源，可重新生成） |
| 场景 / 材质 / 灯光 | ⚠️ 需在编辑器里按第三节搭 |
| 真机 60fps | ⚠️ 需在真机上按 [performance-checklist.md](performance-checklist.md) 验收 |

> 本机没有 Unity 环境，故这些脚本**未经编译与运行验证**；
> 首次接入时若有 API 差异（尤其 VFX Graph 的节点名），以实际版本为准。
