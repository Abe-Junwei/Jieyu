---
title: AI 智能体架构风险审查 — 对标 "Why Agentic AI Fails"
doc_type: architecture-audit
status: active
owner: repo
last_reviewed: 2026-05-17
source_of_truth: ai-agent-architecture-risk
---

# AI 智能体架构风险审查

> **对标来源**：IBM Technology — *Why Agentic AI Fails: Infinite Loops, Planning Errors, and More* (YouTube, 2026-05-17)
>
> **代码复核**：2026-05-17 对照当前 `src/ai/chat/*` 与 `sessionMemory.ts` 勘误（见 §2.1 / §2.4 / §2.5 / §2.6 修订行）。
>
> **审查范围**：`src/ai/chat/agentLoop*`、`src/ai/chat/toolDecisionPipeline*`、`src/ai/chat/resolvers/toolRouting*`、`src/ai/coordination/`、`src/ai/memory/`、`src/hooks/ai/useAiChat.*`

**与视频三类的直接映射**：① Infinite Loops → §2.1；② Planning / 假设不存在的能力 → §2.2（Jieyu 侧主要为开环 `routingPlan`）+ §2.3；③ Unsafe tool use → §2.7。下文 §2.4–§2.6 为工程扩展项（上下文、状态、可观测性）。

---

## 一、视频核心论点摘要

IBM 视频归纳的 Agentic AI 典型失败模式：

| # | 失败模式 | 核心症状 |
|---|---------|---------|
| 1 | **Infinite Loops** | Agent 在无终止条件下反复调用相同工具/推理步骤，消耗 token 与算力 |
| 2 | **Planning Errors** | 初始计划不切实际，执行中无法根据中间结果动态调整策略 |
| 3 | **Tool Misuse / Over-reliance** | 选错工具、参数格式错误、对工具输出过度信任导致错误累积 |
| 4 | **Context Window Overflow** | 长链路执行中历史与工具结果膨胀，挤爆上下文窗口，质量骤降 |
| 5 | **State Management Failures** | Agent 状态膨胀、会话间串数据、断点续跑失败 |
| 6 | **Lack of Observability** | 无法追踪 Agent 决策链，调试困难，用户无法理解失败原因 |
| 7 | **Security Escalation** | Agent 越权执行、权限提升、破坏性操作未受控 |

---

## 二、逐条对标审查

### 2.1 Infinite Loops — 无限循环

**风险等级：🟡 中低（有硬上限，但存在"准循环"风险）**

| 检查项 | 代码证据 | 评估 |
|--------|---------|------|
| 步数硬上限 | `DEFAULT_AGENT_LOOP_CONFIG.maxSteps = 6` (`agentLoop.ts:28`) | ✅ 绝对上限，不会真正无限循环 |
| 循环终止条件 | `shouldContinueAgentLoop`：空结果/错误/answerReady/metric满足时停止 (`agentLoop.ts:117-138`) | ✅ 多条件覆盖 |
| Token 预算守卫 | `shouldWarnTokenBudget` 在预估剩余 token ≥ 12000 时触发 checkpoint 并 break (`agentLoop.ts:149-153`) | ✅ 二次保险 |
| **有界空转** | 任一步 `get_unit_detail` / `get_unit_linguistic_memory` 成功即 `isAnswerReadyForDetailQuery` → **停止** loop（不会为不同 unitId 连跑多步）；更真实的浪费是 `queryFamily` 未命中早停且每步工具均 `ok`，或 LLM 反复调用不同读工具直至 `maxSteps` | ⚠️ 可能浪费步骤与 token |
| **动作/进展跟踪（视频建议）** | 无运行时 tool args 相似度去重；`buildLocalContextToolGuide` 仅有 Query economy **prompt** 约束 | ⚠️ 与 IBM「action tracking / progress tracking」缺口一致 |
| **错误后恢复** | `localToolResults.some((item) => !item.ok)` 时立即停止，不尝试 fallback 或降级策略 | ⚠️ 一错即停，体验生硬 |

**结论**：不会真正无限循环，但存在"低效逼近"——Agent 可能在 maxSteps 内反复执行相似读操作或推理，最终因步数耗尽停止，而非因问题已解决停止。无独立墙钟 `maxRuntime`（仅 `maxSteps` + `AbortSignal`）。

---

### 2.2 Planning Errors — 规划错误

**风险等级：🔴 高（核心缺陷：计划僵化）**

