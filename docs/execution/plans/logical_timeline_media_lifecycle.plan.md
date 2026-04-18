---
name: Logical timeline & media lifecycle
overview: >-
  Evolve document vs acoustic timeline behavior without replacing the core model (layer_units / segments,
  placeholder media_items, timeMapping). Unify metadata on delete/re-import, UI gates, time-coordinate
  preservation, text-only interaction parity, and optional industry-aligned UX (media state, replace vs add,
  mismatch repair, export). Complements architecture notes in docs/architecture/ and prior timeline migration
  (unified_timeline_unit_view_078c48aa.plan.md).
isProject: true
status: phase-7a-7b-done
---

# 逻辑时间轴与媒体生命周期 — 执行计划

## 背景与目标

在**不推翻**现有主线（`layer_units` + `mediaId`、占位 `media_items`、`metadata.timelineMode` / `logicalDurationSec` / `timeMapping`）的前提下，实现：

1. **删媒体**：存库时间范围与语段行保留；文本仍可自由编辑。
2. **再导媒体**：默认不重算已有 `startTime`/`endTime`；与占位晋升路径一致时复用 `mediaId`。
3. **纯文本 → 导入声学**：语段范围保持；逻辑秒与声学秒的映射可显式调整（含 `timeMapping`）。
4. **纯文本轨交互**：手改时间、拖调边界、拖建段等能力尽量与有媒体时一致（交互层抽象，非重做存储）。

已确认的高优先级问题（源码核对）：**元数据不对称（删音写 `document`、导回不恢复 `media`）**、**`timelineMode` 与纯文本轨拖选门控不一致**、**主壳层是否波形仅看播放器不看项目类型**。

---

## 阶段 0：行为规格（必须先对齐）— **已完成**

**产出（冻结）**：[`docs/adr/0004-logical-timeline-acoustic-media-lifecycle.md`](../../adr/0004-logical-timeline-acoustic-media-lifecycle.md)（ADR-0004）。

已写入内容摘要：

- **决策 1**：主存坐标、`timeMapping` 与 1:1 默认、`logicalDurationSec` 含义。
- **决策 2**：声学时长短于已存在语段最大结束时的策略表（默认推荐 **允许导入 + 标红越界**，禁止静默全体缩放）。
- **决策 3**：`timelineMode` 与删音/再导音的**目标语义**（元数据对称；指出当前实现债与阶段 1 对齐方向）。
- **决策 4**：状态 D0/D1/M0/M1/X 与操作矩阵（含纯文本轨拖选与 `timelineMode=media` 无 blob 时应对齐文献能力）。
- **决策 5**：Replace vs Add 与 `importAudio` 晋升占位的关系。

**行业对标**：ELAN、Descript、Praat（见 ADR 正文）。

---

## 阶段 1：元数据对称（删音 ↔ 导音）— **已完成**

**主要文件**：`src/services/LinguisticService.ts`（`deleteAudio`、`importAudio`）、`src/services/LinguisticService.test.ts`。

- **删音**：若 `texts.metadata.timelineMode === 'media'`，**保留** `media`；占位 `media_items.details.timelineMode` 与之一致；`timebaseLabel` 在 media 路径下保留原值（否则默认 `logical-second`）。无 `timelineMode` 或非 `media` 时仍写 **`document`** + `logical-second`（与既有文献默认一致）。
- **导音**：当文本已为 **`timelineMode: 'media'`** 时，在写入声学 blob 后 **刷新** `metadata`（保持 `media`，`logicalDurationSec = max(原值, 导入声明时长)`）。
- **测试**：`deleteAudio preserves timelineMode media and importAudio keeps media metadata`；原删音回归用例改名为「无 timelineMode 时默认 document」。

---

## 阶段 2：统一 UI 门控 — **已完成**

**主要文件**：`src/utils/timelineShellMode.ts`、`TranscriptionPage.TimelineContent.tsx`、`TranscriptionTimelineTextOnly.tsx`、`LeftRailProjectHub.tsx`、`src/styles/pages/timeline/timeline-layout.css`、`src/utils/timelineShellMode.test.ts`。

- **`resolveTimelineShellMode`**：集中判定 `waveform` / `text-only` / `empty`，并输出 **`acousticPending`**（有 URL 但尚未 `playerIsReady` 或 `playerDuration <= 0`）。
- **`TranscriptionPageTimelineContent`**：改用上述判定；纯文本壳层在 `acousticPending` 时传入 **`acousticPending`**（根节点 `timeline-content-acoustic-pending` + 底边强调线）。
- **纯文本轨拖建**：`canUseLogicTimelineDragCreate` = `document` **或** `media`（且存在 `createUnitFromSelection`），与 ADR-0004 矩阵 M0/D0 对齐。
- **左侧项目 hub**：时间映射预览 / 历史 / 导出分组中逻辑时间入口，由仅 `document` 改为 **`document | media`**（`usesLogicTimelineHubFeatures`）。

