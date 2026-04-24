---
title: ADR-0004 逻辑时间轴与声学媒体生命周期（阶段 0 行为规格）
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-19
source_of_truth: decision-record
---

# ADR-0004 逻辑时间轴与声学媒体生命周期（阶段 0 行为规格）

## Status

Accepted（阶段 0：冻结产品语义与后续实现门禁；阶段 1+ 实现若偏离须更新本 ADR 或新增 superseding ADR）。

## Context

解语在本地以 `texts.metadata`（`timelineMode`、`logicalDurationSec`、`timeMapping`）与 `media_items`（含占位/声学 blob）共同描述「文献式逻辑时间」与「可选声学轨道」。`layer_units` / 独立边界 segment 的 `startTime`/`endTime` 为**主时间坐标**；占位媒体用于在无声学字节时仍提供稳定 `mediaId` 与锚点。

本 ADR 冻结下列歧义，避免实现与 UI 各说各话：

- 逻辑秒与声学文件秒的对应关系；
- 导入声学时长与已存在语段时间不一致时的处理策略；
- `timelineMode` 与「无 blob / 有 blob / 删音后」下允许的用户操作边界。

行业参考：ELAN 关联媒体与标注分离、Descript Replace/realign、Praat TextGrid 时间域与显式 Scale。

---

## 决策 1：时间坐标与 `timeMapping`

### 1.1 主存坐标（canonical）

- **`layer_units`（及 segment 行）上的 `startTime`/`endTime`** 表示**项目时间轴上的区间**，单位秒，精度以现有写入规则为准（通常三位小数）。
- 该坐标在**未显式缩放**的前提下，既是**文献/逻辑编辑**使用的坐标，也是**与占位媒体行绑定**时的坐标（占位 `media_items.duration` 与 `texts.metadata.logicalDurationSec` 共同约束「逻辑轴可视长度」）。

### 1.2 默认 1:1（逻辑秒 ↔ 解码后媒体时间线）

当满足以下**全部**条件时，**播放头位置、波形 seek、与语段时间**按 **1:1** 理解（同一秒号可直接对应）：

- 当前用于播放的媒体解码成功，且未启用额外的「仅预览」缩放；
- **`texts.metadata.timeMapping` 不存在**，或存在且为 **scale = 1、offsetSec = 0**（与 `LinguisticService.previewTextTimeMapping` / `invertTextTimeMapping` 语义一致）。

### 1.3 非 1:1：显式 `timeMapping`

当存在有效的 `timeMapping`（`offsetSec`、`scale`，且 scale &gt; 0）时：

- **文档时间**（语段边界、文献拖选等）与 **声学时间**（解码后时间线）的关系为：  
  **`realTime = offsetSec + scale * documentTime`**（与 `previewTextTimeMapping` 一致；逆变换见 `invertTextTimeMapping`）。
- **任何**需要同时涉及「文献格子上的数字」与「播放器当前秒」的 UI，必须经过上述映射（或显式说明仅编辑 document 侧）。

### 1.4 `logicalDurationSec`

- 表示**当前文本在文献/逻辑模式下约定的时间轴长度**（用于纯文本轨比例尺、侧栏展示等），**不等于**声学文件物理时长，除非产品显式对齐。
- 删音后 `deleteAudio` 会用 `max(原媒体时长, 语段最大结束, 原 logical…)` 等方式更新该值（实现见 `LinguisticService.deleteAudio`）；**后续若调整删音语义，须与本 ADR 的「决策 3」一并评审**。

---

## 决策 2：导入声学时长 &lt; 已有语段最大结束时间

**原则**：默认 **不静默修改** 已存 `layer_units` / segment 的 `startTime`/`endTime`。

可选策略（实现阶段必选其一或组合；**默认推荐加粗**）：