| 检查项 | 代码证据 | 评估 |
|--------|---------|------|
| 计划生成时机 | `resolveLocalToolRoutingPlan(userText, memory)` 仅在**首次 send 时**基于用户文本静态推断 (`resolvers/toolRouting.ts:139`) | ❌ 一次性规划 |
| 计划更新机制 | `AgentLoopRunnerDeps.routingPlan` 为**只读** (`agentLoopRunner.ts:85`)，loop 的 6 步执行期间**绝不更新** | ❌ 无动态重规划 |
| queryFamily 推断 | 基于正则匹配用户文本（如 `/search|find|query/` → `'search'`），若用户表达模糊，初始分类错误 | ⚠️  brittle |
| 中间结果反馈 | `getLoopStepTaskState()` 读取 `resolvedStatus`、`resolvedLocalToolResults`，但仅用于判断**是否继续**，不用于**调整策略** (`agentLoopRunner.ts:159-175`) | ❌ 无策略调整 |
| **典型失败场景** | 用户问"第 10 个句段的详情"→ 被分类为 `detail` → 若句段不存在，工具返回 error → loop 立即停止；但正确的策略应该是先 `search` 再 `detail` | ❌ 无法自动修正 |

**结论**：这是架构级缺陷。当前 Agent Loop 是**开环执行**（open-loop）：规划在入口确定，执行中不根据工具返回结果重新评估规划。IBM 视频强调的"Planning Errors"在此有明确对应——一旦初始 `routingPlan` 错误（如 queryFamily 误分类），后续步骤不会自我纠正。

**建议**：引入**闭环重规划**（closed-loop replanning）：每步执行后，用轻量规则或 LLM 调用评估当前结果是否满足目标，若不满足则允许更新 `queryFamily` 或 `selectedTools`。

---

### 2.3 Tool Misuse / Over-reliance — 工具误用

**风险等级：🟡 中低（工具链完善，但存在信任过度）**

| 检查项 | 代码证据 | 评估 |
|--------|---------|------|
| 工具选择管道 | `toolDecisionPipeline.ts` 统一决策：intent 评估 → 参数验证 → 破坏性门控 → 人类确认 → 执行 | ✅ 多层过滤 |
| 破坏性操作控制 | `destructiveGate.ts` 对 `delete_transcription_segment` 等工具要求显式目标、二次确认 | ✅ 门控严格 |
| 参数验证 | `argsValidation.ts` + `validateToolCallArguments` 对参数格式校验 | ✅ 有验证 |
| 失败分类 | `toolDecisionFailureReason.ts` 区分 `retry`/`clarify`/`human`/`abandon` | ✅ 有策略 |
| Auto-retry | 非破坏性工具 throw 时自动重试 1 次 (`confirmExecution.autoRetry.test.ts`) | ✅ 容错 |
| **搜索早停** | `isAnswerReadyForSearchQuery` 仅检查 `search_units` 且 `ok: true`，不检查 `count > 0` (`agentLoop.ts:108-110`) | ⚠️ 0 条匹配也会停止 loop（**过早停止**） |
| **工具结果信任** | `localToolResults` 经 `buildAgentLoopContinuationInput` 入 continuation，无空结果/低质量语义标记 | ⚠️ 其它 `ok: true` 但空 `matches` 等仍可能诱发编造 |

**结论**：工具调用前的管控非常完善，但**调用后的语义校验不足**——`ok: true` 不等价于「对用户问题已有答案」；搜索 0 条会触发早停，其它空结果仍可能进入 continuation。

---

### 2.4 Context Window Overflow — 上下文窗口溢出

**风险等级：🟡 中低（单步有 cap，多步 history 仍可能膨胀）**

| 检查项 | 代码证据 | 评估 |
|--------|---------|------|
| 上下文预算 | `contextBudget.ts` 根据 provider/model 计算 `usableInputTokens` / `historyBudgetTokens` | ✅ 动态预算 |
| 历史截断 | `trimHistoryByChars(history, maxChars, recentRounds, conversationSummary)` (`historyTrim.ts:210`) | ✅ 有截断 |
| Agent Loop 内累积 | `continuationHistory = [...deps.history, { role: 'assistant', content: rawAssistantContentForLoop }]` (`agentLoopRunner.ts:221`) | ⚠️ 每步追加 assistant content，6 步后 history 显著膨胀 |
| 工具结果大小 | `buildAgentLoopContinuationToolPayload` + `AI_LOCAL_TOOL_RESULT_CHAR_BUDGET = 8000`（`useAiChat.config.ts`），多轮 shrink（`formatters/agentLoopPayload.ts`） | ✅ 单步有硬上限与截断提示 |
| Summary  fallback | `trimHistoryByChars` 支持用 `conversationSummary` 替换早期历史 | ✅ 有摘要机制 |

