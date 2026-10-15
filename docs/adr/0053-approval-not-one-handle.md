---
title: ADR 0053 - 审批不收成一次 handle
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: decision-record
---

# ADR 0053：审批不收成一次 handle

## 状态

accepted。不改 [ADR-0032](./0032-transcription-ai-chat-floating-window-only.md)。

## 背景

一次架构审查建议用 `handle(conversationId, action)` 藏起 TTL、指纹、审批结果和下一张卡片。`src/ai/runtime/aiRuntimeV2Pending.ts` 里的 `resolveApproval` 已经读取有效状态、核对目标指纹、执行或拒绝、持久化结果，并返回下一张卡片。`expireApprovalIfStale` 只核对并关闭过期审批。`restoreFirstUnanswered` 在重载后按指纹恢复或关闭第一张未答复卡片。

调用方剩下的是界面和批处理。普通确认过期后还会显示下一张卡片。`propose_changes` 先跑批处理，过期后直接返回，不显示下一张。重载恢复用卡片上的 `assistantMessageId`，并且不走同一套任务状态。同页 epoch 仍由调用方核对。

## 决策

1. 不新增 `handle(conversationId, action)`。审批生命周期留在 `resolveApproval`、`expireApprovalIfStale` 和 `restoreFirstUnanswered`。
2. 同页 epoch、任务状态、助手消息和 `propose_changes` 批处理留在调用方。
3. 过期后的 `expired_stale` 审计和「审批已过期」文案不抽成共享函数。三处的下一张卡片和任务状态不同。

## 影响

- 架构审查不要再建议把审批收成一次 `handle`。
- 架构审查不要再建议把三处过期提示收成一个函数。
- ADR-0032 的浮窗确认保持不变。

## 被放弃的备选方案

1. 一个 `handle` 同时做指纹、执行、持久化、下一张卡片、任务状态和助手消息。
2. 把过期审计和过期文案抽成三处共用的函数。
