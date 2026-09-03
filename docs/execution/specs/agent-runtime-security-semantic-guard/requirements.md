---
title: agent-runtime-security-semantic-guard requirements
doc_type: execution-spec-requirements
status: active
owner: ai-governance
last_reviewed: 2026-09-03
source_of_truth: agent-runtime-security-semantic-guard-spec
---

# Requirements — Agent Runtime Semantic Guard (A9)

## 1. What & Why

- **要做什么**：在浏览器内对入站（用户 prompt + 非信任 RAG 片段）做注入拦截、对出站（assistant 终稿）做 PII/密钥 redact，挂在 A10 `before_model` / `before_client`。
- **为什么现在做**：Wave 4 下一刀；间接注入与出站泄露已写入安全策略，B11 schema 进 LLM 前须有本地扫描。
- **不做什么**：云端 Model Armor / NHI；B11 MCP trust UI；A13 TaskRunner；A14 trajectory；不改 ChatWindow；不改 A12 `after_model`。

## 2. 用户场景（≤ 3 条）

1. 用户发送越狱/覆盖指令：flag 开时本回合不调用 LLM，助手以字典文案标 error。
2. 导入 PDF/笔记经 RAG 带入注入句：按 `untrusted` 扫描并拦截；工作区语段 snippet 不当作越狱。
3. 助手终稿含邮箱或 `api_key=`：客户端落盘/上屏前 redact；flag 关时路径与现网一致。

## 3. 验收标准（可测）

- [ ] `inspectInbound` / `inspectOutbound` 纯函数单测覆盖注入 block 与 PII/密钥 redact
- [ ] `aiSemanticGuardEnabled` 默认 `false`（全部环境矩阵）；env 可覆盖
- [ ] flag 开时 persist 在 `createAssistantStream` 前拦截；`before_model` / `before_client` 被调用
- [ ] `CorpusSourceSet.trustTier` 可选；缺省 `workspace`；pdf/note 按 `untrusted`
- [ ] `adversarial-semantic-guard-*` eval 经 `semantic-cases` 断言 block/redact

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Security | `src/ai/security/semanticGuard.ts` | 新增 |
| Runtime | `src/ai/runtime/agentCallbacks.ts` | 可选 ctx 字段；A9 注册 |
| Corpus | `src/ai/vertical/corpusScopeTypes.ts` | `trustTier` |
| Hook | `useAiChat.sendTurnPersistAndPrimaryStream.ts`、finalize / catch | 入/出站接线 |
| Flag / i18n / messages | `featureFlags.ts`、dictKeys、`semanticGuardFeedback.ts` | 新增 |
| 测试 / evals | `semanticGuard.test.ts`、`scripts/agent-evals/cases/` | 新增 |

## 5. 已知风险与依赖

- 流式 token 可能先于 redact 上屏；本切片只保证终稿/`before_client`。
- 工作区语段含“ignore previous instructions”字面时不得误杀（仅 user text + untrusted RAG）。
- 回滚：关 flag。
