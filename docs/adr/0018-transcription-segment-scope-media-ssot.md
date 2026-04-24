---
title: ADR 0018 - 转写页 segment 作用域媒体单一真源
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-23
source_of_truth: decision-record
---

# ADR 0018：转写页 segment 作用域媒体单一真源

## 背景

多占位媒体或「侧栏当前媒体」与「时间轴 unit/segment 行宿主 `mediaId`」不一致时，若仅以 `unitsOnCurrentMedia[0]` 或侧栏选中项作为 segment 图与读模型的媒体键，会出现 segment 查询、时间轴索引、AI 声学上下文与导出 segment 数据错位。

## 决策

1. **基线**：`resolveSegmentScopeMediaId(selectedUnitMedia, selectedTimelineUnit, units, mediaItems)` 与侧栏 / unit 选区 / 首条媒体对齐，在 segment 图加载前即可确定作用域。
2. **精化**：segment 图加载后，若当前选区为 segment 行，则 `resolveSegmentMediaIdFromSegmentGraph(selectedTimelineUnit, segmentsByLayer)` 可反推行级 `mediaId`；与基线不一致时，以图内结果覆盖（`ReadyWorkspace` 用 state 覆盖并复位于基线变化）。
3. **消费方对齐**：`useLayerSegments` / `useLayerSegmentContents` / `useTimelineUnitViewIndex.currentMediaId`、AI 控制器（`scopeMediaItemForAi`）、导入导出（`segmentScopeMediaId` + `activeTimelineMediaItem` 命名与 EAF `mediaItem`）均消费同一精化后的 id 或对应 `MediaItemDocType`。

## 影响

- 新增可选桥接字段：`UseTranscriptionAiControllerInput.scopeMediaItemForAi`、`UseImportExportInput.activeTimelineMediaItem`。
- DEV 下若存在时间对齐层但导出用 `segmentExportMediaId` 仍为空，会 `console.debug` 一次以便排查空轨/未绑定场景。

## 被放弃的备选方案

- **仅导出侧修补**：读模型与 AI 仍用旧 id，继续产生隐性不一致；拒绝。
- **始终要求用户侧栏显式选媒体**：与「时间轴即工作台」交互模型冲突；不作为唯一路径。

## 空轨与仅 segment 导出（产品边界）

**决策（当前有效）**：在 `unitsOnCurrentMedia` 为空（或导出早退）时，**不**增加「仅凭时间对齐层 segment 行自动拼出整包导出」的隐式产品路径。导出仍依赖既有 unit 载荷与 `segmentExportMediaId` 解析；若两者无法推出有效作用域，保持不导出或空载行为，与 `listSegmentTimelineUnitsForLayer` 对译层「无宿主则空轨」的语义一致，避免在无主轨 unit 时推断媒体文件名、时间轴归属与合规边界。

**观测**：开发环境下，若存在时间对齐层但 `segmentExportMediaId` 仍为空，已由实现侧 `console.debug` 单次提示，便于排查数据或选区未就绪，而非对用户作强提示（待产品定义是否升级 UI）。

**若未来产品要求**「纯 segment 项目可导出」：需单独立项，明确默认文件名、媒体绑定、EAF/TextGrid 主轨与审查清单后再改行为；本 ADR 不预先承诺。

## 后续回顾点

- 若出现真实用户场景触发「纯 segment、零 unit」导出需求，新建 superseding ADR 或执行案，并补充集成测试。