| 策略 | 行为 | 适用 |
|------|------|------|
| **A. 阻止导入** | 校验 `importAudio` 前 `duration &lt; maxEnd` 则拒绝并提示先缩段或扩逻辑轴 | 强一致、协作严格场景 |
| **B. 允许导入 + 标红越界** | 写库坐标不变；UI 标明超出声学长度的区间不可播或半透明 | **推荐默认**；对齐「标注与媒体解耦」 |
| **C. 自动扩展逻辑轴** | 仅扩展 `logicalDurationSec`/占位 duration，**不**拉长声学文件；用于避免标尺比文件短 | 可与 B 并用 |
| **D. 用户显式「缩放时间轴」** | 批量乘系数使 `maxEnd ≤ 文件时长`（类 Praat Scale times） | 独立操作，非默认导入副作用 |

**冻结结论**：阶段 1 起，导入路径**不得**在未经用户确认的情况下对全体语段做 **D 类缩放**；若实现 **A**，须在 UI 与 i18n 中说明原因。

**更新（ADR-0019）**：占位行**首次**晋升为可播放声学轨（`importAudio` 占位合并路径）且 `L > 文件时长` 时，允许对该 `mediaId` 上坐标做自动线性缩放 + 平移；见 [0019-first-acoustic-import-time-remap.md](./0019-first-acoustic-import-time-remap.md)。

---

## 决策 3：`timelineMode` 与删音 / 再导音（元数据对称目标）

**当前实现问题**（已知技术债）：`deleteAudio` 会将 `texts.metadata.timelineMode` 写为 `document`，而再导音未必恢复 `media`。

**目标语义**（阶段 1 实现须对齐）：

- **`timelineMode: document`**：以文献、逻辑秒、占位轴为主；声学为可选附件。
- **`timelineMode: media`**：以与声学对齐的工作流为主；无 blob 时仍可编辑逻辑坐标，但产品应提示「未链接声学」。

删音**不应**被理解为「项目从 media 永久降级为 document」**除非**用户显式选择「转为文献项目」。在未有该 UI 前，**推荐**删音后保留 `timelineMode: 'media'`，仅清除声学字节并保留占位行；若保留现状写 `document`，须在阶段 1 同步：**再导音时恢复为 `media`** 或写入可逆字段（后续 ADR 可细化）。

**实现记录（阶段 1，2026-04-18）**：`LinguisticService.deleteAudio` / `importAudio` 已按上表对齐；`timelineMode: 'media'` 项目在删音后保留 `media`，`importAudio` 在 `media` 文本上同步 `logicalDurationSec` 下界。

**实现记录（阶段 2，2026-04-18）**：`resolveTimelineShellMode` + `TranscriptionPage.TimelineContent` 壳层；原 `TranscriptionTimelineTextOnly` 在 `document|media` 下允许逻辑拖建；`LeftRailProjectHub` 逻辑时间映射菜单对 `media` 开放；`acousticPending` 视觉提示。

**实现记录（横向壳合并，2026-04-22）**：见 [ADR-0005](./0005-unified-timeline-workspace-host.md) — 横向 `waveform`/`text-only` 统一由 `TranscriptionTimelineWorkspaceHost` 挂载 `TranscriptionTimelineHorizontalMediaLanes`；`TranscriptionTimelineTextOnly` 实现已移除；解码中样式由 `acousticShellPending` 继承。

**实现记录（决策 3 回归锁定，2026-04-22）**：`LinguisticService.cleanup.deleteAudioPreserveTimeline` 在删音后按「原 `media` 或已有计时语段」保留 `texts.metadata.timelineMode: 'media'`；占位行 `details.timelineMode` 与之一致。`importAudio` 经 `refreshMediaTimelineMetadata` 在 `media` 文本上维持 `timelineMode: 'media'` 并抬升 `logicalDurationSec` 下界。单测 **`deleteAudio preserves timelineMode media and importAudio keeps media metadata`**（`LinguisticService.test.ts`）为再导音对称性的门禁。

