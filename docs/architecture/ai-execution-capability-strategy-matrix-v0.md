---
title: AI 执行层 capability 策略矩阵 v0
doc_type: architecture
status: active
owner: ai-governance
last_reviewed: 2026-05-01
source_of_truth: ai-capability-policy-v0
depends_on:
  - ./ai-chat-tool-confirm-idempotency.md
  - ../execution/plans/AI智能体工业级史诗-落地方案-2026-05-01.md
---

# AI 执行层 capability 策略矩阵 v0

本文是 **T2-a** 交付物：在实现「统一 `resolveXxxPolicy` 函数族」（T2-b）之前，先把 **scope / trust / quota** 三个维度与 **现有** `toolPreferences`、`safetyPreferences`、主链 pipeline、后台 sandbox 的 **对应关系与优先级** 写清，避免 T2-b/F4 各写一套字符串。

**v0 边界：** 只描述 **当前代码已存在** 的判定与审计形状；**quota** 列为预留（T2-c）；**扩展 trust** 仅点到开关与史诗，不把扩展 manifest 全文搬进本文。

## 1. 维度定义（词汇表）

| 维度 | 含义（本仓库） | v0 落地形态 |
|------|----------------|-------------|
| **Scope** | 一次工具效应可触及的 **数据与文件边界**（时间轴读模型、工作区路径、本地统计作用域等） | 主链：`AiPromptContext` / planner 目标解析、`toolPreferences.defaultScope`（本地读工具）、destructive gate 的显式目标物化；后台：`workspaceRoot` / `cwd` / `authorizedWriteDirs` 与路径规范化 |
| **Trust** | **谁**在发起执行（用户显式确认 vs 模型自动 vs 后台任务）以及 **宿主级** 开关（灰度/回滚模式等） | 主链：`toolDecisionMode`、`approvalMode: 'user_preference'` 等；扩展：`featureFlags.aiExtensionTrustGovernanceEnabled`（详见 F4 史诗） |
| **Quota** | 频率、批量、每会话写入上限等 **可计数约束** | **未实现**（T2-c）；本文仅保留矩阵列占位 |

## 2. 策略输出形状（对齐 T2 目标）

两类入口当前都用 **离散决策**，尚未收敛成单一 `resolveCapabilityPolicy` 类型，但 **语义** 宜与 T2 一致：

| 输出 | 主链（聊天 send 完成路径） | 后台（记忆抽取 flush） |
|------|---------------------------|-------------------------|
| 允许自动执行 | `executeAutoToolCall` 成功路径 | sandbox `action: 'allow'` 且继续调用宿主工具执行器 |
| 要求确认 / 询问 | `setPendingToolCall`（`waiting_confirm`） | sandbox `action: 'ask'`（当前产品路径下多表现为审计 metadata，不自动写） |
| 拒绝 | `policy_blocked:*`、`auto_failed:*`、gate 错误路径等 | sandbox `action: 'deny'` + 审计中带 `sandboxDecision` |

后台审计字段形状见 `useAiChat.backgroundMemory.ts` 对 `sandboxDecision` 的写入；主链审计见 `useAiChat.toolDecisionPipeline.ts` 与 `buildToolDecisionAuditMetadata`。

## 3. 与 session 偏好字段的映射

类型定义：`src/ai/chat/chatDomain.types.ts`（`AiSessionMemoryToolPreferences`、`AiSessionMemorySafetyPreferences`）。

| 字段 | 作用 | 参与判定的代码入口 |
|------|------|---------------------|
| `toolPreferences.autoExecute` | `'never'` \| `'ask_first'` \| `'allow'` | `resolveUserDirectivePolicyDecision`（`src/ai/policy/resolveExecutionPolicy.ts`；主链由 `useAiChat.toolDecisionPipeline` 与 `useAiChat.streamCompletion` 调用） |
| `toolPreferences.defaultScope` | 本地读类工具的默认单元作用域 | `useAiChat.streamCompletion.ts` 中 `resolveLocalToolCalls` 的 scope 解析（与 pipeline 的「是否执行」顺序独立，属 **scope 维**） |
| `toolPreferences.preferLocalReads` | 偏好本地读路径（与 RAG/远程读并存时的产品策略） | 读路径偏好，**不**等价于 capability deny；具体调用点以代码为准 |
| `safetyPreferences.denyDestructive` | 为真时阻止 **破坏性** 工具自动执行 | 同上，与 `isDestructiveToolCall`（`toolCallHelpers`）组合 |
| `safetyPreferences.denyBatch` | 为真时阻止 **批量形** 工具自动执行 | 同上，与 `isBatchToolCall` 组合 |
| `safetyPreferences.requireImpactPreview` | 为真时对 **写类** 工具要求先进入确认态 | 同上，与 `isWriteLikeToolCall` 组合 |

## 4. 主链：判定优先级（从高到低）

下列顺序 **以 `resolveToolDecisionPipeline` 的实际分支为准**（后者不能覆盖前者已返回的结果）：

