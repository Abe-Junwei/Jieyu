---
title: ADR 0025 — propose_changes 确认路径回滚与 B2 结构性工具边界
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-26
source_of_truth: decision
---

# ADR 0025 — `propose_changes` 确认路径回滚与 B2 结构性工具边界

## 背景

人工确认执行 `propose_changes` 时，子工具按序执行；若中途失败，应对已成功子步提供的 `rollback` 回调做**逆序**调用，以避免半应用状态。文本类、词元与 `auto_gloss` 等已在实现中提供可逆快照。

结构性工具（如 `split_transcription_segment`、`merge_transcription_segments`、`delete_transcription_segment`）涉及时间轴行与多表一致性；除已明确契约的路径外，**对称逆操作**要么不存在于单一 API，要么依赖用户可见的 Undo 栈与层路由，不适合在无显式契约下与 AI 批量子步回滚混用。

## 决策

1. **确认路径契约（已实现）**：`executeConfirmedProposedChangeBatch` 在子步校验失败、`ok: false` 或异常时，对已收集的 `rollback` 列表**从尾到头**执行；仅在**全部子步成功**后调用 `markExecutedRequestId(parent.requestId)`。该行为由 `src/hooks/useAiChat.confirmExecution.ts` 承载，并由 `src/hooks/useAiChat.confirmExecution.proposeBatch.test.ts` 防回归。
2. **B2 范围与白名单**：白名单式补偿回滚覆盖「可局部还原、副作用边界清晰」的子工具（文本、清翻译、词性/分词、`auto_gloss` 的 link 级撤销等）。**段层** `split_transcription_segment`（显式 `segmentId` + `splitTranscriptionSegment` 走 `dispatchTimelineUnitMutation` 的 segment-layer 分支）在拆段成功后，由 `splitRouted` 返回 `{ keepSegmentId, removeSegmentId }`（来自 `splitSegment` 的 `first`/`second`），`segmentAdapter` 在同时注入 `mergeAdjacentSegmentsForAiRollback` 时注册 `rollback`（内部调用 `mergeAdjacentSegments` + `reloadSegments`，**不**压入用户撤销栈）。**unit-doc** 拆段仍不提供对称 AI 回滚（见 ADR-0026 后续回顾点）。**merge / delete（含 `allSegments`）在具备 `silentSegmentGraphSyncForAi` 时的全路径可逆**由 ADR-0026 与 `AiCanonicalClusterRollbackSnapshot` 承载，不再视为「无补偿」默认。
3. **`auto_gloss` 与读模型**：回滚以 DB/服务层 `removeTokenLexemeLinksByIds` 等为源；若 UI 读路径缓存与持久层短暂不一致，按一般数据刷新策略处理，**不**在 B2 单独引入第二套事务外补偿状态机。

## 影响

- 新子工具纳入 `propose_changes` 时：若需要失败回滚，应在该子工具执行结果上提供 `rollback`，并补充单测。
- E2E 覆盖 `propose_changes` 全链路成本高时，以 **confirmExecution 批处理单测** + 子 adapter 单测为主防线。

## 被放弃的备选方案

- **在未打通 id 与层路由契约前强行做结构性回滚**：易产生错合并或错层；已通过显式 token + ReadyWorkspace 注入的 `mergeAdjacentSegmentsForAiRollback` 收窄该风险。

## 后续回顾点

- **unit-doc** 路径拆段是否暴露对称 API 供 AI 回滚。
- **merge / delete** 批量与 `allSegments` 的 epoch/并发语义是否在规模化项目下需加强（ADR-0026 当前以捕获时刻为准）。
