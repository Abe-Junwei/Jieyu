---
title: agent-runtime-security-semantic-guard design
doc_type: execution-spec-design
status: active
owner: ai-governance
last_reviewed: 2026-09-03
source_of_truth: agent-runtime-security-semantic-guard-spec
depends_on:
  - ./requirements.md
  - ../../../architecture/ai-agent-runtime-security-local-first.md
  - ../../../architecture/ai-agent-runtime-runner-model.md
---

# Design — Agent Runtime Semantic Guard (A9)

## 1. 成熟方案扫描 / Research

- 仓库既有：`AgentCallbackRegistry` 已有 `before_model` / `before_client`（handler 为 `void`）；出站密钥 scrub 在 `observability/sensitiveKeyPolicy`；adversarial eval 今天只断言 `resolveUserDirectivePolicyDecision`，不是语义护栏；`before_turn` 已在 preflight 触发。
- 同类产品：Google Model Armor = `SanitizeUserPrompt` / `SanitizeModelResponse`；PEP 负责 block；入站注入拦截 vs 出站 SDP 去标识后继续。
- 业内规范：OWASP LLM01 prompt injection + 敏感披露；GCP agent 蓝图要求 **untrusted grounding 拼进 LLM 前扫描**（间接注入）。
- 公认不可行：接云 Model Armor SaaS；在 ChatWindow 堆规则；只靠 callback 改写出站（handler 不能返回新文本）；把工作区转写 snippet 当越狱。
- 潜在的坑：void callback 无法变换 outbound；RAG 已写入 `systemPrompt` 后无法 silently drop，untrusted 命中只能 block 本回合；流式 delta 可能先于 redact 出现。
- 决定：**适配** Model Armor 入站 block / 出站 redact 切分；**自研** 轻量正则（无新 NLP 依赖）；出站密钥 **复用** `sensitiveKeyPolicy`。

## 2. 架构选择

- 落位：`derived`（纯 inspect）+ `actions`（persist 拦截 / finalize redact）+ 轻量 callback 注册
- 方案 A：pipeline 显式调用 inspect，callback 只作 A10 相位 — **选 A**，因为 `AgentCallbackHandler` 不能返回改写文本
- 拒绝：把规则塞进 Orchestrator / ChatWindow；改 A12 `after_model`

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `src/ai/security/semanticGuard.ts` | inspect + install + runInbound/applyOutbound | < 200 / 0 |
| `corpusScopeTypes.ts` | 可选 `trustTier` + 解析 helper | 数行 |
| persist / verticalFinalize / sendTurnCompletion | 入站 throw / 出站 redact / catch 文案 | 各 < 20 |
| `featureFlags.ts` | `aiSemanticGuardEnabled` 默认 false | 数行 |

约束自查：编排层不写规则；不引入 `src/features/`；无新 CSS。

## 4. ADR 引用

- 不新建 ADR。策略：[ai-agent-runtime-security-local-first.md](../../../architecture/ai-agent-runtime-security-local-first.md) §2–4。

## 5. Feature flag

- Flag 名：`aiSemanticGuardEnabled`（env `VITE_AI_SEMANTIC_GUARD_ENABLED`）
- 默认值：`false`（所有环境矩阵）
- Rollout：合并 → 自用 1 周 → dogfood 默认 true → 稳定后清 flag

## 6. 失败模式 / 兼容性

- flag off：inspect 不跑；现网字节级路径（除无副作用的 callback 相位调用）
- 入站 block：`SemanticGuardBlockedError` → catch 里 finalize error + 字典文案，不标连接失败
- 出站 redact 失败不得阻断 finalize（inspect 为纯函数）
- 无 Dexie 迁移：`trustTier` 为可选运行时字段

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元 | `npx vitest run src/ai/security src/ai/config/featureFlags.environmentMatrix.test.ts src/hooks/ai/useAiChat.sendTurnPersistAndPrimaryStream.test.ts src/hooks/ai/useAiChat.sendTurnCompletion.test.ts` | all pass |
| evals | `npx vitest run scripts/agent-evals/cases/semantic-cases.test.ts` + `npm run check:agent-evals:smoke` | OK |
| 守卫 | `npm run check:architecture-guard` + `check:docs-governance` | OK |
