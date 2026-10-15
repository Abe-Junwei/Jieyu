---
title: ADR-0004 逻辑时间轴与声学媒体生命周期
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-14
source_of_truth: decision-record
---

# ADR-0004 逻辑时间轴与声学媒体生命周期

## Status

Accepted。主存坐标、`timeMapping` 和导入不静默缩放仍然有效。`timelineMode` 的运行态分叉已由 [ADR-0009](./0009-greenfield-timeline-single-source-freeze.md) 接替。

## Context

解语在本地以 `texts.metadata`（`timelineMode`、`logicalDurationSec`、`timeMapping`）与 `media_items`（含占位/声学 blob）共同描述「文献式逻辑时间」与「可选声学轨道」。`layer_units` / 独立边界 segment 的 `startTime`/`endTime` 为**主时间坐标**；占位媒体用于在无声学字节时仍提供稳定 `mediaId` 与锚点。

本 ADR 冻结下列歧义，避免实现与 UI 各说各话：

- 逻辑秒与声学文件秒的对应关系；
- 导入声学时长与已存在语段时间不一致时的处理策略；
- 无声学、解码中、可播放三种状态下允许的操作。`timelineMode` 只作导出标签。

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

**实现记录（导入冻结仅作用于持久化逻辑时长，2026-06-26 修订）**：`importAudio` 在已有 `logicalDurationSec > 0` 时不再因更长声学抬高逻辑轴；互操作导入 metadata 经 `mergeImportedTimelineMetadata` 钳制——即**冻结只作用于持久化的 `logicalDurationSec`**。**显示跨度不冻结**：`resolveTimelineBindingExtentSec` 取 `max(文献, 声学)`，更长声学时铺轨 / 标尺 / 建段上界跟到完整声学时长（波形完整可见可滚），播放亦覆盖完整媒体（不再以文献跨度钳制 seek/timeupdate）。显式扩展仍走 `expandTextLogicalDurationToAtLeast`。**例外**：占位删音后再绑**更短**声学仍走 ADR-0019 压缩；**更长**声学导入不抬高已冻结逻辑轴（但完整显示 / 播放）。

> 修订原因：初版（2026-06-26 上午）把显示跨度也钳在文献轴内，导致更长声学被截断、波形 / 标尺无法到达声学尾部。按用户反馈改为「完整显示波形，仅不延伸持久化文本时长」。

**冻结结论**：阶段 1 起，导入路径**不得**在未经用户确认的情况下对全体语段做 **D 类缩放**；若实现 **A**，须在 UI 与 i18n 中说明原因。

**更新（ADR-0019）**：占位行**首次**晋升为可播放声学轨（`importAudio` 占位合并路径）且 `L > 文件时长` 时，允许对该 `mediaId` 上坐标做自动线性缩放 + 平移；见 [0019-first-acoustic-import-time-remap.md](./0019-first-acoustic-import-time-remap.md)。

---

## 决策 3：`timelineMode` 只作导出标签

运行态以 [ADR-0009](./0009-greenfield-timeline-single-source-freeze.md) 为准。`timelineMode` 不选壳、不定占位、不驱动轴状态。声学能力看 `AcousticSnapshot`（`no_media` / `pending_decode` / `playable`）。

删音只清声学字节并保留占位行与主存坐标。占位行首次晋升为更短声学时的压缩见 [ADR-0019](./0019-first-acoustic-import-time-remap.md)。

下面按日期记下的实现笔记若与 ADR-0009 冲突，以 ADR-0009 为准。

**实现记录（阶段 1，2026-04-18，历史）**：`LinguisticService.deleteAudio` / `importAudio` 当时按 `timelineMode` 对齐。运行态以 ADR-0009 为准。

**实现记录（阶段 2，2026-04-18，历史）**：当时按 `document` / `media` 分叉壳层和逻辑拖建。壳层以横向宿主 ADR-0005 为准，运行态以 ADR-0009 为准。

**实现记录（横向壳合并，2026-04-22）**：见 [ADR-0005](./0005-unified-timeline-workspace-host.md) — 横向 `waveform`/`text-only` 统一由 `TranscriptionTimelineWorkspaceHost` 挂载 `TranscriptionTimelineHorizontalMediaLanes`；`TranscriptionTimelineTextOnly` 实现已移除；解码中样式由 `acousticShellPending` 继承。

**实现记录（2026-04-22，历史）**：当时删音后保留 `timelineMode: 'media'`，并把对应单测当作门禁。这不是现行门禁。运行态以 ADR-0009 为准。

**实现记录（阶段 3，2026-04-18）**：对导入/删音/选媒体/保存路径做静态审计；确认无「导入或删音触发的静默语段缩放」；`importAudio` 短于已有语段跨度时不改 `layer_units`（见 `LinguisticService.test.ts` 回归用例）。

**实现记录（阶段 4，2026-04-18）**：纯文本壳层语段左右拖边改时复用 `useTimelineResize` + `saveUnitTiming`；逻辑轴下以轨道宽度与 `logicalDurationSec`（及与拖建一致的回退推导）换算 `zoomPxPerSec`；借层 segment 用 `segmentLookupLayerId` 与波形区对齐。

**实现记录（阶段 4b，2026-04-18）**：当 `texts.metadata.timeMapping`（`offsetSec`/`scale`）存在时，纯文本轨 **拖建** 与 **改时手柄** 的像素→文献秒换算经 `previewTextTimeMapping(0, logicalDuration)` 的声学视口跨度与 `invertTextTimeMapping` 落回主存坐标（`src/utils/textOnlyTimelineTimeMapping.ts`）；无映射时与线性 `x/w·L` 一致。

