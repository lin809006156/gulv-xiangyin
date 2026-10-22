# VFX Graph 配置说明（声波云雾）

> `.vfx` 是 Unity 序列化的二进制资产，无法用文本直接生成。
> 本文件按节点写清整张图的搭法：**照着一步步点即可得到与 C# 对接的图**。
> 节点名以 **VFX Graph 14.x（Unity 2022.3 LTS）** 为准，新版本可能略有出入。

---

## 0. 先决条件

| 项 | 设置 |
| ---- | ---- |
| Unity | 2022.3 LTS 或 2023.x（内置 VFX Graph 14） |
| 渲染管线 | URP（Forward，移动端用 **Forward**，不要 Forward+） |
| VFX 资源 | `Assets/HexagramVFX/VFX/Smoke.vfx`（新建，见下） |
| 附加纹理 | 无需贴图；噪声用 VFX 内置 Curl Noise |

---

## 1. System 设置

新建 VFX Graph（右键 → Create → Visual Effects Graph），命名 `Smoke`。

**Inspector → System**

| 属性 | 值 | 说明 |
| ---- | ---- | ---- |
| Fixed Bounds | 手动：`X[-14,14] Y[-6,6] Z[-8,8]` | **必须手填**！不填会被剔除，粒子飞出就消失 |
| Fixed Bounds Mode | Fixed Bounds | |
| Auto Bounds | 关 | |
| Capacity | 4000 | 与 `HexagramQualityProfile.maxParticles` 对应，性能档降到 1500 |
| Update Mode | GPU（默认） | 移动端必须 GPU；CPU 粒子在低端机上会掉帧 |
| Fixed Time Step | 勾选 | 固定步长，粒子运动更稳 |

**System → Exposed Properties（必须与 C# 名字完全一致）**

| 类型 | 名称 | 默认值 | 用途 |
| ---- | ---- | ------ | ---- |
| float | `AudioLevel` | 0 | 总能量 0..1 |
| float | `Bass` | 0 | 低频：整体流动、生成速度、辉光 |
| float | `LowMid` | 0 | |
| float | `Mid` | 0 | |
| float | `High` | 0 | 高频：细碎湍流 |
| float | `Beat` | 0 | 节拍脉冲 |
| float | `FlowSpeed` | 1 | 整体流速倍率 |
| float | `Turbulence` | 1 | 湍流强度倍率 |
| float | `Glow` | 1 | 辉光倍率 |
| float | `Direction` | 0 | -1 自左 / +1 自右 / 0 双向 |
| int | `Phase` | 0 | 0 渐入 / 1 进行中 / 2 渐出 |
| float | `SpawnRate` | 60 | 每秒生成数 |
| int | `MaxParticles` | 4000 | 容量（运行时会覆盖 System 的 Capacity） |
| Texture2D | `SpectrumTex` | 无 | 64×1 频谱纹理 |
| Texture2D | `ModelSDF` | 无 | 卦体 SDF（XY 平面） |
| Vector4 | `ModelBounds` | (0,0,0,1) | 模型包围盒（xyz 中心、w 半径） |
| Vector4 | `ColorPrimary` | 冰蓝 | 主色 |
| Vector4 | `ColorAccent` | 暖金 | 内层辉光 |
| int | `HexIndex` | 1 | 卦序（可用于色相/纹理微差） |

**System → Custom Events（事件名须与 C# 一致）**

`OnSpawn`、`OnDissolve`、`OnBeat`、`OnImpact`

---

## 2. 图结构总览

```
[ Spawn ]──►[ Initialize ]──►[ Update ]──►[ Output Particle ]──►[ Output Particle Quad ]
    ▲                          │
    └── SpawnRate ←── AudioLevel/Bass
```

---

## 3. Spawn 块

| 节点 | 设置 |
| ---- | ---- |
| Spawn（Rate） | Rate 接到 `SpawnRate`；**不要**用 Constant Rate（否则音量不起作用） |
| 条件（可选） | 若 Phase = 2（渐出）则停止生成：用 `Phase == 2` 布尔接到 Rate 的 `Enabled` |

**出生位置（Shape 块）**

- 用 **Box Shape**：
  - Type = Box
  - Size = (0.6, 3.2, 0.6)
  - Position 由 `Direction` 决定：把 `Direction` 映射成 X 位置
    - `Direction > 0` → X = -12（左侧出生，向右流）
    - `Direction < 0` → X = +12（右侧出生，向左流）
    - `Direction == 0`（渐入/渐出）→ **两边都要有**：用
      `random01 < 0.5` 选边：Position.X = `lerp(-12, 12, step(0.5, random01))`
  - Y 范围 = -2.4 ~ +2.4（贴着卦象高度）
  - Z 范围 = -1.2 ~ +1.2

