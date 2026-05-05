---
title: AI 变更事务预览 DTO（v1）
doc_type: architecture
status: active
owner: ai-governance
last_reviewed: 2026-05-01
source_of_truth: ai-change-transaction-preview
depends_on:
  - ./ai-chat-tool-confirm-idempotency.md
  - ../execution/plans/AI智能体-战略规划与下一步-2026-05-07.md
---

# AI 变更事务预览 DTO（v1）

T3-a 交付物：在 **不改变默认确认 UI 路径** 的前提下，为「待确认工具调用」提供 **与 `AiChangeSet` / 预览行同源** 的结构化快照，便于后续 T3-b dry-run 与 T3-c commit 审计对齐。

## 类型与构造函数

- **`AiChangeTransactionPreviewV1`**、**`buildAiChangeTransactionPreviewV1`**：`src/ai/changeset/aiChangeTransactionPreviewV1.ts`
- **子步摘要**：`summarizeAiChatToolArgumentsForPreview`（`src/ai/changeset/AiChangeSetProtocol.ts`），与 `buildAiChangeSetFromPendingToolCall` 内 `propose_changes` 子步 `after` 字段使用同一套截断规则。

## 与现有 UI 的对应关系

| DTO 字段 | 现状 UI / 数据来源 |
|----------|-------------------|
| `headline` | 与 `buildAiChangeSetFromPendingToolCall` → `AiChangeSet.description` 一致 |
| `childSteps[]` | `propose_changes` 时与 `AiChangeSet.changes` 行一一对应；`single_tool` 时为单工具展开（`targetId` 来自 `previewContract.affectedIds` 或 `__scope__`） |
| `impactPreviewSourceLines` | `PendingAiToolCall.impactPreview` 的拷贝；**展示**仍由 `AiChatAlertsPanel` 的 `normalizeImpactPreviewLines` + 截断负责 |
| `changeSetSummaryId` | 每次调用 `buildAiChangeTransactionPreviewV1` 内部生成的 `AiChangeSet.id`（与另一次独立调用 `buildAiChangeSetFromPendingToolCall` 的 id **不一定**相同，仅用于同一次构建内的关联） |

## T3-b：确认路径 dry-run 钩子

- **入口：** `dryRunToolCallForConfirm`（`src/ai/chat/toolCallDryRun.ts`）。
- **调用方：** `executeConfirmedToolCall`、`executeConfirmedProposedChangeBatch`（`useAiChat.confirmExecution.ts`）在写库 / `onToolCall` 之前只做只读校验时走该入口。
- **与 `validateToolCallArguments` 分工：** dry-run **编排**确认路径；`validateToolCallArguments` 仍为 **参数契约**（Zod + legacy）实现，由 dry-run 的 `args_schema` 阶段委托。**自动发送路径**（`resolveToolDecisionPipeline` 等）仍直接调用 `validateToolCallArguments`，不经过本钩子（避免把「意图执行前校验」绑到「人工确认 dry-run」语义上）。

## 非目标（v1）

- 不替代 `PendingAiToolCall` 存储；不写入 Dexie 新表。
- 不要求 UI 已改为消费 DTO（T3-a 仅类型 + 构建器 + 单测）。

## 修订记录

| 日期 | 变更 |
|------|------|
| 2026-05-01 | 初版：T3-a `AiChangeTransactionPreviewV1` 与构建器、`summarizeAiChatToolArgumentsForPreview` 导出说明。 |
| 2026-05-01 | T3-b：`dryRunToolCallForConfirm` 与确认路径接线说明。 |
| 2026-05-01 | T3-c：`markExecutedRequestId` 顺序见 `ai-chat-tool-confirm-idempotency.md` §实现锚点。 |
