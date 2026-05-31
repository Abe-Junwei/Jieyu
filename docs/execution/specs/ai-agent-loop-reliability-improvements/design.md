---
title: ai-agent-loop-reliability-improvements design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-05-17
source_of_truth: ai-agent-loop-reliability-improvements-spec
---

# Design — AI Agent Loop 可靠性改进

> 关联文档：[requirements.md](requirements.md) | [tasks.md](tasks.md)

## 1. 架构概览

四层：**重规划（P0）** → **质量门（P1）** → **预算再分配（P1）** → **Explainability（P2）**。均在 `runAgentLoop` 内、feature flag 后接入。

```
finalizeAssistantStreamCompletion
        │
        ▼
 evaluateReplanningNeed (flag: replanning)  ──► currentRoutingPlan / clarify / abort
        │
        ▼
 assessToolResultQuality (flag: quality)     ──► buildAgentLoopContinuationToolPayload
        │
        ▼
 recalculateStepHistoryBudget (flag: budget) ──► trimHistoryByChars
        │
        ▼
 shouldContinueAgentLoop (含 replan 结果，非盲目 !ok 即停)
        │
        ▼
 explainability append (flag: 可与 P2 独立或随 replanning 末步)
```

## 2. 各层详细设计

### 2.1 Replanning Engine (P0) — `agentLoopReplanning.ts`

**类型**（与代码真源一致）：

```ts
import type { LocalContextToolResult } from './localContextTools';
import type { LocalToolRoutingPlan } from './localToolSlotTypes';

export type ReplanningDecision = {
  action: 'continue' | 'replan' | 'abort' | 'clarify';
  reason: string;
  newPlan?: LocalToolRoutingPlan;
  messageKey?: string; // i18n via aiChatCardMessages
};

export function evaluateReplanningNeed(
  currentPlan: LocalToolRoutingPlan,
  localToolResults: LocalContextToolResult[] | undefined,
  step: number,
  maxSteps: number,
): ReplanningDecision;
```

**失败特征检测**（不依赖 `toolDecisionFailureReason`；explainability 可复用同类启发）：

| 特征 | 检测方式 |
| --- | --- |
| 句段不存在 | `name === 'get_unit_detail'` 且 `!ok` 且 `error` 含 `unit not found` |
| 搜索无匹配 | `search_units` 且 `ok` 且 `count === 0` |
| 可恢复参数错误 | `!ok` 且 error 含 `required` / `invalid` |
| 不可恢复 | 其它 `!ok` 或 step ≥ maxSteps |

**规则表**：

| 条件 | Decision | 说明 |
| --- | --- | --- |
| `search` + count===0 | `clarify` | `messageKey: agentLoopSearchNoResults` |
| `detail` + unit not found | `replan` | `newPlan`: queryFamily `search`，保留 scope |
| `metric`/`count` 异常或空 | `replan` | `newPlan`: queryFamily `list` |
| 可恢复参数错误 | `clarify` | `agentLoopToolValidationError` |
| 其它 `!ok` | `abort` | 停止 loop；P2 附 explainability |
| step ≥ maxSteps − 1 | `continue` | 不再 `replan`，交给 loop 守卫 |

**与 `shouldContinueAgentLoop` 的顺序（关键）**：

现网在 `localToolResults.some(!ok)` 时**立即** `return false`，会使 `detail` 的 `replan` 不可达。flag 开启时：

1. 先 `evaluateReplanningNeed`；
2. `replan` / `clarify` → **不**走「全失败即停」；
3. 仅 `abort` 且无 `newPlan` 时停止；
4. `shouldContinueAgentLoop` 增加可选 `replanningDecision`；或在 runner 内根据 decision 短路，不调用旧逻辑。

**集成点**（`agentLoopRunner.ts`）— 使用 **`let currentRoutingPlan`**，不 mutate `deps`：

```ts
let currentRoutingPlan = deps.routingPlan;

// finalizeAssistantStreamCompletion 之后，shouldContinue 之前
if (featureFlags.aiAgentLoopClosedLoopReplanningEnabled) {
  const decision = evaluateReplanningNeed(
    currentRoutingPlan,
    continuationResult.localToolResults,
    loopStep,
    DEFAULT_AGENT_LOOP_CONFIG.maxSteps,
  );
  if (decision.action === 'replan' && decision.newPlan) {
    currentRoutingPlan = decision.newPlan;
  } else if (decision.action === 'clarify') {
    resolvedContent = appendExplainability(resolvedContent, decision.messageKey);
    resolvedStatus = 'done';
    break; // 或 set taskSession waiting_clarify — 与 resolvers/clarification 对齐
  } else if (decision.action === 'abort') {
    break;
  }
}

// getLoopStepTaskState 读 currentRoutingPlan，非 deps.routingPlan
```