---

## 阶段 3：时间坐标守恒审计 — **已完成**

**范围**：导入、删音、切换媒体、波形选区、segment/unit 保存路径。

- 全局排查对 `startTime`/`endTime` 的 **静默 clamp、rescale、重采样**；默认 **不改存库坐标**，除非阶段 0 明确允许。
- 区分 **交互预览截断** 与 **持久化写入**。

**审计结论（2026-04-18）**：

| 路径 | 结论 |
|------|------|
| `LinguisticService.importAudio` | 仅写 `media_items`（及 `timelineMode: media` 时刷新 `logicalDurationSec` 下界）；**不**遍历或改写 `layer_units`。 |
| `LinguisticService.deleteAudio` | 占位化当前 `media_items`、合并元数据；**不**修改语段 `startTime`/`endTime`。 |
| `useTranscriptionProjectMediaController` 导音/删音 | 调上述服务后 `loadSnapshot`；无本地 rescale。 |
| `useTranscriptionMediaSelection` | 仅切换 `selectedMediaId` / URL；不写库坐标。 |
| `saveUnitTiming`（`useTranscriptionUnitActions`） | 在相邻段非重叠约束下规范化起止；**未**按 `media.duration` 做上界 clamp。 |
| `createUnitFromSelection` | 新建段时按当前 **媒体声明时长** 限制区间（产品允许的新段落在轨内）；与「已有坐标不因导入而变」正交。 |
| `applyTextTimeMapping` / `updateTextTimeMapping` | 用户显式时间映射；非导入副作用。 |
| `offsetSelectedTimes` / `scaleSelectedTimes` | 显式批量操作 + undo；非静默。 |
| `useWaveSurfer` `seekTo` | `Math.min(time, dur)` 为 **播放头** 截断，不写 `layer_units`。 |
| `useTranscriptionTimelineInteractionController` 波形 split | split 落点按 **解码时长** clamp，属交互计算，经用户手势后才持久化。 |

**回归测试**：`LinguisticService.test.ts` — `importAudio does not rescale existing layer_units when imported duration is shorter than segment span`（对齐 ADR-0004 决策 2 **B**，防静默全体缩放）。

---

## 阶段 4：纯文本轨时间编辑对等 — **已完成**

**目标**：与 WaveSurfer 解耦的「时间编辑」输入层（像素比例来自 `logicalDurationSec` 或 timeMapping 视口）。

- 复用现有 **`saveUnitTiming`** / segment 改时 API；文献轨与波形轨共用同一套改时逻辑，仅标尺与门控不同。

**实现（2026-04-18）**：

- **`useTimelineResize`**：支持可选 `TimelineResizeDragOptions` — `zoomPxPerSec` 覆盖（纯文本轨用 **轨道可视宽度 / `resolvedLogicalDurationSec`** 推导秒—像素比）、`segmentLookupLayerId`（借层显示时在 `segmentsByLayer` 中用**源层** id 解析 segment，聚焦仍用当前 `layer.id`）。
- **`TranscriptionTimelineTextOnly`**：在转写行卡片上增加左右 **改时手柄**（与拖建轨道互斥命中），调用页面传入的 **`startTimelineResizeDrag`**（与波形壳同源）；样式 `timeline-text-item-timing-resize-handle`。
- **编排**：`TranscriptionPage.ReadyWorkspace` → `transcriptionReadyWorkspaceOrchestratorInput` 将 `startTimelineResizeDrag` 传入 `textOnlyPropsInput`。
- **测试**：`TranscriptionTimelineTextOnly.test.tsx` — 传入 `startTimelineResizeDrag` 时渲染 **2** 个改时手柄。
- **阶段 4b（timeMapping 视口）**：`activeTextTimeMapping` 的 `offsetSec`/`scale` 下传为 `textOnlyTimeMapping`；`textOnlyTimelineTimeMapping.ts` 统一拖建与改时的像素—文献秒换算（`LinguisticService.previewTextTimeMapping` / `invertTextTimeMapping`）；`textOnlyTimelineTimeMapping.test.ts` 覆盖恒等映射与 `scale≠1`。

---

## 阶段 5：创建路径前置条件单点化 — **已完成**