**结论**：单步工具 JSON **并非无上限**（8k 字符 + shrink）。风险在于 **6 步线性累积**：每步 `continuationHistory` 追加 assistant 全文 + 新工具 payload，再 `trimHistoryByChars`；多步叠加后仍可能逼近 provider 窗口，且截断可能发生在模型仍需要早期细节时。

---

### 2.5 State Management Failures — 状态管理失败

**风险等级：🟡 中低（Dexie 主路径已接，legacy / 多标签仍薄弱）**

| 检查项 | 代码证据 | 评估 |
|--------|---------|------|
| SessionMemory 存储 | `bindSessionMemoryConversation` 后：`persistSessionMemoryAsync` → Dexie `ai_session_memories`；未绑定 conversation 时仍写 `localStorage` legacy key；首次加载可 `migrateLegacySessionMemoryToDexie` (`sessionMemory.ts`) | ⚠️ 主路径已 IndexedDB；legacy 与无 conversationId 回退仍在 |
| 迁移计划 | [AI对话会话管理落地方案-2026-05-16](../plans/AI对话会话管理落地方案-2026-05-16.md) G1a | ✅ 核心读写已落地；多会话 / 多标签同步待续 |
| Agent Loop Checkpoint | `pendingAgentLoopCheckpoint` 支持 token_budget_warning 时的断点续跑 (`agentLoopCheckpoint.ts`) | ✅ 有 checkpoint |
| 多标签同步 | 无 `BroadcastChannel` 或 `storage` 事件同步会话状态 | ❌ 跨标签页状态不一致 |
| TaskSession 状态 | `taskSession.status: 'idle'|'waiting_clarify'|'executing'` 跟踪 agent loop 状态 | ✅ 有状态机 |
| CoordinationLite | `CoordinationLiteSession` 仅记录任务通知，无真正的并行控制 (`coordinationLite.ts:65-93`) | ⚠️ 轻量到近乎无作用 |

**结论**：会话记忆 **不再仅以 localStorage 为唯一真源**；剩余风险在 legacy 回退、**多标签页无 `BroadcastChannel` 同步**，以及 CoordinationLite 仅审计不互斥。

---

### 2.6 Lack of Observability — 可观测性不足

**风险等级：🟢 低（观测体系完善，但用户侧解释性有缺口）**

| 检查项 | 代码证据 | 评估 |
|--------|---------|------|
| 审计日志 | `audit_logs` 记录 tool decision、agent loop step、token 使用 (`agentLoopRunner.ts:347-369`) | ✅ 全链路审计 |
| Trace Span | `startAiTraceSpan({ kind: 'agent-loop-step', traceId, tags })` (`agentLoopRunner.ts:196`) | ✅ 分布式追踪 |
| Metrics | `recordMetric('ai.chat.agent_loop_step_duration_ms')` 等 | ✅ 性能指标 |
| Replay | `AiChatReplayController` + `AiChatDecisionPanel` 支持决策回放 | ✅ 可回放 |
| **Loop 进度 UI** | `AiChatComposerPanel` 展示 `agentLoopProgress(step, maxSteps)` (`aiChatCardMessages.ts`) | ✅ 执行中有步数提示 |
| **用户侧解释** | 跑满 `maxSteps` 且非 token_budget_warning 路径时，assistant 正文**未必**说明「因步数上限停止」 | ⚠️ 仍有黑盒感 |
| **错误解释** | 工具失败后用户看到 `"工具执行失败"`，但不知道失败原因和是否可以重试 | ⚠️ 信息不足 |

**结论**：开发者侧 observability 强；用户侧有 **步数进度**，但 **停止原因与失败可操作建议** 仍不足（与 IBM「用户无法理解失败原因」部分对应）。

---

### 2.7 Security Escalation — 安全/权限升级

**风险等级：🟡 中低（有权限矩阵，但粒度粗）**

| 检查项 | 代码证据 | 评估 |
|--------|---------|------|
| 工具策略矩阵 | `aiToolPolicyMatrix.ts` 定义工具权限级别 | ✅ 有矩阵 |
| 破坏性门控 | `destructiveGate.ts` + `allowDestructiveToolCalls` flag | ✅ 有门控 |
| 背景记忆沙箱 | `BackgroundMemoryExtractor` 支持 `sandboxProfile: 'readonly'|'restricted_write'|'deny_by_default'` (`backgroundMemory.ts:24-31`) | ✅ 有沙箱 |
| Flush Quota | 每会话后台写次数上限 (`backgroundMemory.ts:48-49`) | ✅ 有配额 |
| **权限粒度** | `allowDestructiveToolCalls` 是**全局布尔值**，非 per-tool / per-action | ⚠️ 粒度粗 |
| **背景记忆绕过** | `sandboxDecision` 仅在 `backgroundMemoryExtractor` 中检查，若直接调用 `persistSessionMemory` 可绕过 | ⚠️ 依赖调用方自律 |