### 2.2 Result Quality Gate (P1) — `agentLoopResultQuality.ts`

**集成链**（真源路径）：

`agentLoop.ts` → `buildAgentLoopContinuationInput(originalUserText, results, step)`  
→ `buildAgentLoopContinuationToolPayload`（`formatters/agentLoopPayload.ts`）

在 **`buildAgentLoopContinuationToolPayload` 内**（flag 开）对每条 `LocalContextToolResult` 调用 `assessToolResultQuality(result, name)`，将 `quality.annotations`（如 `empty_result`）写入 JSON payload 元字段，**不**改 `buildAgentLoopContinuationInput` 三参数签名。

**规则**：空 `matches`/`[]`/`{}`；`search_units` count===0；超长 payload 已由 `AI_LOCAL_TOOL_RESULT_CHAR_BUDGET`（8000）截断 — 质量层只加 annotation，不重复截断逻辑。

**与 Phase 1 分工**：Phase 1.3 在 `agentLoop.ts` 修 `isAnswerReadyForSearchQuery`（count>0）；Phase 2 统一 continuation 标注。

### 2.3 Context Budget Recalculation (P1)

**不新增** `AgentLoopConfig.tokenBudget`。复用 `src/ai/chat/contextBudget.ts`：

- `computeContextBudget(provider, model)` → `historyBudgetTokens`
- `estimateRemainingLoopTokens(perStepInputTokens, step, DEFAULT_AGENT_LOOP_CONFIG)`
- 每步 loop 开始：`historyCharBudget = floor(historyBudgetTokens * 4 * remainingRatio)`，`remainingRatio = estimateRemaining / (maxSteps * perStepEstimate)`，下限保证 `trimHistoryByChars` 至少 **2** 轮 user+assistant（`recentRounds >= 2`）。

可选在 `contextBudget.ts` 导出 `recalculateStepHistoryCharBudget(...)` 纯函数供 runner 调用。

### 2.4 Explainability (P2)

**i18n**：新键写入 `src/i18n/dictKeys.ts` + `dictionaries/*`；`src/i18n/aiChatCardMessages.ts` 用 `t(dictKeys.agentLoop…)` 暴露（与现有 `agentLoopProgress` 一致）。

| dictKey | 用途 |
| --- | --- |
| `agentLoopMaxStepsReached` | 跑满 maxSteps |
| `agentLoopToolRetryableError` | 暂时性失败 |
| `agentLoopToolValidationError` | 参数/校验失败 |
| `agentLoopSearchNoResults` | clarify 搜索无结果 |
| `agentLoopDetailUnitNotFound` | detail 不存在后引导 |

**`classifyAgentLoopToolFailure(results)`**（`agentLoopResultQuality.ts` 或邻文件）：

| 启发 | messageKey |
| --- | --- |
| error 含 rate limit / timeout / unavailable | `agentLoopToolRetryableError` |
| error 含 required / invalid / unit not found（且未 replan） | `agentLoopToolValidationError` |
| 默认 | `agentLoopToolRetryableError` |

附加时机：loop 退出且 `loopStep >= maxSteps` 且非 answer-ready；或 `abort` 且无用户可见错误文案。

## 3. 状态机

```
tool_results_ready --replan_eval--> replan ──► routing_plan_ready
                              ├─ clarify ──► answer_ready (done)
                              ├─ abort ──► explainability ──► done/error
                              └─ continue ──► shouldContinue ──► next_step | max_steps
max_steps ──► explainability ──► done
```

## 4. Feature Flags

| Flag | 默认 |
| --- | --- |
| `aiAgentLoopClosedLoopReplanningEnabled` | false |
| `aiAgentLoopToolResultQualityGateEnabled` | false |
| `aiAgentLoopContextBudgetRecalculationEnabled` | false |

## 5. 向后兼容

- 三 flag 均 false → 代码路径与现网一致（含 `!ok` 即停、`search` 0 条早停）。
- `AgentLoopRunnerDeps.routingPlan` **保持只读**；runner 内 `currentRoutingPlan` 可变。

## 6. 测试策略

| 文件 | 场景 |
| --- | --- |
| `src/ai/chat/agentLoopReplanning.test.ts` | 规则表、step 边界 |
| `src/ai/chat/agentLoopResultQuality.test.ts` | 空/0 count/annotation |
| `src/ai/chat/agentLoop.test.ts` | search 0、replanningDecision |
| `src/hooks/ai/useAiChat.agentLoopRunner.test.ts` | 接入点、预算、文案（**非** `src/ai/chat/agentLoopRunner.test.ts`） |
| `src/ai/chat/aiArchitectureIntegration.test.ts` | 多步累积 |

---

*Created: 2026-05-17 · Revised: 2026-05-17（SDD 审查修正：补充 computeContextBudget 模块路径）*