**主要文件**：`src/pages/transcriptionSegmentCreationActions.ts`、`src/hooks/useTranscriptionUnitActions.ts`、orchestrator 下传。

- 抽取 **`assertTimelineMediaForMutation`**（或等价），统一 **`selectedUnitMedia` / `selectedTimelineMedia`** 缺失时的文案与 `setSaveState`。
- 在 orchestrator **收敛单一「当前主媒体」解析源**再下传，降低一侧改、另一侧漏的风险。

**实现（2026-04-18）**：

- **`src/utils/assertTimelineMediaForMutation.ts`**：`assertTimelineMediaForMutation` + `TIMELINE_MEDIA_REQUIRED_I18N_KEY`；缺失时走 **`reportValidationError`** → `setSaveState({ kind: 'error', errorMeta })`（与 `useTranscriptionUnitActions` 原行为一致）。
- **`transcriptionSegmentCreationActions.ts`**：独立边界 / 时间细分路径在 **`createNextSegmentRouted`**、**`createUnitFromSelectionRouted`** 入口统一校验；局部变量 **`selectedMedia`** 承接类型收窄。
- **`useTranscriptionUnitActions.ts`**：**`createUnitFromSelection`**、**`createAdjacentUnit`** 入口复用同一断言（`selectedUnitMedia`）。
- **测试**：`assertTimelineMediaForMutation.test.ts`；`useTranscriptionSegmentCreationController.test.tsx` — 无 `selectedTimelineMedia` 时不建段且带 **`mediaRequired`** 的 `errorMeta`。

**说明**：编排层仍以 **`selectedTimelineMedia`**（与 `selectedUnitMedia` 由既有派生数据对齐）传入 segment 控制器；阶段 5 聚焦 **校验与错误形态单点化**，未改媒体解析数据源本身。

---

## 阶段 6：占位与多轨语义（可后置）— **已完成（占位显式化 + 双读）**

**主要文件**：`LinguisticService.importAudio`、媒体相关 UI。

- **占位判定**：逐步从启发式（`placeholder` / `timelineMode` / 文件名）迁向 **显式字段**（如 `details.timelineKind`），迁移期双读旧逻辑。
- **占位 + 真实并存**：按产品选择 — UI 上「合并到主轨」或导入时 **Replace vs Add** 显式分支（见阶段 7B）。

**实现（2026-04-18，阶段 6a）**：

- **`src/utils/mediaItemTimelineKind.ts`**：`MEDIA_TIMELINE_KIND_PLACEHOLDER` / `MEDIA_TIMELINE_KIND_ACOUSTIC`；新增 **`resolveMediaItemTimelineKind`** 与 **`withResolvedMediaItemTimelineKind`**，显式 `timelineKind` 优先；缺省时仅在迁移期做受控双读与回填。
- **`LinguisticService`**：`importAudio` 占位聚类、`deleteAudio` 兄弟占位合并均改用 **`isMediaItemPlaceholderRow`**；**`createPlaceholderMedia`**、删音占位行、**`importAudio` 写入**分别落 **`timelineKind: placeholder|acoustic`**；`getMediaItemsByTextId` / `saveMediaItem` 对历史行自动补齐显式字段，避免后续继续散落启发式判断。
- **媒体 UI 读取**：如 `useTranscriptionMediaSelection` 已改走统一 resolver，替代直接读取 `details.placeholder` / `timelineMode` 的拼接判断。
- **测试**：`mediaItemTimelineKind.test.ts`；**`LinguisticService.test.ts`** 扩展删音/导回、`createPlaceholderMedia`、历史媒体回填与短导入断言。

**阶段 6 边界**：Replace vs Add **产品 UI** 归阶段 **7B**，已于 **2026-04-18** 落地（见下「7B」）；当前仍保留迁移期双读兼容，但主读写路径已收敛到显式字段。

---

## 阶段 7：行业对标补充（并入本计划）

在阶段 0～6 之上，增加以下**产品层**改进；与「不重写存储」兼容。

### 7A — 媒体与时间轴状态可见性（高优先级、低成本）— **已完成（2026-04-18）**

- **媒体状态**：无声学 / 仅占位 / 已加载 / **时长不足**（`duration < max(segment end)`）等，用统一 UI 提示（对标 ELAN *linked file*、缺失媒体提示）。
- **逻辑轴长度**：文献模式下显式展示或可读 **`logicalDurationSec`（及推导规则）**，减少「拖选映射到多少秒」的不透明感（对标 Praat `xmax` 时间域）。

**实现**：

