---
title: ADR 0020 — Unscoped canonical units vs transcription lane read scope
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-23
source_of_truth: architecture-decision
---

# ADR 0020：canonical unit 无 `layerId` 与转写轨「读作用域」

## 背景

- `projectUnitDocFromLayerUnit` 等读模型投影常**省略** `unit.layerId`（unscoped），但同一条 unit 仍属于当前媒体上的转写时间轴。
- 多转写层存在 **依赖树**（`parentLayerId`）时，若消费方只用 `unit.layerId === laneId` 过滤，**依赖轨**会误判为「无数据」（例如纵向对读源行）。
- 持久化与写链仍以 **显式 layer / segment 路由** 为准；问题集中在 **读 / 展示 / 按轨分组**。

## 决策

1. **单一读侧入口**：凡「按轨解释 canonical / unscoped unit」须使用 `src/utils/transcriptionUnitLaneReadScope.ts` 中的 `resolveCanonicalUnitForTranscriptionLaneRow`（或经其封装的 hook），**禁止**在业务里复制「只认 `primaryUnscopedHostId`」或散写父链遍历。成功分支的类型为 `LaneScopedUnitView`（`row` + `resolution`），供组件 props 等窄化使用。
2. **读写分离**：该解析仅用于 **display / 源行遍历 / 分组**；**写库、AI 采纳、协作 payload** 不得把「为展示而 stamp 的 `layerId`」当作持久化真值，须沿用既有 `saveUnitText`、segment 与层动作的路由。
3. **展示 stamp**：当 unit 因「默认宿主树」或「显式挂在树父轨」而出现在子依赖轨上时，可对 **内存行** 打上当前轨 `layerId`，以便 UI 与 `getSourceText` 一致；不改变 Dexie 中 canonical unit 的存储语义。

## 影响

- 纵向对读等非 segment 轨路径应调用上述模块（已实现：`resolveVerticalReadingGroupSourceUnits`）。
- 未来标注页、其他按轨列表在消费 `listUnitDocsFromCanonicalLayerUnits` 时，若需按轨过滤，应复用同一规则，避免与转写页漂移。
- `buildTimelineUnitViewIndex` 在传入 `transcriptionLaneReadScope` 时，会填充 `byLayer` 中各转写轨的 canonical 镜像；`useTranscriptionAiController` 将 `byLayer` 注入 AI `shortTerm.timelineUnitsByLayerId`，供 `intentTools` / `localContextTools` 的 **current_scope** 按轨筛选。

## 被放弃的备选方案

- **全局投影默认附带 `layerId`**：同一 unit 多轨镜像时易产生 **id 重复行** 或与 `Map<id, unit>` 冲突；否决作为默认读模型。

## 后续回顾点

- 若新增「按轨」消费点，PR 是否调用 `transcriptionUnitLaneReadScope` 或写明 N/A（仅 segment 行等）。
- 深链 `unitId` + `layer` 与读作用域解析是否同一套输入（联评 R6）。

## 工程闸

- `npm run check:transcription-lane-read-scope`：断言纵向 resolver、时间轴 `byLayer` enrich、Ready 接线、AI `timelineUnitViewIndex` 仍在主干上（防回归删改）。
