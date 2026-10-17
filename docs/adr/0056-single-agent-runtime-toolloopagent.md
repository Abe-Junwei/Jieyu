---
title: ADR 0056 - 智能体只有一个运行时：Vercel AI SDK ToolLoopAgent
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: decision-record
---

# ADR 0056：智能体只有一个运行时：Vercel AI SDK ToolLoopAgent

## 状态

accepted。

## 背景

A15（#314）定了智能体运行时用 Vercel AI SDK `ToolLoopAgent`。R1、R2 代码已在 main，flag `aiAgentRuntimeV2Enabled` 默认关。

B16b、B17 却按旧的 `agentLoopRunner` 写了多步行为，计划也写了「不并进 A15」。旧循环把工具结果编成文本塞回模型，外部 MCP 结果不触发续跑。v2 回合只把聊天工具交给模型，本地上下文工具和外部 MCP 都不在里面。结果是同一项能力在一个运行时可用，在另一个运行时不可用。

## 决策

1. 智能体运行时只有 `ToolLoopAgent`（`src/ai/runtime/`）。下面这些只在这里做：模型调用、结构化工具调用与结果、多步循环与停止、写工具审批（`toolApproval`）、工具错误作为工具结果、结构化输出（`generateText` + `Output.object`）。
2. 旧循环（`src/ai/chat/agentLoopRunner.ts`、`agentLoop.ts`、`tool_result_payload:` 文本续跑）冻结。只修 bug，不加能力，不加新的续跑条件。行数由 `check:architecture-guard` 锁住。R4 决定删除时间。
3. 新的智能体能力拆两半。领域部分写成工具或纯函数，例如查询、作用域、策略、写入门禁、审计、A9、主张核对、证据映射。运行时部分只接 `ToolLoopAgent`，例如「结果回到模型再写下一轮」或跨步汇总。领域部分不得依赖某一个运行时的私有形状，例如 `localToolResults`。
4. 工具按迁移评估 R3 分批交给 v2，每批不超过 5 个。一项能力在 v2 拿不到自己的工具时，不算端到端完成。
5. 不经 Vercel AI Gateway。只传 provider 实例。R1 不达标才对照 OpenAI Agents SDK。不用 LangGraph、Mastra。

## 后果

- 门槛、护栏和 R0–R4 留在[迁移评估](../execution/plans/AI智能体运行时迁移评估-2026-10-13.md)。排序和每项能力归哪一层留在[主路线图](../execution/plans/解语-主路线图-master-roadmap-2026-06-01.md) §2.2.0。
- 旧路径在 R4 之前仍是默认路径。领域修复要两条路都能用。
- 本决定取代 B16b、B17 计划里「多步续跑不并进 A15」的说法。