- **`src/utils/timelineAxisStatus.ts`**：`resolveTimelineAxisStatus` + `maxUnitEndTimeSec`，复用 **`resolveTimelineShellMode`** 判定解码中；波形壳下比较 **`playerDuration`** 与当前媒体句段 **`max(endTime)`** 标「语段超出声学可播长度」；文本壳下区分占位轴 vs 无 blob。
- **`TimelineAxisStatusStrip`**：时间轴顶栏（**`TranscriptionPage.TimelineTop`** 内、`TimeRuler` 之上）展示状态文案；**`timelineMode` 为 `document`/`media`** 且存在 **`logicalDurationSec`** 时追加「逻辑轴长度 …（metadata）」行。
- **样式**：`src/styles/timeline/timeline-axis-status.css`，由 **`pages/transcription-timeline.css`** 聚合导入。
- **测试**：`timelineAxisStatus.test.ts`。

### 7B — 导入语义：替换 vs 新增（中高优先级）— **已完成（2026-04-18）**

- 在导入入口区分：**覆盖当前主轨（Replace）** vs **新增媒体轨（Add）**，与 `importAudio`「仅全非占位时新建 `mediaId`」对齐，用界面文案固定用户预期（对标 Descript *Replace file*：同内容迭代 vs 随意换文件风险）。

**实现**：

- **`LinguisticService.importAudio`**：可选 **`importMode`**（`default` | `replace` | `add`）与 **`replaceMediaId`**；`replace` 且目标为非占位行时**就地覆盖**该 `media_id`；`replace` 且目标为占位行时走**显式晋升**该占位；`add` 且已存在非占位声学时**强制新建**媒体行；`default` 保持原语义。
- **`AudioImportDialog`**：当当前项目已存在非占位声学（`useTranscriptionProjectMediaController` 的 **`audioImportDisposition.kind === 'choose'`**）时展示单选；否则不展示（占位-only 与新建项目仍走默认晋升/新建逻辑）。
- **编排**：`mediaItems` 传入媒体控制器 → `audioImportDisposition` 经 **`TranscriptionPage.Dialogs`** 下传；**`ImportAudioRequest`**（`TranscriptionAppService`）透传新字段。
- **测试**：`LinguisticService.test.ts`（`importMode` add/replace/非法 id）；**`AudioImportDialog.test.tsx`**（choose + Add 传参）。

### 7C — 时长错位时的显式修复（中优先级）— **已完成（2026-04-18，最小闭环）**

- 当声学时长与逻辑轴/语段不一致时，提供显式修复入口，避免单一隐式策略。

**实现**：

- **`TimelineAxisStatusStrip`**：在 **`duration_short`** 状态下展示 **“扩展逻辑轴”** 按钮，而不是静默修改已有句段时间。
- **`TranscriptionPage.ReadyWorkspace`**：按钮触发 **`expandLogicalDurationFromAxisStatus`**，调用应用服务将 **`texts.metadata.logicalDurationSec`** 扩到不小于当前语段最大结束时间。
- **`LinguisticService.expandTextLogicalDurationToAtLeast`**：只扩 metadata，不改 **`layer_units.startTime/endTime`**，与 ADR-0004 决策 2 的显式修复方向一致。
- **测试**：`TimelineAxisStatusStrip.test.tsx` 与 `LinguisticService.test.ts` 已覆盖按钮入口与逻辑轴扩展服务。

### 7D — 导出与互操作（中长期）

- 强化 **无声学也可导出** 时间标注（与 ELAN/Audacity 标签导出心智一致），降低「必须理解占位 `mediaId`」的协作成本。

---

## 验收原则（横切）

- **删音 / 导音**前后，对同一批 `layer_units`（及 segment 行）抽样：**时间字段与 `mediaId` 复用行为**符合阶段 0。
- **静态检查**：涉及文档治理时执行 `npm run check:docs-governance`（新增/修改 `docs/execution/plans/` 下文件时）。

---

## 关联文档

- 时间轴单元视图迁移（已完成）：`docs/execution/plans/unified_timeline_unit_view_078c48aa.plan.md`
- 新增 ADR（若阶段 0/1 冻结跨团队约定）：`docs/adr/`（按需创建）

---

## 建议实施顺序

1. 阶段 0（规格）→ 阶段 1（元数据 + 测试）→ 阶段 2（门控）—— **最短路径消除当前硬问题**。  
2. 阶段 3 + 5 — **防回归**。  
3. 阶段 4 — **体验对齐**。  
4. 阶段 6 — **数据与多轨清晰度**。  
5. 阶段 7A～7D — **按迭代穿插**（7A 可与阶段 2 并行；7B 与阶段 6 呼应；7C 依赖阶段 0 规则；7D 独立里程碑）。
