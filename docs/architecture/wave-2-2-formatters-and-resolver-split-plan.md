---
title: Wave 2.2：localContextToolFormatters 与 localToolSlotResolver 拆分规划
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-05-09
source_of_truth: wave-2-2-formatters-resolver-split-plan
---

# Wave 2.2：`localContextToolFormatters` + `localToolSlotResolver` + `toolCallHelpers` 拆分规划

> **状态：✅ 已完成**（2026-05-06）

> **补充执行**：`toolCallHelpers.ts` 同步完成拆分，删除 1700 行临时 ratchet。


> **目标文件**
> - `src/ai/chat/localContextToolFormatters.ts`：923 行 / 阈值 1100（92.4%）
> - `src/ai/chat/localToolSlotResolver.ts`：932 行 / 阈值 1100（93.0%）

> **前置依赖**
> - Wave 2.1 `localContextToolExecutors` 拆分已完成 ✅
> - 无循环依赖（`madge --circular` 0 个）

---

## 一、`localContextToolFormatters.ts` 拆分

### 当前结构（923 行）

| 区块 | 行号 | 职责 | 符号 |
|------|------|------|------|
| A. Payload budget / truncation | 11–31, 759–829 | Agent loop 的 JSON 体积控制与截断 | `applyLocalToolResultCharBudget`, `truncateDeepStringsForAgentLoop`, … |
| B. Locale / utility guards | 33–48, 231–242 | 运行时类型守卫与 locale 判断 | `isZhLocale`, `asObjectRecord`, `isSpeakerCountQuestion`, … |
| C. Scope humanization | 50–62 | Scope 枚举转本地化标签 | `humanizeScope` |
| D. Per-tool summary generators | 64–376 | 按工具名生成人类可读摘要 | `summarizeCurrentSelectionResult`, `summarizeProjectStatsResult`, `summarizeLocalContextToolResult`（主路由） |
| E. Structured answer builders | 379–707 | 五段式结构化答案组装 | `buildLocalToolEvidenceText`, `buildLocalToolScopeText`, `formatStructuredLocalToolAnswer` |
| F. Orchestrator exports | 709–922 | 对外暴露的 3 个函数 | `formatLocalContextToolResultMessage`, `formatLocalContextToolBatchResultMessage`, `buildAgentLoopContinuationToolPayload` |

### 拆分方案：3 子模块 + Orchestrator

```
src/ai/chat/
├── formatters/
│   ├── summarizers.ts          (~350 行)  ← D + B + C
│   ├── structuredAnswer.ts     (~330 行)  ← E
│   └── agentLoopPayload.ts     (~165 行)  ← A
└── localContextToolFormatters.ts  (~80 行)  ← F，保留 orchestrator
```

#### Module 1：`formatters/summarizers.ts`

**职责**：工具结果摘要生成 + 辅助守卫

**导出：**
- `isZhLocale`, `asObjectRecord`, `asFiniteNumber`
- `isSpeakerCountQuestion`, `isUntranscribedQuestion`, `isMissingSpeakerQuestion`
- `humanizeScope`
- `summarizeCurrentSelectionResult`, `summarizeProjectStatsResult`, `summarizeListLikeResult`, `summarizeDetailResult`
- `summarizeDiagnoseQualityResult`, `summarizeLocalContextToolResult`

**内部依赖：** 无（纯函数，仅依赖 `normalizeProjectMetric`、`normalizeUnitScope`）

#### Module 2：`formatters/structuredAnswer.ts`

**职责**：五段式结构化答案组装（conclusion / evidence / scope / uncertainty / next-step）

**导出：**
- `previewPlainText`, `joinStructuredBits`
- `buildLocalToolEvidenceText`, `buildLocalToolScopeText`, `buildLocalToolUncertaintyText`, `buildLocalToolNextStepText`
- `formatStructuredLocalToolAnswer`

**内部依赖：** `summarizers.ts`（调用 `summarizeLocalContextToolResult`、`humanizeScope`）

#### Module 3：`formatters/agentLoopPayload.ts`

**职责**：Agent loop 多轮调用时的 payload 体积控制与深度截断

**导出：**
- `applyLocalToolResultCharBudget`
- `buildAgentLoopContinuationToolPayload`

**内部依赖：** 无（仅依赖配置常量和 metrics）