> 渐入阶段的「向中心汇聚」由 Update 里的 `Converge` 分量实现（见 §4）。

---

## 4. Initialize 块

| 节点 | 设置 |
| ---- | ---- |
| Initialize Particle | 常规 |
| Lifetime | ` Lifetime = 3.2 ~ 5.0`（秒） |
| Velocity（Initialize） | 初速沿 X：`Velocity = (sign, 0, 0) * (0.4 + Bass * 0.8)` |
| Size（Initialize） | `Size = 0.6 ~ 1.4`（随 AudioLevel 略放大） |
| Mass / Drag | Mass = 1，Drag = 0.6（让粒子有惯性感） |

**颜色**：Initialize 里设 `Color = ColorPrimary`（线性色，注意 VFX 里颜色是 HDR 值，
可给到 1.6 让加色叠加后更亮）。

---

## 5. Update 块（核心）

### 5.1 整体流动

用 **Position (Update)** 节点，`Position += Velocity * dt` 的等价写法：

```
VelocityOverLifetime:
  Velocity = (dirX, 0, 0) * FlowSpeed * (0.8 + Bass * 1.6)
```

- `dirX`：`Direction == 0` 时取 `sign(particleId 的奇偶)` 或直接 `1`（渐入阶段另有汇聚逻辑）；
  `Direction != 0` 时取 `Direction`。
- 低频控制整体流动 ⇒ 乘 `Bass`。

### 5.2 渐入：向中心汇聚

在 `Phase == 0` 时叠加一个朝中心的分量：

```
Converge = normalize(vec3(-spawnX, 0, 0)) * (1.0 - distanceToCenter/12) * 1.6 * (0.4 + Bass)
```

实现方式：在 Velocity 节点上用 **Blend Vector**：
- A = 水平流速（上节）
- B = 朝中心的速度
- 用 `Phase == 0` 选 A/B（**Conditional** 节点，或 Blend 权重 `1 - step(0.5, Phase)`）

渐出（Phase == 2）时把水平分量翻向两侧：用 `Direction` 保持不变即可，
关键是 **Lifetime 到期自然消失** + `Glow` 衰减。

### 5.3 湍流（Curl Noise）

```
Curl Noise:
  Type = Curl
  Scale = 1.4
  Intensity = Turbulence * (0.6 + High * 1.4)      // 高频 → 细碎湍流
  Frequency = 0.6
  Domain = 3D
```

- 把 Curl Noise 的输出接到 **Velocity (Update)** 的 add 分量。
- `Turbulence` 来自 C#：音量越大越强，高频再叠加细碎感。
- **性能**：Curl Noise 是 VFX 里较贵的节点；性能档把 `TurbulenceLevel` 降到 1
  （即把 Curl 的 Intensity 减半、Scale 降低），或直接用普通 Noise 替代。

### 5.4 碰到卦爻的扰动、散开（不用体渲染）

用 **SDF 贴图**做碰撞，比体渲染/光线步进便宜一个数量级：

```
UV = (positionWS.xz - (ModelBounds.xz - 2.0)) / 4.0     // 映射到 SDF 覆盖范围
SDF = Sample Texture2D(ModelSDF, UV)                   // 0 = 贴在表面, 1 = 远离
Mask = 1 - step(0.12, SDF)                              // 进入「碰撞带」
Push = normalize(positionWS - modelCenter) * Mask * (1.2 + AudioLevel * 2.0) * dt
```

- 把 `Push` 加到 Velocity 上 ⇒ 粒子被卦爻推开（**散开**）。
- 同时把 `Turbulence` 局部放大：`TurbLocal = Turbulence * (1 + Mask * 2.5)` ⇒ 撞上后更乱（**湍流**）。
- 再触发一次 `OnImpact` 事件给爆散 VFX（可选）。

> 若要更精确的碰撞，可把 SDF 改成 3D（体纹理）——但那正是手机要避免的路线。
> 2D SDF + 立方体近似（爻条都是轴对齐长方体）在视觉上足够。

### 5.5 频谱驱动的逐粒子差异

让不同粒子取不同频段（否则所有粒子亮度一样，像一团棉花）：

```
SpecUV = (age / lifetime)          // 或用 positionWS.x 归一
Spec = Sample Texture2D(SpectrumTex, float2(SpecUV, 0.5))
Color *= lerp(1.0, 1.0 + Spec * 1.8, 0.8) * Glow
Speed *= (0.85 + Spec * 0.6)
Size  *= (0.8 + Spec * 0.5)
```

