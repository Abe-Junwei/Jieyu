---
title: ai-agent-loop-reliability-improvements requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-05-17
source_of_truth: ai-agent-loop-reliability-improvements-spec
---

# Requirements — AI Agent Loop 可靠性改进

> 关联审计：[ai-agent-architecture-risk-assessment-2026-05-17](../../audits/ai-agent-architecture-risk-assessment-2026-05-17.md)

## 1. What & Why

- **要做什么**：Agent Loop 闭环重规划、工具结果质量校验、上下文预算再分配、用户侧 explainability（审计 P0–P2 主路径）。
- **为什么现在做**：`routingPlan` 在 loop 内不变，初始 `queryFamily` 误判无法纠正；搜索 0 条会误触发 answer-ready。
- **不做什么**：不改 `toolDecisionPipeline` 调用前管控；不改 `sessionMemory` Dexie（见 [AI对话会话管理落地方案](../../plans/AI对话会话管理落地方案-2026-05-16.md)）；不多 Agent 并行；**不做** per-tool 权限矩阵细化（审计 Security P2，另 spec）；**不做** 运行时 tool 参数相似度去重 / action history tracking（审计有界空转 P2，后续 spec）。

## 2. 用户场景

1. 句段不存在时：规则引擎 `replan`→`search` 或 `clarify`，而非因 `ok: false` 直接停 loop（见 design §2.1 顺序）。
2. 搜索 0 条：不早停；continuation 标注无匹配，回复不编造。
3. 跑满 `maxSteps`：末尾说明已达上限及如何继续。

## 3. 验收标准

- [ ] `agentLoopReplanning.test.ts`：search `count===0` → `clarify`；`get_unit_detail` `unit not found` → `replan`→`search`
- [ ] `agentLoop.test.ts`：`isAnswerReadyForSearchQuery` 在 `count===0` 时为 false（flag 开）
- [ ] `agentLoopResultQuality.test.ts`：空结果 continuation 含 `empty_result`
- [ ] flag 开时 `agentLoopRunner` 每步用 `contextBudget`/`estimateRemainingLoopTokens` 调整 `historyCharBudget`
- [ ] 跑满 `maxSteps` 时正文附加 i18n `agentLoopMaxStepsReached`（经 `aiChatCardMessages`）
- [ ] 工具失败区分可重试 vs 参数错误（`classifyAgentLoopToolFailure`）
- [ ] `npm run typecheck`；`npx vitest run src/ai/chat/agentLoop*`；`npx vitest run src/hooks/ai/useAiChat.agentLoopRunner.test.ts`

## 4. 受影响代码地图

| 类别 | 路径 | 改动 |
| --- | --- | --- |
| Service | `src/ai/chat/agentLoopReplanning.ts` | 新增 |
| Service | `src/ai/chat/agentLoopResultQuality.ts` | 新增 |
| Service | `src/ai/chat/agentLoop.ts`、`agentLoopRunner.ts` | 修改 |
| Service | `src/ai/chat/formatters/agentLoopPayload.ts` | 质量标注 |
| Service | `src/ai/chat/contextBudget.ts` | 可选 `recalculateStepHistoryBudget` |
| Config | `src/ai/config/featureFlags.ts` | 3 flags |
| i18n | `dictKeys` + dictionaries + `aiChatCardMessages.ts` | 新键 |
| 测试 | `agentLoopReplanning.test.ts`、`agentLoopResultQuality.test.ts`、`useAiChat.agentLoopRunner.test.ts` | 新增/扩展 |

## 5. 已知风险与依赖

- flag 关闭时行为与现网一致；`shouldContinueAgentLoop` 新参可选
- **顺序**：须先 `evaluateReplanningNeed` 再应用「全失败即停」（design §2.1）
- 不破坏 `aiArchitectureIntegration.test.ts`
- 依赖：`contextBudget`、`historyTrim`、`LocalToolRoutingPlan`（`localToolSlotTypes.ts`）

---

*Created: 2026-05-17 · Revised: 2026-05-17（SDD 审查修正：补充有界空转 scope 排除）*
