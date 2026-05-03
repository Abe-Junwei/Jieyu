---
title: AI 聊天工具确认与 requestId 幂等
doc_type: architecture-spec
status: active
owner: repo
last_reviewed: 2026-05-02
source_of_truth: ai-chat-tool-audit
---

# AI 聊天：工具确认路径与 requestId 幂等

本文描述转写侧 AI 聊天中 **人工确认执行** 与 **`hasPersistedExecutionForRequest`** 的契约，供实现与单测对齐。

## 实现锚点（T3-c）

- **单工具确认：** `finalizeHumanToolCallConfirmOutcome`（`src/hooks/useAiChat.confirmExecution.ts`）固定顺序：`applyAssistantMessageResult` → `writeToolDecisionAuditLog`（`executed` 与 outcome 一致）→ 仅成功时 `markExecutedRequestId`。
- **父级 `propose_changes` 全成功：** `finalizeHumanProposeChangesParentConfirmSuccess` 同上，父级 `markExecutedRequestId` 仅在 **`confirmed` 且 `executed: true`** 的决策审计写入之后。

## 父级 `propose_changes`

- **`markExecutedRequestId(parentCall.requestId)`** 仅在 **全部子工具成功** 后调用（内存去重集）。
- **部分失败**（`invalid_child_args` / `child_failed` / `exception`）时，父级审计 `buildToolDecisionAuditMetadata` 的 **`executed` 必须为 `false`**：  
  子步可能已写库并触发补偿 `rollback`，但父请求 **未完成**，用户应能 **使用同一父 `requestId` 再次确认**（重试同一批 `propose_changes`）。
- **部分进度** 用 `executionProgress`（`appliedCount` / `totalCount` / `partial`）与 `proposeRollback` 表达；不得用 `executed: true` 代替「有子步曾成功」。

## `hasPersistedExecutionForRequest(requestId)`

实现见 `src/hooks/useAiChat.toolAudit.ts`：

1. 先查内存 `executedRequestIds`。
2. 再查 Dexie `audit_logs`，`[collection+field+requestId] = ['ai_messages','ai_tool_call_decision', requestId]`。
3. 若行上存在可解析的 **`metadataJson.phase === 'decision'`**，则以 **`metadata.executed === true`** 为唯一依据（不再用 `newValue` 启发式覆盖）。
4. **无 metadata 的行**：回退解析紧凑形态 `confirm_failed|auto_failed:<toolName>:<reason>`。`confirmed` / `auto_confirmed` 视为已提交。`confirm_failed` / `auto_failed` 仅在 **reason 不在「未提交副作用」白名单**（实现为 `NON_PERSISTED_TOOL_DECISION_REASONS`，含 `child_failed`、`invalid_child_args`、`exception`、门控类 `user_directive_*` / `stale_read_model` / `invalid_proposed_changes` 等）时视为已持久化；其余 reason 仍保守视为已提交，以免未知旧码误判为可重试。新写入应始终带结构化 `metadataJson`。

## T4-a：失败 reason 枚举与运维分流

- **真源模块：** `src/ai/chat/toolDecisionFailureReason.ts`（`NON_PERSISTED_TOOL_DECISION_REASONS`、`TOOL_DECISION_METADATA_REASON_CODES`、`TOOL_DECISION_REASON_FAILURE_TRIAGE`、`getToolDecisionFailureTriage`、`parseCompactToolDecisionReasonFromNewValue`）。
- **幂等回退消费：** `src/hooks/useAiChat.toolAudit.ts` 从该模块导入 `NON_PERSISTED_TOOL_DECISION_REASONS`，与紧凑 `newValue` 第三段对齐。
- **UI 策略文案：** `metadata.reason` 中用户指令类码与 `src/ai/chat/policyReasonLabels.ts` 对齐；门控挂起的 `policyReasonCode`（如 `explicit_target_write_requires_confirmation`）亦纳入 `TOOL_DECISION_METADATA_REASON_CODES` 以便分流与观测一致。
- **分流语义：** `retry` / `clarify` / `human` / `abandon` 为运维提示；自动重试（T4-c）仅允许在显式白名单 reason 上扩展，不得弱化幂等与 destructive gate。

### T4-b：发布证据中的聚合信号

- **报告字段：** `generate-release-evidence-bundle.mjs` 产出 `toolDecisionFailureSignals`（`failureSignals.triageCounts`、`partialExecutionProgressRows`、`rollbackErrorCountBuckets`）并与 `durableOrchestration` 的 `humanInterventionRate` / `handoffReasons` 交叉展示。
- **证据索引：** `evidenceIndex` 含 `t4.tool-decision-failure-signals.v1`；Node 侧 triage 与 `toolDecisionFailureReason.bundle.mjs` 对齐，Vitest `toolDecisionFailureReason.bundleParity.test.ts` 防漂移。

### T4-c：确认路径执行器自动重试（默认关）

- **开关：** `featureFlags.aiToolCallExecutorAutoRetryEnabled`（`src/ai/config/featureFlags.ts`）。
- **行为：** `executeConfirmedToolCall`（`useAiChat.confirmExecution.ts`）在 **非破坏性** 工具上，对 **`onToolCall` 抛错/超时** 最多再调用 **一次**；**不**重试 `result.ok === false`；**不**覆盖 `propose_changes` 父级批量路径。

## 子工具 `requestId`

`propose_changes` 子步使用 `genRequestId(child, …)` 生成的 **独立** `requestId`；与父级幂等判读无关。
