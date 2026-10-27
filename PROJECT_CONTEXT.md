# 古律象音 · 项目上下文（新会话速读）

> 给接手的 AI 会话/开发者用。读完这一份即可开工，不必重读全仓库。
> 事实核对于 2026-10-27（v1.4.0）。若与代码冲突，**以代码为准**，并修正本文件。

---

## 一、项目是什么

观身边之物起卦，为每一卦生成一段心音。以《周易》卦象与古代律吕文化为灵感，
把「起卦」与「听音」合成一次体验。

**定位**：卦象心境音乐。传统文化与艺术创作。
**严禁出现**：转运 / 改运 / 预测 / 占卜断事。五音配脏腑是古代音律理论，
**不宣称任何疗效**。

| 形态 | 目录 | 状态 | 备注 |
| ---- | ---- | ---- | ---- |
| PWA 网页版 | `web/` | 完整可用 | 当前开发重心 |
| Android APP | `android/` | 完整可用 | Capacitor 套壳，`web/` 即其内容 |
| 微信小程序 | `miniprogram/` | 完整可用 | AppID `wxc98a73689cb1ca7a` |
| Unity | —— | **已废弃** | v1.4.0 已从仓库移除 |

仓库：<https://github.com/lin809006156/gulv-xiangyin>（main 分支）

---

## 二、目录结构与「改一端不牵动另一端」

```
core/                       唯一真相源（平台无关）
  backend.js                播放后端契约 + 空后端（Node 用）
  player.js                 播放引擎：状态机/循环/编曲编排（无平台代码）
  data.js classics.js       卦象 / 文献依据
  hexagram.js hexagram-texts.js   起卦 / 六十四卦详解
  music.js render.js        作曲 / 合成（音色物理参数在 render.js 的 VOICE_SPECS）
  viz-stage.js taiji.js     波形台 / 太极图（纯 Canvas 2D，两端共用）
  recognize.js              物象归一
web/
  js/audio-backend-web.js   ★ 网页端专属后端（Web Audio）
  js/app.js js/learn.js js/render-worker.js
miniprogram/
  utils/audio-backend-mini.js  ★ 小程序端专属后端（InnerAudioContext）
  pages/{index,music,learn,detail,calendar}
  templates/miniplayer.wxml
android/                    Capacitor 壳工程
scripts/                    同步、校验、端到端测试、构建
brand/                      图标源图（不进代码包）
```

**★ 改动影响对照**（最重要的一条）：

| 改哪里 | 影响范围 |
| ------ | -------- |
| `core/`（除 player 外） | 两端同时生效 —— 共享逻辑，本应如此 |
| `core/player.js` | 两端同时生效 —— 引擎层 |
| `web/js/audio-backend-web.js` | **只影响网页端** |
| `miniprogram/utils/audio-backend-mini.js` | **只影响小程序端** |
| `web/js/app.js` `web/css` `web/index.html` | 只影响网页端 |
| `miniprogram/pages/*` `miniprogram/utils/*` | 只影响小程序端 |

> v1.4.0 之前，`core/player.js` 混着 20 处 `IS_MINIPROGRAM` 分支，
> 改小程序必然牵动网页端。现已拆开，并加了 `npm run verify:layering` 自动看住。

---

## 三、为什么必须分三端（别再合并回去）

已用**微信官方文档**查证，小程序 `WebAudioContext` 相对网页端 Web Audio 缺失：

| 能力 | 网页端 | 小程序 | 后果 |
| ---- | ------ | ------ | ---- |
| `createConvolver`（混响） | 有 | **无** | 小程序端用延迟反馈网络模拟 |
| `createStereoPanner`（声像） | 有 | **无** | 小程序端用声道分离 + 增益模拟 |
| `createAnalyser`（频谱） | 有 | **无** | 波形台频谱由**乐谱按播放位置推算** |
| 全局 `AudioContext` / `document` / `window` | 有 | **无** | 小程序须 `wx.*` |
| Worker | `new Worker` + `importScripts` | `wx.createWorker`，**只能 require 同目录文件**、无 `wx` API | 渲染 Worker 无法共用 |
| 存储 | 浏览器存储 | `wx.setStorageSync`（上限 10MB） | 各自封装 |

