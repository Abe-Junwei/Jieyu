---
title: ai-agent-loop-reliability-improvements tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-05-17
source_of_truth: ai-agent-loop-reliability-improvements-spec
---

# Tasks — AI Agent Loop 可靠性改进

> 关联文档：[requirements.md](requirements.md) | [design.md](design.md)

---

## Phase 1: P0 — 闭环重规划 ✅ landed 2026-06-01（flag 默认 false）

| # | 任务 | 文件 | 验证 |
|---|------|------|------|
| 1.0 | ✅ 顺序修复：先 `evaluateReplanningNeed`，再 `shouldContinue`；`getLoopStepTaskState` 读 `currentRoutingPlan` | `agentLoopRunner.ts` | `useAiChat.agentLoopRunner.test.ts`（search 0 clarify） |
| 1.1 | ✅ `evaluateReplanningNeed` + 规则表 | `agentLoopReplanning.ts` | `agentLoopReplanning.test.ts` |
| 1.2 | ✅ 单测：search 0、detail 不存在、abort、last step | `agentLoopReplanning.test.ts` | 全 pass |
| 1.3 | ✅ `isAnswerReadyForSearchQuery`：flag 开时要求 `count > 0` | `agentLoop.ts` | `agentLoop.replanning.test.ts` |
| 1.4 | ✅ `shouldContinueAgentLoop` 可选 `replanningDecision` + `closedLoopReplanningEnabled` | `agentLoop.ts` | `agentLoop.replanning.test.ts` |
| 1.5 | ✅ flag `aiAgentLoopClosedLoopReplanningEnabled` | `featureFlags.ts` | `typecheck` |
| 1.6 | ✅ clarify 文案 + `waiting_clarify` taskSession（`agentLoopClarify.ts`） | `agentLoopExplainability.ts`, `agentLoopClarify.ts`, `aiChatCardMessages.ts` | runner clarify test |

> **落地记录（2026-06-01）**：验证 `typecheck` 0 err；`agentLoopReplanning` + `agentLoop.replanning` + runner clarify 测试全 pass；`check:agent-evals:smoke` 3/3；`check:architecture-guard` 全绿（含 public-surface 白名单对齐）。

---

## Phase 2: P1 — 工具结果质量校验 ✅ landed 2026-06-01（flag 默认 false）

| # | 任务 | 文件 | 验证 |
|---|------|------|------|
| 2.1 | ✅ `assessToolResultQuality` / `annotateToolResult`（empty_result / search_no_results / tool_failed） | `agentLoopResultQuality.ts` | `agentLoopResultQuality.test.ts`（9 pass） |
| 2.2 | ✅ 在 `buildAgentLoopContinuationToolPayload` 写入 `quality` 元字段（**未改** 三参签名；新增可选 `quality` 内部参；flag 关时整体省略字段 → 输出逐字节一致） | `formatters/agentLoopPayload.ts` | `agentLoopPayload.qualityGate.test.ts` / `…qualityGateOff.test.ts`（3 pass） |
| 2.3 | ✅ flag `aiAgentLoopToolResultQualityGateEnabled`（+ env override `VITE_AI_AGENT_LOOP_TOOL_RESULT_QUALITY_GATE_ENABLED`） | `featureFlags.ts` | `typecheck` |

> Phase 1.3 已处理 search 早停；本 phase 负责 continuation 内 `empty_result` 等标注。
> **落地记录（2026-06-01）**：作为 verify 步首个可发布单元实现。验证：typecheck 0 err；新增 12 + 邻接回归 82 测试全 pass；`check:agent-evals:smoke` 3/3。

---

## Phase 3: P1 — 上下文预算再分配 ✅ landed 2026-06-01（flag 默认 false）

| # | 任务 | 文件 | 验证 |
|---|------|------|------|
| 3.1 | ✅ `recalculateStepHistoryCharBudget` + `historyBudgetTokensFromCharBudget` | `contextBudget.ts` | `contextBudget.test.ts` |
| 3.2 | ✅ runner 每步动态 `historyCharBudget`（`recentRounds` 仍 ≥ 2 下限） | `agentLoopRunner.ts` | `aiArchitectureIntegration.test.ts` 回归 |
| 3.3 | ✅ flag `aiAgentLoopContextBudgetRecalculationEnabled` | `featureFlags.ts` | `typecheck` |

---

## Phase 4: P2 — 用户侧 Explainability ✅ landed 2026-06-01（随 replanning flag）

| # | 任务 | 文件 | 验证 |
|---|------|------|------|
| 4.1 | ✅ clarify / maxSteps / retryable / detail 文案 via `aiChatCardMessages` | `aiChatCardMessages.ts` | runner tests |
| 4.1b | ✅ detail replan 文案在 loop 结束后 append（防 continuation 覆盖） | `agentLoopRunner.ts` | detail replan runner test |
| 4.2 | ✅ `classifyAgentLoopToolFailure`；maxSteps / abort 时 append | `agentLoopResultQuality.ts`, `agentLoopExplainability.ts`, `agentLoopRunner.ts` | `agentLoopResultQuality.test.ts`, `useAiChat.agentLoopRunner.test.ts` |
| 4.3 | ✅ clarify 分支与 `messageKey` 对齐（Phase 1 已接） | `agentLoopRunner.ts` | search 0 clarify test |

> **落地记录（2026-06-01）**：Explainability 随 `aiAgentLoopClosedLoopReplanningEnabled` 启用（spec §4 无独立第 4 flag）。验证：`contextBudget` + `classify` + runner max-steps/abort 测试全 pass。

---

## 范围外（另 spec）

**per-tool 权限矩阵 / `destructiveGate` 细化** — 原 Phase 5 已移出；审计 Security P2，现有 `getAiToolPolicy` 已 per-tool，不在本 spec 实施。

---

## 跨阶段验证

| # | 命令 | 期望 |
|---|------|------|
| V1 | `npm run typecheck` | 0 errors |
| V2 | `npx vitest run src/ai/chat/agentLoopReplanning.test.ts src/ai/chat/agentLoopResultQuality.test.ts src/ai/chat/agentLoop.test.ts` | pass |
| V3 | `npx vitest run src/hooks/ai/useAiChat.agentLoopRunner.test.ts src/ai/chat/aiArchitectureIntegration.test.ts` | pass |
| V4 | `npm run check:agent-evals:smoke` | OK |
| V5 | `npm run check:architecture-guard` | OK |
| V6 | `npm run check:docs-governance` | OK |
| V7 | 触及 AI 聊天 UI 时：`npm run test:e2e:chromium`（定向用例，非全量必跑） | green |

---

## 提交指南

每 phase 独立 commit；msg 附验证命令与 pass 摘要。

---

*Created: 2026-05-17 · Revised: 2026-05-17（SDD 审查勘误）*
