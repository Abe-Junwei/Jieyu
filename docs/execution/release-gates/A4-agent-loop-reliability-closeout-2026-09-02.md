---
title: A4 agent-loop reliability evidence closeout
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-09-02
---

# A4 agent-loop 可靠性证据收口（2026-09-02）

切片：[ai-agent-loop-reliability-improvements](../specs/ai-agent-loop-reliability-improvements/tasks.md)。主路线图 A4 标 ✅。

## 环境矩阵

`aiAgentLoopReliabilityFlagsDefaultEnabled`：dogfood / staging / prod 为 `true`；local/DEV 为 `false`，可用 `VITE_AI_AGENT_LOOP_*` 覆盖。含 compaction flag。

## 命令证据

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 0 err |
| `npx vitest run src/ai/chat/agentLoopReplanning.test.ts src/ai/chat/agentLoopResultQuality.test.ts src/ai/chat/agentLoop.test.ts src/ai/chat/agentLoopClarify.test.ts src/hooks/ai/useAiChat.agentLoopRunner.test.ts src/ai/chat/aiArchitectureIntegration.test.ts` | 6 files / 71 tests pass |
| `npx vitest run src/ai/vertical/verticalWorkflowAudit.test.ts src/hooks/ai/useAiChat.sendTurnStreamPhase.verticalAudit.test.ts src/ai/vertical/verticalWorkflowSelection.test.ts` | envelope `status` write/parse 覆盖 |
| `npm run check:agent-evals:smoke` | 3/3（本 PR 先前提交） |
| `npm run check:agent-evals:trace` | **17/17**，`auditTracePassed=true`，`thresholdPassed=true` |
| `npm run test:e2e:chromium -- tests/e2e/aiAgentLoopHandoffAfterReload.spec.ts` | **3/3**：handoff 单页、handoff 次标签、search-no-results clarify 文案 |
| `npm run check:architecture-guard` | OK（17 hotspot WARN，无新增 hard fail） |

机器报告：`docs/execution/release-gates/release-evidence/agent-evals-report.json`（`:trace` 写出）。

## 代码缺口关闭

Reflection reconcile 后，`runSendTurnStreamVerticalQualityAndFinalize` 把 `envelope.status`（`ready` \| `degraded`）写入 `ai_vertical_workflow_result` audit。旧 NDJSON 行无 `status` 仍可 parse。

`:trace` 依赖的 `ai-tool-decision-audit-export-v1.ndjson` 补回 `policy_pending` recovery seed（`toolreq_runtime_ci_002`，跨日），恢复 requestCount=2 与 `recovery_path` trajectory。

## 未纳入本切片

- A4b JIT / effort scaling（Wave 2，依赖本证据）
- A7 剩余 A11 preview→commit；A10 Runner
- Nightly Firefox/WebKit 全量 E2E