#### Orchestrator 保留：`localContextToolFormatters.ts`

保留约 80 行，仅包含 3 个对外导出函数及其 import/re-export：
- `formatLocalContextToolResultMessage`
- `formatLocalContextToolBatchResultMessage`
- `export { buildAgentLoopContinuationToolPayload } from './formatters/agentLoopPayload'`

---

## 二、`localToolSlotResolver.ts` 拆分

### 当前结构（932 行）

| 区块 | 行号 | 职责 | 符号 |
|------|------|------|------|
| A. Normalization guards | 36–81 | 参数归一化守卫 | `normalizeLimit`, `normalizeText`, `normalizeScopeArg`, `normalizeMetricArg` |
| B. Intent detection | 83–410 | 从用户自由文本推断意图（regex 启发式） | `inferScopeFromUserText`（~238 行）, `inferMetricFromUserText`, `is*IntentText` ×12 |
| C. Routing plan | 112–255 | 路由计划构建 | `resolveLocalToolRoutingPlan`（~145 行） |
| D. Call resolution | 412–661 | 单工具调用参数解析 | `resolveProjectStatsCall`, `resolveDiagnoseQualityCall`, `resolveSearchCall`, `resolveDetailCall`, `resolveBatchApplyCall` |
| E. Clarification detection | 663–768 | 澄清需求检测 | `detectLocalToolClarificationNeed`（~26 行）, `needs*Clarification` ×5 |
| F. Semantic frame & state patch | 478–538, 885–932 | 语义帧构建与状态补丁 | `buildSemanticFrameFromCall`, `buildLocalToolStatePatchFromCallResult`（~39 行） |
| G. Orchestrator exports | 769–893 | 主解析函数 + 类型定义 | `resolveLocalToolCalls`（~125 行）, 类型定义 |

### 拆分方案：4 子模块 + Orchestrator

```
src/ai/chat/
├── resolvers/
│   ├── intentDetection.ts      (~330 行)  ← B
│   ├── toolRouting.ts          (~395 行)  ← A + C + D
│   ├── clarification.ts        (~105 行)  ← E
│   └── statePatch.ts           (~110 行)  ← F
└── localToolSlotResolver.ts    (~150 行)  ← G，保留 orchestrator + 类型导出
```

#### Module 1：`resolvers/intentDetection.ts`

**职责**：从用户自由文本推断意图（纯 regex 启发式，无外部依赖）

**导出：**
- `inferScopeFromUserText`
- `inferMetricFromUserText`, `inferGapMetricFromUserText`
- `isCountIntentText`, `isLayerListIntentText`, `isLayerLinkIntentText`, `isUnsavedDraftIntentText`
- `isSpeakerBreakdownIntentText`, `isSpeakerListIntentText`, `isNoteDetailIntentText`, `isNoteListIntentText`
- `isVisibleTimelineStateIntentText`, `isLinguisticMemoryIntentText`, `isUnitListIntentText`
- `isFollowUpIntentText`, `isGapCountIntentText`

**内部依赖：** 无（纯文本处理）

**被谁 import：** `toolRouting.ts`, `clarification.ts`

#### Module 2：`resolvers/toolRouting.ts`

**职责**：参数归一化 + 路由计划 + 单工具参数解析

**导出：**
- `normalizeLimit`, `normalizeText`, `normalizeScopeArg`, `normalizeMetricArg`
- `resolvePreferredScope`
- `resolveLocalToolRoutingPlan`
- `resolveProjectStatsCall`, `resolveDiagnoseQualityCall`, `resolveSearchCall`, `resolveDetailCall`, `resolveBatchApplyCall`

**内部依赖：** `intentDetection.ts`

#### Module 3：`resolvers/clarification.ts`

**职责**：澄清需求检测

**导出：**
- `detectLocalToolClarificationNeed`

**内部依赖：** `intentDetection.ts`

#### Module 4：`resolvers/statePatch.ts`

**职责**：语义帧构建与状态补丁

**导出：**
- `buildSemanticFrameFromCall`
- `buildLocalToolStatePatchFromCallResult`

**内部依赖：** 无（仅依赖类型定义）

#### Orchestrator 保留：`localToolSlotResolver.ts`

保留约 150 行，包含类型定义 + `resolveLocalToolCalls` 主函数。

