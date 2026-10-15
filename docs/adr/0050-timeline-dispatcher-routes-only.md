---
title: ADR 0050 - 时间轴 dispatcher 只选写入路径
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: decision-record
---

# ADR 0050：时间轴 dispatcher 只选写入路径

## 状态

accepted。不改 [ADR-0009](./0009-greenfield-timeline-single-source-freeze.md)。

## 背景

`src/pages/timelineUnitMutationDispatch.ts` 只在 unit-doc 与 segment-layer 之间选分支。一次架构审查把它看成浅模块，建议由它统一执行拆分、合并、删除的 Undo、reload 和选中。

两条路径的写后职责不同。unit 动作已经在下层完成 Undo、状态更新和选中，失败时抛出。segment-layer 在调用方做 reload、快照刷新和选中，返回 AI 回滚 token，失败时返回 undefined，过期的 reload 不再选中。再套同一套步骤会重复压入 Undo，并可能覆盖选中结果。

## 决策

1. `dispatchTimelineUnitMutation` 与 `dispatchTimelineUnitSelectionMutation` 只决定写入去向：视图行是 unit 走 unit-doc；当前层是 independent-segment 或 time-subdivision 走 segment-layer。
2. dispatcher 不拥有两条路径共同的写后生命周期。unit-doc 的 Undo、状态更新和选中留在 unit 动作里。segment-layer 的 Undo、reload、过期判断、快照刷新、选中和 AI 回滚 token 留在 Segment 路径。
3. 以后可以只收拢 Segment 路径内部重复的写后步骤。那次收拢必须保持：Segment 继续返回 AI 回滚 token，unit 路径继续返回 undefined；segment 失败返回 undefined，unit 失败继续抛出；过期 reload 不再选中。
4. 「接口浅」或「删掉 dispatcher 复杂度会回到调用方」不能作为让它接管两套生命周期的理由。删掉它会把路由规则散回调用方；生命周期本来就在各自路径里。

## 影响

- 架构审查不要再建议一个模块对 unit-doc 和 segment-layer 执行同一套写后步骤。
- ADR-0009 的两条写入路径和 canonical 坐标保持不变。

## 被放弃的备选方案

1. 让 dispatcher 对两条路径执行同一套 Undo、reload 和选中。
2. 因为 dispatcher 只选分支就删掉它。
3. 为了统一失败形态，把 segment 失败改成抛出，或把 unit 失败改成返回 undefined。
