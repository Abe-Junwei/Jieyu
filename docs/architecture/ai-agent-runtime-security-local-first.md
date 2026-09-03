---
title: AI Agent 运行时安全 — 本地优先策略
doc_type: architecture
status: active
owner: ai-governance
last_reviewed: 2026-09-03
source_of_truth: current-state
depends_on:
  - ./ai-execution-capability-strategy-matrix-v0.md
  - ./ai-chat-send-turn-pipeline.md
  - ./ai-agent-runtime-runner-model.md
  - ../adr/0031-ai-chat-keyvault-and-csp-connect-src.md
  - ../execution/plans/Agent运行时架构补强-本地优先落地方案-2026-06-01.md
---

# AI Agent 运行时安全 — 本地优先策略

> **排期真源**：[解语主路线图 §3 A6–A14](../execution/plans/解语-主路线图-master-roadmap-2026-06-01.md)  
> **任务分解**：[Agent运行时架构补强-本地优先落地方案](../execution/plans/Agent运行时架构补强-本地优先落地方案-2026-06-01.md)（含 A6–A9 安全轨 + A10–A14 架构轨）  
> **Runner 模型**：[ai-agent-runtime-runner-model.md](./ai-agent-runtime-runner-model.md)

## 1. 定位与边界

解语 **不是** 通用 Agent 平台，也 **不** 引入 Google Model Armor / IBM NHI 编排云产品。运行时安全目标对齐产品 North Star：

| 原则 | 含义 |
| --- | --- |
| **证据型、人在环** | AI 默认 proposal / 确认；禁止静默写转写主链 |
| **本地优先** | 策略与过滤在浏览器内执行；不依赖额外 SaaS 安全层 |
| **Last Mile 再验** | 每次工具写 Dexie 前重新判定 scope + trust + policy |
| **可复盘** | 审计链能回答：谁、在什么 scope、委托了什么、工具做了什么 |

**刻意不做**（除非产品形态变更）：企业 NHI 注册中心、A2A 全套认证、Agent SBOM 平台、Co-work 式用户 impersonation 专项、云端 Model Armor。

## 2. 威胁模型（Jieyu 语境）

| 威胁 | 典型场景 | 主要防线 |
| --- | --- | --- |
| **间接 prompt 注入** | 导入 PDF/笔记/语段经 RAG 进 system 上下文 | CorpusSourceSet 限定 + 入站 semantic guard（A9） |
| **工具越权写** | 模型调用写工具改 scope 外语段 | Last Mile gate + per-tool 矩阵 + destructiveGate（A7） |
| **旁路写 session/记忆** | 用户指令 / 后台 flush 绕过主链 | F4 sandbox + sidecar 审计（A6，已有 Batch A） |
| **出站敏感泄露** | 转写/元数据 PII 进入 assistant 回复 | 出站 redact + 日志 scrub（A9；已有 `sensitiveKeyPolicy`） |
| **外部 MCP 数据外泄** | Jieyu AI 调 OpenAlex 等外部 server | MCP trust allowlist + 只读默认（B11） |
| **凭证泄露** | API key 明文落盘 / XSS 外连 | KeyVault + CSP connect-src（ADR-0031，维持） |

## 3. 能力映射（对标 Google / IBM 视频 → Jieyu 实现）

| 外部概念 | Jieyu 落位 | 切片 |
| --- | --- | --- |
| Model Armor 入站过滤 | `src/ai/security/semanticGuard.ts`（规则 + 可选启发式） | A9 |
| Model Armor 出站 PII redact | 同上 + 复用 `observability/sensitiveKeyPolicy` | A9 |
| Tool 持凭证、Agent 不碰 | 已有 KeyVault；MCP Bearer 在 server 侧 | 维持 |
| IBM Register agents | `agentRunId` 写入 `ai_tool_call_decision` / loop step / MCP audit | A8 |
| IBM JIT / strip privileges | 扩展 `aiToolPolicyMatrix` + session `toolPreferences`；写 scope 绑定 `CorpusSourceSet` | A7 |
| IBM Tie intent to action | turn metadata：`userTextDigest`、`sourceScopeSummary`、`workflowId` | A8 |
| IBM Last Mile / point of use | 统一 `assertToolWriteAllowed()` 于 executor 入口 | A7 |
| IBM Observability | 已有 audit + replay；A8 补用户可复盘字段 | A8 |
| F4 后台隔离 | Batch B/C + 工业三开关 evidence | A6 |

## 4. 架构分层