### 5.6 颜色与辉光

```
Color = lerp(ColorPrimary, ColorAccent, saturate(Spec * 1.2))
Color *= Glow * (0.7 + Bass * 0.9)         // 低频 → 辉光亮度
Color *= (1 + Beat * 0.6)                  // 节拍时闪一下
```

> VFX 的颜色值可以 > 1（HDR），配合加色叠加会自然过曝成白芯，正是「冰蓝里透暖金」的效果。

---

## 6. Output 块

### 6.1 Output Particle（带拉伸的软团）

| 节点 | 设置 |
| ---- | ---- |
| Output Particle | 常规 |
| Set Color | 上面算出的 Color |
| Set Size | `Size * (0.6 + 0.8 * (1 - age/lifetime))`（出生大、消散时缩小） |
| Set Velocity | 已由 Update 写入 |
| 旋转 | 每颗粒子按 ID 派生初相位，随时间缓慢自转（`Rotation += dt * 0.4`） |

### 6.2 Output Particle Quad（烟团）

| 节点 | 设置 |
| ---- | ---- |
| Quad | Size = 上面的 Size；Orientation = Camera Facing + 绕视线自转 |
| Color | 同上 |
| Texture | 可空（纯渐变团）；有贴图时用软边 alpha |
| Soft Particle | **勾选**（URP 需在 URP Asset 勾 Depth Texture；Performance 档可关） |
| Blend Mode | **Additive**（加色叠加透明） |
| Cast Shadows | 关（移动端省一半开销） |
| Receive Shadows | 关 |

> 若 VFX Graph 版本没有内置 Soft Particle 开关，可用本项目的
> `Assets/HexagramVFX/Shaders/HexagramSmokeAdditive.shader` 作为自定义输出。

### 6.3 可选：撞爻爆散 VFX（Impact）

新建 `Impact.vfx`：短生命（0.35s）、球形 Spawn、Size 曲线先扩后收、
Additive、颜色取 `ColorAccent`。由 C# 的 `HexagramVfxDriver.PlayImpact()` 触发。

---

## 7. 三段动画的落地位置（速查）

| 阶段 | Phase | Direction | 生成 | 速度 | 辉光 | 粒子行为 |
| ---- | ----- | --------- | ---- | ---- | ---- | ---- |
| 渐入 | 0 | 0（双向） | `SpawnRate * (0.35 + Bass*1.2)` | 慢 | 低频主导 | 自两端浮现、**向中心汇聚** |
| 进行中 | 1 | +1（左→右） | `SpawnRate` | 音量越大越快 | 音量越大越亮 | 横向穿过卦象，撞爻**扰动/湍流/散开** |
| 渐出 | 2 | 0 | 0（停止生成） | 变慢 | 衰减 | 寿命到期**消散**，向两侧飘走 |

> C# 侧（`HexagramVizController`）已经把这些算好并写进 Exposed Properties，
> 图里只要照上表接即可，**不需要在图里写复杂的状态机**。

---

## 8. 移动端性能要点

1. **Capacity 别开大**：性能档 1500 / 标准 4000 / 高清 9000。
2. **Curl Noise 是最贵的一环**：性能档把 Scale 降到 0.8、Intensity 减半，
   或用普通 Noise + 旋转代替。
3. **不用体渲染**：碰撞靠 SDF 贴图（已按 XY 平面烘一张 128² 的 R8）。
4. **加色叠加 + 不写深度 + 不投影**是省填充率的关键。
5. **Bounds 要手填**，否则 Unity 每帧重算包围盒（很贵）。
6. 粒子贴图若是软边，mipmap 要开（远处不会闪）。
7. 建议 **VFX 渲染分辨率**：性能档用 URP Render Scale 0.75 左右；
   VFX Graph 本身没有独立的分辨率设置，靠 URP 的 Render Scale 整体降。

---

## 9. 自检清单

- [ ] 粒子在 Bounds 外会被剔除？→ Bounds 已手填
- [ ] 声音大时流速明显变快？→ `FlowSpeed` 链路通
- [ ] 高频强时更乱？→ `Turbulence` 含 `High` 系数
- [ ] 粒子撞到爻条会被推开并变乱？→ SDF 采样与 Push 向量
- [ ] 冰蓝里有暖金？→ `ColorAccent` 按 Spec 混入
- [ ] 停止播放后雾会散掉？→ `Phase=2` + 停止生成 + Lifetime 到期
- [ ] 性能档明显更流畅？→ Capacity / Curl 强度已降