`resolveLocalToolCalls` 内部委托给 `toolRouting.ts`、`clarification.ts`、`statePatch.ts`。

---

## 三、依赖关系图

```
localContextToolFormatters.ts (orchestrator)
  ├── summarizers.ts
  ├── structuredAnswer.ts → summarizers.ts
  └── agentLoopPayload.ts

localToolSlotResolver.ts (orchestrator)
  ├── intentDetection.ts
  ├── toolRouting.ts → intentDetection.ts
  ├── clarification.ts → intentDetection.ts
  └── statePatch.ts
```

**无循环依赖。** `intentDetection.ts` 是纯文本处理，不依赖任何 resolver 模块。

---

## 四、实施步骤（按顺序，每步验证）

### Phase A：`localContextToolFormatters.ts`

| 步骤 | 操作 | 验证 |
|------|------|------|
| 1 | 创建 `formatters/summarizers.ts`（D+B+C） | `npm run typecheck` |
| 2 | 创建 `formatters/structuredAnswer.ts`（E），import summarizers | `npm run typecheck` |
| 3 | 创建 `formatters/agentLoopPayload.ts`（A+F） | `npm run typecheck` |
| 4 | 重写 `localContextToolFormatters.ts`：删除所有内部代码，保留 3 个导出函数 + import/re-export | `npm run typecheck` |
| 5 | 删除 `localContextToolFormatters.ts` 临时 ratchet（1100 → 批量 1000） | `npm run check:architecture-guard:core` |

### Phase B：`localToolSlotResolver.ts`

| 步骤 | 操作 | 验证 |
|------|------|------|
| 6 | 创建 `resolvers/intentDetection.ts`（B） | `npm run typecheck` |
| 7 | 创建 `resolvers/toolRouting.ts`（A+C+D），import intentDetection | `npm run typecheck` |
| 8 | 创建 `resolvers/clarification.ts`（E），import intentDetection | `npm run typecheck` |
| 9 | 创建 `resolvers/statePatch.ts`（F） | `npm run typecheck` |
| 10 | 重写 `localToolSlotResolver.ts`：删除所有内部代码，保留类型定义 + `resolveLocalToolCalls` + import/re-export | `npm run typecheck` |
| 11 | 删除 `localToolSlotResolver.ts` 临时 ratchet（1100 → 批量 1000） | `npm run check:architecture-guard:core` |
| 12 | 运行完整 guard + 相关测试 | `npm run check:architecture-guard` + vitest |

---

## 五、Guard 影响

| 规则变更 | 说明 |
|---------|------|
| 删除 `localContextToolFormatters.ts` 的单独规则 | 拆分后原文件 < 200 行，回归 `^src/ai/chat/.*\.(ts\|tsx)$` 批量规则（maxLines: 1000） |
| 删除 `localToolSlotResolver.ts` 的单独规则 | 拆分后原文件 < 200 行，回归批量规则 |
| 新增子文件自动受批量规则约束 | `formatters/*.ts`、`resolvers/*.ts` 均匹配 `^src/ai/chat/.*\.(ts\|tsx)$`，maxLines: 1000 |
| 无新 ratchet 引入 | 拆分目标就是删除 ratchet，不新增 |

---

## 六、风险与回退

| 风险 | 缓解措施 |
|------|---------|
| `inferScopeFromUserText` 过大（~238 行）导致 `intentDetection.ts` 仍接近 1000 行 | 该函数是纯 regex 分支，当前无进一步拆分的自然边界；若后续超过 800 行，可将其内部 scope 映射表提取为数据文件 |
| `toolRouting.ts` 可能超过 1000 行（预估 395 行） | 预留足够余量；若实际超出，可将 D（call resolution）进一步拆分为 `callResolvers.ts` |
| TypeScript `exactOptionalPropertyTypes` 在重构时触发 TS2379 | 每次步骤后必须 `npm run typecheck`；遇到 `undefined` 传参问题时显式处理 |
| 循环依赖 | 每步执行后 `npx madge --circular src/ai/chat/localToolSlotResolver.ts` 验证 |

**回退策略：** 若 typecheck 在步骤 7–10 反复失败，可降级为只拆 `intentDetection.ts`（最大独立块，~330 行）+ `agentLoopPayload.ts`（~165 行），其余保留在原文件，仍能使两个主文件降到 ~600 行以下。