**实现记录（阶段 3，2026-04-18）**：对导入/删音/选媒体/保存路径做静态审计；确认无「导入或删音触发的静默语段缩放」；`importAudio` 短于已有语段跨度时不改 `layer_units`（见 `LinguisticService.test.ts` 回归用例）。

**实现记录（阶段 4，2026-04-18）**：纯文本壳层语段左右拖边改时复用 `useTimelineResize` + `saveUnitTiming`；逻辑轴下以轨道宽度与 `logicalDurationSec`（及与拖建一致的回退推导）换算 `zoomPxPerSec`；借层 segment 用 `segmentLookupLayerId` 与波形区对齐。

**实现记录（阶段 4b，2026-04-18）**：当 `texts.metadata.timeMapping`（`offsetSec`/`scale`）存在时，纯文本轨 **拖建** 与 **改时手柄** 的像素→文献秒换算经 `previewTextTimeMapping(0, logicalDuration)` 的声学视口跨度与 `invertTextTimeMapping` 落回主存坐标（`src/utils/textOnlyTimelineTimeMapping.ts`）；无映射时与线性 `x/w·L` 一致。

**实现记录（阶段 5，2026-04-18）**：`assertTimelineMediaForMutation` 统一「当前时间轴无媒体行」前置与 **`mediaRequired`** 上报；用于 segment 创建路由与 **`createUnitFromSelection` / `createAdjacentUnit`**。

**实现记录（阶段 6a，2026-04-18）**：`media_items.details.timelineKind` 显式取值 **`placeholder` / `acoustic`**；`isMediaItemPlaceholderRow` 双读旧启发式；`createPlaceholderMedia`、`deleteAudio` 占位、`importAudio` 写回均写入/刷新该字段（见 `src/utils/mediaItemTimelineKind.ts`）。

**实现记录（阶段 7b，2026-04-18）**：`importAudio` 支持 **`importMode` / `replaceMediaId`**（Replace 覆盖所选声学行、Add 新建轨）；导入对话框在已存在非占位声学时展示 **Replace vs Add**（`AudioImportDialog` + `audioImportDisposition`）；侧栏/工具栏隐藏文件直传路径仍走 **`importMode` 缺省** 的既有默认行为。

**实现记录（阶段 7a，2026-04-18）**：`resolveTimelineAxisStatus` 汇总 **解码中 / 占位轴 / 无声学 blob / 语段超出解码时长**；**`TimelineAxisStatusStrip`** 置于 **`TranscriptionPage.TimelineTop`**；在 **`timelineMode` 为 document 或 media** 时展示 **`texts.metadata.logicalDurationSec`** 格式化的逻辑轴长度（见 `src/utils/timelineAxisStatus.ts`）。

**实现记录（阶段 7a 扩展，2026-04-19）**：**`useReadyWorkspaceAxisStatus`** 在 **`no_playable_media`** 下向 **`TimelineAxisStatusStrip`** 传入 **`importAcoustic`**，通过 **`importFileRef.current.click()`** 触发与工具栏共用的隐藏 **`<input type="file">`**；文案强调 **语段起止时间仍保留** 并引导选择可播放媒体文件（i18n：`noPlayableMediaTimingKept`、`chooseAcousticFileButton`）。单测 **`useReadyWorkspaceAxisStatus.test.tsx`** 锁定「仅无媒体提示时接线、解码中不出导入按钮」。

**实现记录（互操作回归测试，2026-04-19）**：**`EafService.test.ts`** / **`TextGridService.test.ts`** 增加无本地声学条件下的 **export→import** 用例，校验 **非均匀** 语段时间在 round-trip 后不被均分或重排（与主存坐标语义一致）。