**可共用的部分**（不要重复造轮子）：
纯计算逻辑全部共用 —— 卦象 / 文献 / 作曲 / 渲染，以及**纯 Canvas 2D 的绘制代码**
（`core/viz-stage.js`、`core/taiji.js`）。小程序 Canvas 2D 与浏览器同 API 子集。

**只有"怎么拿到画布 / 怎么存储 / 怎么多线程"必须各写一份**：
小程序用 `wx.createSelectorQuery().select('#id').fields({node:true})` 取节点；
网页直接用 DOM。

---

## 四、必守的工程约定

### 1. 凡定义必注出处（用户明确要求，不可妥协）

用户原话：**「这种定义类的一定要严谨」**。

每一条「定义类」内容（卦象取象、乐器归属、五音清浊、物象映射）
必须在 `core/classics.js` 有对应条目，字段：

| 字段 | 含义 |
| ---- | ---- |
| `gua` | 所属卦 key |
| `src` | `classic` 典籍原文 / `later` 后世类书 / `modern` 当代类推 |
| `cite` | 引文原句（`classic` 与 `later` 必填） |
| `reason` | 取象理由（`modern` 必填，否则 `data.js` 加载即抛错） |
| `alt` | 异说与取舍说明（改了归属的必填：说明初版为何错、依据何改） |

改动物象映射的**固定流程**：
① 查证文献 → ② 改 `classics.js` → ③ 同步别名表 → ④ 跑 `verify-library.js` 与 `verify-timbre.js`。
**禁止只在 `data.js` 改卦属。**

引用古籍须给书名与篇名，必要时注明补证者（如陈立《白虎通疏证》）。

### 2. 内容贴合原典，不得附会

引用《黄帝内经》《梅花易数》等须贴合原文与历史原意。
古代理论与现代医学结论严格分开。

### 3. 音色是五音的实质维度，不只是音高

角徵宫商羽各有专属音色（不只是音高）。
卦 → 乐器依《白虎通·礼乐》八音配八卦；调式 → 音色修饰依《礼记·乐记》清浊次第。
音色差异必须**可测量**：`scripts/verify-timbre.js` 用 Goertzel 频带分析量化，
判据为有音高乐器五音清浊单调递增、相对提升 ≥25% 且绝对 ≥2.5pp。

### 4. 改 core/ 后必须同步

`core/` 是唯一真相源，`web/core/` 与 `miniprogram/core/` 是**构建时生成的副本，不入版本库**。

```bash
npm install        # postinstall 自动同步
npm run sync       # 手动同步
npm run check:sync # 校验三处一致
```

**新增 `core/` 文件时必须登记三处**（漏一处即运行时报错）：
1. `scripts/sync-core.js` 的 `FILES`（**注意依赖顺序**）
2. `web/index.html` 的 `<script>` 标签（顺序敏感）
3. `core/require-shim.js` 的 `MAP`（浏览器端 require 垫片的路径映射）

### 5. 平台代码不得回流 core/

`npm run verify:layering` 自动检查：`core/` 无任何平台 API、
`core/player.js` 平台分支 ≤1 处、后端文件各在其位且不在 `core/` 里。

---

## 五、命令速查

```bash
npm test              # 快速回归（首步自动 sync）约 3 分钟
npm run verify:all    # 全量（含 e2e 真实浏览器）约 6 分钟

npm run sync          # 同步 core 到两端
npm run check:sync    # 校验三处一致
npm run verify:layering   # 分层自检
npm run verify:stage      # 波形台（小程序式环境）
npm run verify:mini-audio # 小程序播放链路

npm run build:android     # 同步+图标+cap sync（再 gradlew assembleDebug 出包）
```