---

## 三、综合风险矩阵

| 失败模式 | 风险等级 | 是否会出现 | 代码根因 | 修复优先级 |
|---------|---------|-----------|---------|-----------|
| Infinite Loops | 🟡 中低 | 无界 ❌；有界空转 ✅ | maxSteps=6；无运行时 action/progress 跟踪 | P2 |
| **Planning Errors** | 🔴 **高** | **会出现** | `routingPlan` 在 loop 执行期间**只读**，无闭环重规划 | **P0** |
| Tool Misuse | 🟡 中低 | 会出现 | 调用后语义校验弱；search 0 条早停 | P1 |
| Context Window Overflow | 🟡 中低 | 可能出现 | 单步 8k cap；多步 history 线性累积 | P1 |
| State Management | 🟡 中低 | 部分缓解 | Dexie 主路径 + legacy；多标签不同步 | P1（G1a 续）|
| Observability | 🟢 低 | 开发者侧完善，用户侧有缺口 | Agent Loop 决策过程对用户不可解释 | P2 |
| Security | 🟡 中低 | 小概率 | `allowDestructiveToolCalls` 全局布尔，粒度粗 | P2 |

---

## 四、改进建议

### 4.1 P0 — 引入闭环重规划（Closed-Loop Replanning）

**问题**：当前 Agent Loop 是开环执行，`routingPlan` 一旦确定绝不更新。

**建议**：
1. 在每步 `finalizeAssistantStreamCompletion` 后，增加**重规划评估点**：
   ```ts
   // 伪代码
   if (loopStep > 1 && shouldReplan(continuationResult, routingPlan)) {
     routingPlan = await replan(routingPlan, continuationResult.localToolResults);
   }
   ```
2. `shouldReplan` 规则示例：
   - `search` 返回 0 结果 → 改 `queryFamily` 为 `detail` 或提示用户澄清
   - `detail` 请求的 unitId 不存在 → 先执行 `search_units`
   - `count` 工具返回异常值 → 降级为 `list`
3. 重规划不必须经过 LLM，可用**轻量规则引擎**（基于 `toolDecisionFailureReason` 的分类逻辑），降低延迟与成本。

### 4.2 P1 — 工具结果质量校验

**建议**：在 `buildAgentLoopContinuationInput` 前，增加结果校验层：
- 空数组/空对象 → 标记为 `empty_result`，continuation prompt 中提示 LLM 结果为空
- `search_units` 且 `count === 0` → **不要**触发 `isAnswerReadyForSearchQuery`；continuation 中显式标注无匹配
- 错误码/异常值 → 转换为自然语言错误描述

### 4.3 P1 — Agent Loop 内上下文预算再分配

**建议**（在已有 8k 单步 cap 之上）：
- 每步重新计算 `remainingBudget = initialBudget - consumedTokens`，动态调整 `historyCharBudget`
- 限制每步写入 `continuationHistory` 的 assistant 摘要长度（非全文堆叠）

### 4.4 P2 — 用户侧 Explainability

**建议**：
- 当 Agent Loop 因 `maxSteps` 耗尽停止时，在 assistant message 末尾附加 `"(已达到最大推理步数，若需继续请告诉我)"`
- 当工具失败时，区分 `"暂时性错误（可重试）"` vs `"参数错误（需修正）"`，给用户明确的下一步指引

---

## 五、门禁与跟踪

| 检查项 | 方式 |
|--------|------|
| 重规划逻辑 | 新增 `agentLoopReplanning.test.ts`，覆盖 queryFamily 切换场景 |
| 工具结果校验 | 扩展 `agentLoop.test.ts`，覆盖空结果/大结果场景 |
| Token 预算 | `aiArchitectureIntegration.test.ts` 已覆盖，需扩展 agent loop 内累积场景 |
| E2E | `test:e2e:chromium` 验证复杂查询（如"不存在的句段详情"）的 Agent 行为 |

---

*审查完成日期：2026-05-17*
*代码复核勘误：2026-05-17（§2.1 / §2.4 / §2.5 / §2.6）*
*下次复审：Agent Loop 重规划实现后*
