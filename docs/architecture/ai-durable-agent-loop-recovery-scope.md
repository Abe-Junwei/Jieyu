---
title: Durable agent-loop recovery — scope and limits
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-05-01
source_of_truth: ai-agent-loop-recovery
---

# Durable agent-loop recovery — scope and limits

This document states what the desktop app **does** and **does not** promise when resuming an `agent_loop` task that was handed off after a token-budget warning (`handoffReason: token_budget_warning`).

## Authoritative sources

- **Durable state:** `ai_tasks` rows written by `persistAgentLoopCheckpointTask` / updated by `TaskRunner` heartbeat paths.
- **Session UX state:** `jieyu.aiChat.sessionMemory` (`pendingAgentLoopCheckpoint`), reconciled on chat hook mount with IndexedDB (`useAgentLoopSessionMemoryDexieReconcile` → `reconcilePendingAgentLoopCheckpointFromDexie`).
- **Deferred UI bridge:** `useDeferredAiRuntimeBridge` includes `pendingAgentLoopCheckpoint` in the AI state worker slice fingerprint so sidebar / chat浮窗在冷启动水合后能立刻拿到新 `sessionMemory`（不仅依赖 settings 指纹）。

## Cold start (no session checkpoint)

On `useAiChat` mount, if session memory has **no** `pendingAgentLoopCheckpoint`, the runtime loads the **latest** pending resumable `agent_loop` row from `ai_tasks` (same predicate as `loadLatestPendingAgentLoopCheckpoint`) and mirrors it into session memory so alerts / composer affordances stay aligned with durable state after refresh.

**Not promised:**

- **Multiple concurrent pending handoffs:** only one checkpoint is mirrored into session memory — the row with the greatest `updatedAt` among pending resumable `agent_loop` tasks. Older pending rows remain visible in the embedding task list until completed, cancelled, or superseded in DB.
- **Cross-device sync:** `ai_tasks` is local IndexedDB only; another browser profile or machine does not see the same queue.
- **Non–token-budget handoffs:** tasks whose `handoffReason` is not `token_budget_warning` are outside the resume contract enforced by `agentLoopCheckpoint.ts`.

## Session checkpoint with `taskId`

If session memory already contains `pendingAgentLoopCheckpoint.taskId`, mount reconciliation **reloads** that row from `ai_tasks`. If the row is no longer pending resumable, the checkpoint is **removed** and reconciliation **runs again** without that field so a **different** latest pending `agent_loop` row (if any) can hydrate — covering another tab completing/cancelling the old task while this tab still had a stale `taskId`.

**Not promised:** live cross-tab UI sync without navigation. Tabs that stay open do not re-read `localStorage` until a remount/reload; use refresh or reopen the chat surface if another tab changed durable state.