1. **`toolDecisionMode === 'rollback'`** — 全局跳过自动工具（审计 `rollback_skipped`）。来源：`resolveAiToolDecisionMode()` + `featureFlags.aiChatRollbackMode` 等（`src/ai/chat/toolCallHelpers.ts`）。
2. **意图 / planner 早退** — `buildAndAuditToolIntent` → `resolveToolIntentOutcome`：澄清、忽略、取消等 **不进入** 用户偏好与 destructive gate。
3. **`toolDecisionMode === 'gray'`** — 灰度：参数校验失败走失败审计；否则 `gray_skipped`。
4. **`hasPersistedExecutionForRequest`** — 幂等去重（见 [ai-chat-tool-confirm-idempotency.md](./ai-chat-tool-confirm-idempotency.md)）。
5. **参数校验**（`validateToolCallArguments`）— 失败则 `auto_failed` 等。
6. **`resolveUserDirectivePolicyDecision`**（`resolveExecutionPolicy.ts`）— **本层聚合 `toolPreferences` + `safetyPreferences`**：  
   - 先计算是否 **硬阻断**（`never` / deny destructive / deny batch）→ `policy_blocked:*`；  
   - 否则若需确认（`ask_first` 或 `requireImpactPreview` + write-like）→ `policy_pending:*` 与 `approvalMode: 'user_preference'`、`policyReasonCode: 'user_directive_confirmation_required'`。
7. **`resolveDestructiveGate`** — 破坏性工具宿主开关 `allowDestructiveToolCalls`、风险检查回调、显式目标物化等（`useAiChat.destructiveGate.ts`）；策略矩阵 SSOT 片段见 `src/ai/policy/aiToolPolicyMatrix.ts`。
8. **`executeAutoToolCall`** — 通过上述层后的自动执行。

**优先级结论（v0）：** 用户 session 的 **`autoExecute` / safety 三布尔** 在 **意图通过之后、destructive gate 之前** 生效；**不能**用 `defaultScope` 覆盖 `never` 或 `denyDestructive`。`toolDecisionMode` 与幂等校验 **优先于** 用户偏好。

## 5. 后台路径：Background tool sandbox

| 项目 | 说明 |
|------|------|
| 开关 | `featureFlags.aiBackgroundToolSandboxEnabled`（默认 `false`）；关闭时经 **`resolveAiChatBackgroundMemorySandboxPolicy`** → `resolveBackgroundToolSandboxDecision` 得 `action: 'allow', reason: 'sandbox-disabled'`（实现 `src/ai/sandbox/backgroundToolSandbox.ts`）。 |
| Profile | `BackgroundToolSandboxProfile`：`readonly` \| `restricted_write` \| `deny_by_default`；默认 profile 常量见 `useAiChat.backgroundMemory.ts` 中 `AI_CHAT_BACKGROUND_MEMORY_SANDBOX_PROFILE`。 |
| 与主链关系 | **独立入口**：不经过 `resolveToolDecisionPipeline`；**T2-b** 起后台虚拟写路径与主链用户偏好层同属 **`src/ai/policy/resolveExecutionPolicy.ts`** 函数族（`resolveAiChatSessionSidecarSandboxPolicy`：`background-extraction` / `pinned-message-directive` / `send-preflight-directive`；其中后台 flush 仍经 `resolveAiChatBackgroundMemorySandboxPolicy` 包装）。置顶 replay 与 send 前显式指令写 session 在 **`aiBackgroundToolSandboxEnabled`** 打开时走同一 profile / `authorizedWriteDirs`。 |

## 6. Quota 与 Trust

### 6.1 Quota（T2-c 最小实现）

- **范围：** 仅 **后台记忆 flush**（`BackgroundMemoryExtractor`），按 **`conversationId`** 在 **当前页内存** 计数「**成功写入** 的 flush 次数」（`writeFacts` 返回值 `> 0` 时 `consume`）；达到上限后后续 flush 在 **`extractFacts` 之前** 跳过，`skippedReason: 'session-write-quota-exceeded'`。
- **开关与上限：** `featureFlags.aiBackgroundMemorySessionWriteQuotaEnabled`（默认 `false`）、`featureFlags.aiBackgroundMemorySessionWriteQuotaMax`（默认 `12`；`<=0` 时不启用 gate）。
- **可观测：** 审计 `ai_background_memory_extraction` 的 `metadataJson.skippedReason`；release evidence C5 的 `backgroundMemoryExtraction.skipReasons` 与 evidenceIndex `keySummary` 中的 `quotaSkipped=…`。

### 6.2 扩展 Trust（占位）

- **扩展 Trust：** 实现与批次见 `docs/execution/plans/F4-扩展入口-capability-isolation-epic-2026-05-01.md`；与聊天主链 session `safetyPreferences` **无自动合并**（v0）。

## 7. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-05-01 | 初版 v0：三维度定义、主链优先级、session 字段映射、后台 sandbox 锚点、quota/trust 占位。 |
| 2026-05-01 | T2-b：`resolveUserDirectivePolicyDecision` 与 `resolveAiChatBackgroundMemorySandboxPolicy` 迁入 `src/ai/policy/resolveExecutionPolicy.ts`；更新本节锚点。 |
| 2026-05-01 | T2-c：后台记忆 flush 每会话写次数上限（`featureFlags` + `BackgroundMemoryExtractor.flushQuotaGate`）；§6.1。 |
| 2026-05-05 | F4：置顶用户消息 directive replay 与 send-preflight 用户指令写 session 纳入同一 session sidecar sandbox（`resolveAiChatSessionSidecarSandboxPolicy`）；§5。 |