```text
User / Voice
  → Send Turn Pipeline (useAiChat)
  → [A9] SemanticGuard.inspectInbound (prompt + RAG snippets)
  → CorpusSourceSet / sourceScopeSummary
  → toolDecisionPipeline
       → resolveUserDirectivePolicyDecision  (session JIT)
       → resolveDestructiveGate
  → tool executors
       → [A7] assertToolWriteAllowed(tool, scope, policyMatrix)
       → Dexie / Service write
  → [A9] SemanticGuard.inspectOutbound (assistant + tool payload)
  → Client

Parallel:
  Background / sidecar → F4 sandbox (A6)
  MCP Server (inbound) → Bearer + scope hard-fail (已有)
  MCP Client (outbound) → B11 trust registry (未来)
```

## 5. A6 落地口径（F4 Batch B/C + 工业三开关）

截至 2026-09-02，A6 不再是从零建设：

| 项 | 代码 / 门禁 | 环境默认 |
| --- | --- | --- |
| Batch A 旁路 | 置顶 directive + send-preflight + 后台记忆 flush 走 sandbox | — |
| Batch B 写入口登记 | `npm run check:ai-session-sidecar-entrypoints` 白名单；新增 `applyUserDirectivesToSessionMemory` 必须先登记再接线 | — |
| Batch C 可观测 | `npm run gate:release-evidence:session-sidecar-sandbox`；`gate:release-evidence:governance:strict` | — |
| 工业三开关 | `aiBackgroundToolSandboxEnabled` / `aiBackgroundMemorySessionWriteQuotaEnabled` / `aiToolCallExecutorAutoRetryEnabled` | **dogfood / staging ON**；**prod / local OFF**（可用 `VITE_AI_*` 覆盖） |

环境矩阵测试：`src/ai/config/featureFlags.environmentMatrix.test.ts`。

## 6. A9 落地口径（本地 semantic guard）

截至 2026-09-03，A9 以 **flag 默认 false** 进主链：

| 项 | 代码 | 行为 |
| --- | --- | --- |
| 入站 | `inspectInbound` → persist `createAssistantStream` 前 | 用户 prompt 越狱 / `untrusted` RAG（pdf/note）注入 → `SemanticGuardBlockedError`，不调 LLM |
| 出站 | `inspectOutbound` → finalize / stream fallback | 邮箱 + query/赋值密钥 redact；复用 `sensitiveKeyPolicy` |
| Callback | `before_model` / `before_client` | 相位触发；改写仍由 pipeline 显式调用（handler 为 void） |
| Flag | `aiSemanticGuardEnabled` / `VITE_AI_SEMANTIC_GUARD_ENABLED` | **全部环境默认 false** |

工作区语段 snippet 不按越狱扫描。流式 delta 可能先于 redact 上屏；终稿与落盘走 redact 后文本。

## 7. 与现有文档关系

| 文档 | 关系 |
| --- | --- |
| [ai-execution-capability-strategy-matrix-v0.md](./ai-execution-capability-strategy-matrix-v0.md) | scope / trust / quota 词汇表；A7 扩展矩阵列 |
| [F4 受控矩阵](../execution/plans/F4-扩展入口-受控矩阵-2026-05-05.md) | 旁路入口登记；A6 延续 Batch B/C |
| [ai-agent-architecture-risk-assessment](../execution/audits/ai-agent-architecture-risk-assessment-2026-05-17.md) | 可靠性 P0（闭环重规划）仍属 A4，与安全轨并行 |
| [ADR-0031](../adr/0031-ai-chat-keyvault-and-csp-connect-src.md) | KeyVault / CSP 边界不因 A9 而夸大 |
| [A9 SDD](../execution/specs/agent-runtime-security-semantic-guard/) | 入/出站规则与 flag 验收 |

## 8. 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-06-01 | 初版：本地优先 Agent 运行时安全策略；切片 A6–A9 / B11 映射；并入主路线图。 |
| 2026-06-01 | 对齐架构补强：排期扩至 A6–A14；任务真源改 [架构补强落地方案](../execution/plans/Agent运行时架构补强-本地优先落地方案-2026-06-01.md)；链 [Runner 模型](./ai-agent-runtime-runner-model.md)。 |
| 2026-09-02 | A6 落地口径：sidecar 入口守卫 + 工业三开关环境矩阵（dogfood/staging ON、prod OFF）记入本文。 |
| 2026-09-03 | A9 落地口径：本地 inspect 入站 block / 出站 redact；flag 默认 false。 |
