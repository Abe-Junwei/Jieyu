---
title: ADR-0019 首次绑定声学时的时间轴压缩（占位晋升路径）
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-23
source_of_truth: decision-record
---

# ADR-0019 首次绑定声学时的时间轴压缩（占位晋升路径）

## Status

Accepted。对 [ADR-0004](./0004-logical-timeline-acoustic-media-lifecycle.md) **决策 2** 中「导入路径不得未经用户确认对全体语段做 D 类缩放」的**例外**：用户通过 `importAudio` 将**占位/文献轨**晋升为第一条可播放声学轨时，视为已确认将项目锚定到该文件时长。

## Context

占位模式下 `logicalDurationSec` 与语段可远超首段真实音频。若在晋升后仍保留原绝对秒，波形与播放器上界与 `layer_units` 严重错位。删音路径（`deleteAudioPreserveTimeline`）则 intentionally 保留坐标以延续文献编辑。

## 决策

1. **触发**：`LinguisticService.importAudio` 在 `shouldPromotePlaceholders === true`（含 replace 到占位）且已向目标 `media_id` 写入声学 `duration > 0` 之后执行。
2. **度量**：`L = max(该 mediaId 下 layer_units 的最大 endTime, texts.metadata.logicalDurationSec)`。
3. **条件**：仅当 `L > duration`（文件秒数，容差 `1e-6`）时重映射；否则不改坐标。
4. **变换**：对同一 `mediaId` 下所有 `layer_units` 与 `anchors.time`：`t1 = t * (duration / L)`，再整体平移使 `min(startTime)` 为 0；右端钳制到 `[0, duration]`；时间保留三位小数与现有写入一致。
5. **元数据**：重映射后 `texts.metadata.logicalDurationSec = max(duration, maxUnitEndAfter, 1)`，不再与旧逻辑长取「盲目 max」以免画布长于文件。
6. **删音**：仍遵守 ADR-0004 **决策 3**（`deleteAudioPreserveTimeline`）：移除可播放载荷，**不**删除 `layer_units`；UI 文案须与此一致。

## 后果

- 再导入第二条声学轨（`importMode: 'add'`）不在本 ADR 范围内；默认不重映射已存在声学轨上的坐标。
- 若未来提供「导入前预览 / 取消自动缩放」，属产品扩展，不改变本 ADR 默认。

## 被放弃的备选

- **仅阻止导入**（ADR-0004 表 A）：对纯文本长轴工作流摩擦过大。
- **仅标红越界**（表 B）：首绑声学时仍留大量不可播区间，首体验差。

## 回顾点

- 与显式 `timeMapping` 同时启用时的顺序与优先级。
- `time_subdivision` 父句段时间是否需与子 segment 联动校验（当前与 `layer_units` 同批缩放）。
