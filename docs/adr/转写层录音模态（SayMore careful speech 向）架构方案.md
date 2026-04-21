---
title: ADR-0005 转写层录音模态（SayMore careful speech 向）
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-18
source_of_truth: decision-record
---

# ADR-0005 转写层录音模态（SayMore careful speech 向）

## Status

Accepted。实现以本仓库 `src/` 与 `docs/architecture/` 为准；若产品语义变更，应更新本 ADR 或新增 superseding ADR。

**文档存放约定**：与本主题相关的架构决策与行为规格**必须**落在本仓库 `docs/adr/` 或 `docs/architecture/`，**不得**仅以 Cursor 编辑器用户目录下的 plan 文件（例如 `~/.cursor/plans`）作为唯一事实来源。

## Context

### 行业参照：SayMore / careful speech

SayMore（SIL）等田野工具强调：**主标注轨**可与**独立 careful speech / 复述录音**并存：同一语言可有「文字层」与「谨慎发音层」，边界与条目不必与主转写一一绑定。解语在「转写层」上引入 **`modality`（`text` | `audio` | `mixed`）与可选 `acceptsAudio`**，用于对齐「同一语言多轨、不同承载形态」的建模，而不强迫滥用层别名。

### 问题域

- 翻译层与转写层都可能需要**边听边录**或**仅音频层**（`audio` / `mixed`）。
- 时间轴上既有 **unit 行**，也有 **segment 行**（独立边界、`time_subdivision` 等）；录音状态与持久化 `unitId` 必须一致，否则 UI 静默失败或录错宿主。
- 重复建层规则：同一 `layerType` + 同一 `languageId` 时，若仅 **modality** 不同（例如一条 `text`、一条 `mixed`），应允许共存；仅当三者都相同才要求别名（见 `LayerConstraintService.getLayerCreateGuard`）。

---

## 决策 1：层模态与「是否支持录音」

| 字段 | 含义 |
|------|------|
| `modality: 'text'` | 默认：无录音 UI；不要求声学。 |
| `modality: 'audio'` | 以音频为主承载；波形轨展示录音控件（紧凑/整卡依 UI）。 |
| `modality: 'mixed'` | 文本 + 声学；波形/纯文本轨在条目中挂载 `TimelineTranslationAudioControls`。 |
| `acceptsAudio?: true` | 在 `modality === 'text'` 时仍可显式打开录音能力（兼容迁移与渐进产品）。 |

**录音门禁（运行时）**：`useRecording.startRecordingForUnit` 要求  
`modality === 'audio' || modality === 'mixed' || acceptsAudio`，否则设置错误文案并返回。

**创建门禁（建层时）**：`getLayerCreateGuard` 在判定「同语言重复层」时纳入 **规范化后的 modality**（与 `layerType`、`languageId` 组合）；不同 modality 不触发「必须别名」。

---

## 决策 2：持久化与读模型键（`recordingScopeUnitId`）

- **持久化与 `translationAudioByLayer` 的键**须与 `useRecording.recordingUnitId` 一致。
- **规则**（`src/utils/recordingScopeUnitId.ts`）：
  - 语段行若存在 **`parentUnitId`**（依附宿主 unit）：录音作用域为 **宿主 id**（与 `listUnitTextsByUnit` 以宿主为入口的 segmentation 读模型对齐）。
  - **独立语段**（无宿主）：作用域为 **语段自身 id**。

---

## 决策 3：segment 行上「录谁」——`resolveVoiceRecordingSourceUnit`

波形与纯文本轨在调用 `startRecordingForUnit` 前必须解析出 **`LayerUnitDocType` 目标**：

1. **`unit` 行**：`unitById.get(utt.id)`。
2. **有 `parentUnitId` 的语段**：优先 `unitById.get(parent)`；宿主可能不在标尺视窗内，故 `TranscriptionTimelineHorizontalMediaLanes` 通过 **`segmentParentUnitLookup`**（当前媒体全部 unit）并入 `unitById` 构建。
3. **无 `parentUnitId` 的独立语段**：宿主解析不可用；从 **`segmentsByLayer` 扁平索引 `segmentById`** 取该语段文档作为 `targetUnit`。

实现入口：`resolveVoiceRecordingSourceUnit`（与 `recordingScopeUnitId` 同文件）。

---

## 决策 4：保存路径与来源标记

- **写入**：`useTranscriptionVoiceTranslationActions.saveVoiceTranslation` → `listUnitTextsByUnit` / `syncUnitTextToSegmentationV2`，并在 `media_items.details.source` 区分  
  **`transcription-recording`** 与 **`translation-recording`**（依 `targetLayer.layerType`）。
- **删除**：`deleteVoiceTranslation` 同目标 unit + layer。

---

## 决策 5：UI 挂载面（便于代码导航）

| 区域 | 文件（示意） |
|------|----------------|
| 波形翻译行 | `TranscriptionTimelineMediaTranslationRow.tsx` |
| 波形转写行 | `TranscriptionTimelineMediaTranscriptionRow.tsx` |
| 波形 lane 组装 | `TranscriptionTimelineHorizontalMediaLanes.tsx`、`TranscriptionTimelineMediaTranscriptionLane.tsx` |
| 纯文本轨翻译格 | `TranscriptionTimelineTextTranslationItem.tsx` |
| 纯文本轨转写格 | `TranscriptionTimelineTextOnly.tsx`（内联 `trcSourceUnit` 与控件） |
| 录音状态机 | `hooks/useRecording.ts` |
| 层创建与重复判定 | `services/LayerConstraintService.ts`、`hooks/useTranscriptionLayerActions.ts`、`components/LayerActionPopover.tsx` |

---

## 后果与回顾点

- **独立边界 + 无宿主语段**：未接 `segmentById` 时会出现「点击录音无反应」；已以 ADR 决策 3 固化修复方向。
- **标尺视窗与全轨 segments**：未合并 `segmentParentUnitLookup` 时宿主可能不在 `unitById`；已合并。
- **后续**：若引入「仅按 segment id 存翻译、不经 segmentation v2 投影」的第二条写入路径，须单独 ADR 说明与迁移策略。

## 被放弃的备选方案（简记）

- **仅用 `timelineRenderUnits` 构建 `unitById`**：在缩放标尺下无法解析 segment 的宿主 → 放弃作为唯一来源。
- **强制独立语段伪造 `parentUnitId`**：污染读模型与 DB 语义 → 放弃；改为显式 `segmentById` 解析。