**单独跑某个脚本**：`node scripts/verify-xxx.js`
（`verify-render.js` 需约 2 分钟，渲染 64 卦，属正常）

---

## 六、测试清单与规模（v1.4.0 全绿）

| 脚本 | 覆盖 | 规模 |
| ---- | ---- | ---- |
| `e2e.js` | 真实 Chromium 端到端（含真实播放） | 158 项 |
| `mp-test.js` | 小程序端逻辑 | 111 项 |
| `verify-ui.js` | 小程序界面一致性 | 71 项 |
| `verify-generative.js` | 作曲 / 即兴 / 音层总线 | 37 项 |
| `verify-mini-audio.js` | 小程序播放链路 | 24 项 |
| `verify-loop.js` | 循环 | 19 项 |
| `verify-package.js` | 小程序代码包体积 | 17 项 |
| `verify-layering.js` | 分层结构 | 15 项 |
| `verify-stage.js` | 波形台共享核心 | 11 项 |
| `verify-taiji.js` | 太极图 | 7 项 |
| 其余 | verify / library / timbre / hexagram / texts / render / test / test-recognize | 全通过 |

---

## 七、常见坑（都是踩过的，别再踩）

| 现象 | 根因 | 处理 |
| ---- | ---- | ---- |
| 小程序报「不支持 Web Audio API」 | 环境判定顺序错 | **先看 `wx` 再看 Node**。小程序宿主可能注入 `process` |
| 小程序播放不响 | 误建 Web Audio 上下文 | 加 `IS_MINIPROGRAM` 守卫，或用后端注入 |
| 波形台一片空白 | Canvas 在 `wx:if` 内 / 尺寸为 0 / `requestAnimationFrame` 不可用 | Canvas 常驻渲染 + 重试 + rAF 降级 |
| 太极图画成方槽 | 方向错了 —— 应「左右两瓣 + S 形分界」 | 用 Canvas 2D 画，纯 CSS 做不出 S 形 |
| 暂停键图标不变 | `isPlaying` 在暂停后仍为 true | 暂停 ≠ 停止，图标须判 `isPlaying && !paused` |
| 旧基础库报错 | 缺 `ctx.ellipse` | 加兼容层 |
| 微信工具报「静态资源超过 200K」 | 源图在包内 | 移出 + `packOptions.ignore` |
| 改了小程序，网页端也变了 | v1.4.0 前 core 混着平台代码 | 现已拆分，`verify:layering` 看住 |
| 网页端暂停后从下一段继续 | 误用 `stop()` | 须用 `suspend()`，音频时间轴冻结才是无缝 |

---

## 八、发布流程

**版本号三处同步**：`package.json` 的 `version`、`android/app/build.gradle` 的
`versionName`/`versionCode`、CHANGELOG.md 的版本标题。

```bash
# 1. 改版本号（三处）→ 2. 全量测试 → 3. 提交打标签推送
npm run verify:all
git add -A && git commit -m "..."
git tag -a v1.x.0 -m "..."
git push origin main --tags
```

**APK**：`cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/`

**小程序上传**：`D:\develop\微信web开发者工具\cli.bat upload --project <路径> -v <版本> -d <描述>`
（须先在工具里手动开启「设置 → 安全设置 → 服务端口」，CLI 才可用）

**发布约定**：每个版本对应一个 Git 标签与 GitHub Release，**既有 Release 一律保留**。

---

## 九、当前状态与待办

**v1.4.0 已完成**（commit `9fdad74`，tag `v1.4.0`，已推送 GitHub）：
- 播放后端分层完成，两端后端各归其位
- core 副本改构建时生成
- unity/ lab/ 清理，中文文件名改英文
- 新增 verify-layering 分层自检
- 全量测试通过

**未完成**：
- v1.4.0 的 GitHub Release 与 APK 尚未创建（标签已推）
- 小程序尚未上传 v1.4.0（需用户在开发者工具里操作）