**实现记录（阶段 5，2026-04-18）**：`assertTimelineMediaForMutation` 统一「当前时间轴无媒体行」前置与 **`mediaRequired`** 上报；用于 segment 创建路由与 **`createUnitFromSelection` / `createAdjacentUnit`**。

**实现记录（阶段 6a，2026-04-18）**：`media_items.details.timelineKind` 显式取值 **`placeholder` / `acoustic`**；`isMediaItemPlaceholderRow` 双读旧启发式；`createPlaceholderMedia`、`deleteAudio` 占位、`importAudio` 写回均写入/刷新该字段（见 `src/utils/mediaItemTimelineKind.ts`）。

**实现记录（阶段 7b，2026-04-18）**：`importAudio` 支持 **`importMode` / `replaceMediaId`**（Replace 覆盖所选声学行、Add 新建轨）；导入对话框在已存在非占位声学时展示 **Replace vs Add**（`AudioImportDialog` + `audioImportDisposition`）；侧栏/工具栏隐藏文件直传路径仍走 **`importMode` 缺省** 的既有默认行为。

**实现记录（阶段 7a，2026-04-18，历史）**：`resolveTimelineAxisStatus` 汇总解码中、占位轴、无声学和无解码时长。逻辑轴长度的展示条件以 ADR-0009 为准，不按 `timelineMode` 的 document 或 media 分叉。

**实现记录（阶段 7a 扩展，2026-04-19）**：**`useReadyWorkspaceAxisStatus`** 在 **`no_playable_media`** 下向 **`TimelineAxisStatusStrip`** 传入 **`importAcoustic`**，通过 **`importFileRef.current.click()`** 触发与工具栏共用的隐藏 **`<input type="file">`**；文案强调 **语段起止时间仍保留** 并引导选择可播放媒体文件（i18n：`noPlayableMediaTimingKept`、`chooseAcousticFileButton`）。单测 **`useReadyWorkspaceAxisStatus.test.tsx`** 锁定「仅无媒体提示时接线、解码中不出导入按钮」。

**实现记录（互操作回归测试，2026-04-19）**：**`EafService.test.ts`** / **`TextGridService.test.ts`** 增加无本地声学条件下的 **export→import** 用例，校验 **非均匀** 语段时间在 round-trip 后不被均分或重排（与主存坐标语义一致）。

**实现记录（默认可读缩放，2026-09-26）**：占位轴若把整段时长缩进一屏，语段只剩几个像素，文字会被裁成竖纹。默认缩放（`zoomMode === 'fit-all'` 且仍停在 100%）改为 `resolveContentFitZoomPercent`：每条当前媒体语段的像素宽度至少容纳其全文（按 14px/字加段内边距），时间仍按起止比例排布，时间轴可横向滚动。工具栏「适应全部」回到整段缩进一屏，并保持到用户改用其他缩放模式。总滚动宽度超过 6_000_000px 时停止再放大，避免浏览器布局上限。

**实现记录（空项目占位，2026-04-19）**：**新建项目**不再自动插入 **`document-placeholder.track`**；**建层**时仅保证文献时间轴（`ensureDocumentTimeline`）。占位行推迟到**首次需要锚定时间的写操作**（`useTranscriptionUnitActions` 内 `ensureTimelineMediaRowResolved` → `createPlaceholderMedia`）；仅有空层、尚未建段或导入声学前 UI 不展示占位行。

---

## 决策 4：声学状态 × 操作

编辑能力看 `AcousticSnapshot`，不看 `timelineMode`。文本和语段起止时间在三种状态下都可编辑。

| 状态 | 波形拖选 / 播放 / seek | 导入声学 |
| --- | --- | --- |
| `no_media` | 不适用 | 允许 |
| `pending_decode` | 等待解码 | 允许 |
| `playable` | 允许 | 允许（Replace / Add 见决策 5） |

主壳由 `resolveTimelineShellMode` 决定，经 `TranscriptionTimelineWorkspaceHost` 路由。不单独用 `timelineMode` 切换横向组件树（见 [ADR-0005 横向壳](./0005-unified-timeline-workspace-host.md)）。

---

## 决策 5：导入语义（Replace vs Add）

- **Replace（覆盖当前主声学）**：意图是「同一录音的更新」；**不得**无故新建 `mediaId` 若当前仅存在占位且无非占位媒体（与 `LinguisticService.importAudio` 晋升占位语义一致）。
- **Add（新增一条媒体）**：在已存在非占位媒体时，新建 `mediaId` 为合法路径；UI 应让用户知晓语段仍挂在**所选** `mediaId` 上，避免「导入了一条却看不到段」的错觉。

---

## Consequences

- 阶段 1（`deleteAudio`/`importAudio`）与阶段 2（门控）的 PR **须引用本 ADR**，并在评审中核对矩阵与决策 2 选项。
- 若未来引入「用户显式转为文献项目」或「批量缩放时间轴」，新增 **superseding ADR** 或修订本文件 `Status` 与决策段落。

## References

- `src/services/LinguisticService.ts`（`previewTextTimeMapping`、`invertTextTimeMapping`、`importAudio`、`deleteAudio`）
- `src/pages/TranscriptionPage.TimelineContent.tsx`
- [ADR-0005](./0005-unified-timeline-workspace-host.md)（横向统一宿主；原纯文本壳逻辑并入 `TranscriptionTimelineHorizontalMediaLanes`）