**实现记录（空项目占位，2026-04-19）**：**新建项目**不再自动插入 **`document-placeholder.track`**；**建层**时仅保证文献时间轴（`ensureDocumentTimeline`）。占位行推迟到**首次需要锚定时间的写操作**（`useTranscriptionUnitActions` 内 `ensureTimelineMediaRowResolved` → `createPlaceholderMedia`）；仅有空层、尚未建段或导入声学前 UI 不展示占位行。

---

## 决策 4：状态 × 操作矩阵（门禁基准）

下列「允许」指产品**应当提供或被允许**的编辑能力；「受限」指须提示、隐藏波形或走占位路径。实现可分阶段，但**不得**与本矩阵长期冲突。

### 4.1 状态定义

| 状态 ID | 条件（简化） |
|---------|----------------|
| **D0** | `timelineMode=document`，无声学 blob（仅占位或等价） |
| **D1** | `timelineMode=document`，已加载声学 blob |
| **M0** | `timelineMode=media`，无声学 blob |
| **M1** | `timelineMode=media`，已加载声学 blob |
| **X** | 删音后占位、无 blob（实现上常接近 D0/M0，以 `timelineMode` 为准） |

### 4.2 操作矩阵（阶段 0 冻结）

| 操作 | D0 | D1 | M0 | M1 | X |
|------|----|----|----|----|---|
| 编辑转写/译文文本 | 允许 | 允许 | 允许 | 允许 | 允许 |
| 手改语段起止时间（数值或句柄） | 允许 | 允许 | 允许 | 允许 | 允许 |
| 纯文本轨拖选建段（逻辑轴比例尺） | **允许**（当前代码门控为 `activeTextTimelineMode===document`；**阶段 2 须允许 D0 与 M0 在「无 blob」时等价能力，或改名统一为逻辑轴门控）** | —（通常显示波形壳） | **应与 D0 对齐** | — | 与 D0/M0 一致 |
| 波形上拖选 / 播放 / seek | 不适用 | 允许 | 不适用 | 允许 | 不适用 |
| 导入声学 | 允许 | 允许（Replace/Add 策略见执行计划 7B） | 允许 | 允许 | 允许 |
| 删音（变占位） | 若存在 blob 则允许 | 允许 | 若存在则允许 | 允许 | 已无 blob 则 N/A |

**说明**：主壳「波形轨 vs 纯文本轨」由 `resolveTimelineShellMode`（`selectedMediaUrl`、播放器就绪、`playerDuration`、纵向开关等）决定，经 `TranscriptionTimelineWorkspaceHost` 路由；**不**单独以 `timelineMode` 切换横向组件树（见 [ADR-0005](./0005-unified-timeline-workspace-host.md)）。

---

## 决策 5：导入语义（Replace vs Add）

- **Replace（覆盖当前主声学）**：意图是「同一录音的更新」；**不得**无故新建 `mediaId` 若当前仅存在占位且无非占位媒体（与 `LinguisticService.importAudio` 晋升占位语义一致）。
- **Add（新增一条媒体）**：在已存在非占位媒体时，新建 `mediaId` 为合法路径；UI 应让用户知晓语段仍挂在**所选** `mediaId` 上，避免「导入了一条却看不到段」的错觉。

---

## Consequences

- 阶段 1（`deleteAudio`/`importAudio`）与阶段 2（门控）的 PR **须引用本 ADR**，并在评审中核对矩阵与决策 2 选项。
- 若未来引入「用户显式转为文献项目」或「批量缩放时间轴」，新增 **superseding ADR** 或修订本文件 `Status` 与决策段落。

## References

- `docs/execution/archive/cursor-plans/logical_timeline_media_lifecycle.plan.md`
- `src/services/LinguisticService.ts`（`previewTextTimeMapping`、`invertTextTimeMapping`、`importAudio`、`deleteAudio`）
- `src/pages/TranscriptionPage.TimelineContent.tsx`
- [ADR-0005](./0005-unified-timeline-workspace-host.md)（横向统一宿主；原纯文本壳逻辑并入 `TranscriptionTimelineHorizontalMediaLanes`）
