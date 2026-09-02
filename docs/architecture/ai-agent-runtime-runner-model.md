---
title: AI Agent 运行时 Runner 模型（ADK 模式借设计 · 本地实现）
doc_type: architecture
status: active
owner: ai-governance
last_reviewed: 2026-09-02
source_of_truth: current-state
depends_on:
  - ./ai-agent-runtime-security-local-first.md
  - ./ai-chat-send-turn-pipeline.md
  - ./ai-execution-capability-strategy-matrix-v0.md
  - ../execution/plans/Agent运行时架构补强-本地优先落地方案-2026-06-01.md
---

# AI Agent 运行时 Runner 模型（ADK 模式借设计 · 本地实现）

> **不引入 Google ADK 框架**；本文描述自研 `useAiChat` 主链应对齐的 **Runner / yield / Catalog / Callback** 模型。  
> **排期真源**：[主路线图 A6–A14](../execution/plans/解语-主路线图-master-roadmap-2026-06-01.md) · [架构补强落地方案](../execution/plans/Agent运行时架构补强-本地优先落地方案-2026-06-01.md)

## 1. 与 ADK 的对照（借设计，不借依赖）

| ADK 原语 | Jieyu 落位 | 切片 |
| --- | --- | --- |
| **Runner** | `runAiChatSendTurn` + `commitToolEffects` | A7、A10 |
| **yield / suspend** | stream phase 结束 → tool pipeline → loop continuation | A10 |
| **Workflow agent** | `verticalWorkflowRegistry` + `composedWorkflowTemplates` | A12 |
| **Session state** | `AiSessionMemory`（turn 内） | 已有 |
| **Long-term memory** | `projectAiMemory` + Memory Broker + RAG | 已有 |
| **Callbacks** | `AgentCallbackRegistry`（`src/ai/runtime/agentCallbacks.ts`） | A9、A10 |
| **Tool catalog** | `AiToolCatalog` SSOT（`src/ai/catalog/aiToolCatalog.ts`）；shadow re-export | A10 |
| **Eval** | `agent-evals` + trajectory（规划） | A14 |
| **MCP tools** | 自研 server/client | B11、B12 |

## 2. 分层架构

```text
User / Voice
  → Send Turn Runner (runAiChatSendTurn)
       → AgentCallbackRegistry (before_turn / before_model / …)
       → CorpusSourceSet + Memory Broker
       → LLM stream (ChatOrchestrator)
       → toolDecisionPipeline
            → AiToolCatalog (schema + policy + writeMode)
            → assertToolWriteAllowed (A7)
            → commitToolEffects (A10)  ← 唯一写 session/audit/localToolState 提交点
       → runAgentLoop (LLM continuation)
       → VerticalWorkflow / ComposedWorkflow (A12)
       → AgentUiEvent bus → AlertsPanel preview (A11, flag `aiAgentUiPreviewEnabled`)
       → SemanticGuard outbound (A9)
  → Dexie audit / adoption / artifacts (B12)
```

## 3. Memory 写入边界

| 数据 | 层 | 写入点 |
| --- | --- | --- |
| tool 结果、localToolState | session | `commitToolEffects` |
| conversationSummary | session | turn end service |
| projectFacts / background | long-term | BackgroundMemoryExtractor（F4 sandbox） |
| 语段原文 | RAG / CorpusSourceSet | 不写入 memory 摘要 |
| 审计 | audit_logs | 与 `agentRunId` 同源（A8） |

## 4. 非目标

- 不引入 `@google/adk` / Python ADK 运行时  
- 不做 multi-agent swarm / root orchestrator  
- 通用 planner LLM、LangSmith SaaS — 见垂直方案 §2.2

## 5. 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-06-01 | 初版：Runner 模型对照表；并入架构补强 A10–A14。 |
| 2026-09-02 | Wave 2：Catalog / CallbackRegistry / `commitToolEffects` 落地；shadow 改为 re-export。 |
| 2026-09-02 | Wave 3 A11：`AgentUiEvent` bus → AlertsPanel preview（flag `aiAgentUiPreviewEnabled` 默认 false）。 |
