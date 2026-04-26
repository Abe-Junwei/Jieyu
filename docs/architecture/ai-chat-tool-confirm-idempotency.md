---
title: AI 聊天工具确认与 requestId 幂等
doc_type: architecture-spec
status: active
owner: repo
last_reviewed: 2026-04-26
source_of_truth: ai-chat-tool-audit
---

# AI 聊天：工具确认路径与 requestId 幂等

本文描述转写侧 AI 聊天中 **人工确认执行** 与 **`hasPersistedExecutionForRequest`** 的契约，供实现与单测对齐。

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
4. **无 metadata 的旧行**：回退到 `newValue` 前缀规则（例如 `confirmed:` / 部分 `confirm_failed:` 仍视为已持久化）。旧数据上 **`confirm_failed:propose_changes:child_failed` 无 metadata 时仍可能判为已执行**——迁移或清审计前需注意；新写入应始终带结构化 metadata。

## 子工具 `requestId`

`propose_changes` 子步使用 `genRequestId(child, …)` 生成的 **独立** `requestId`；与父级幂等判读无关。
