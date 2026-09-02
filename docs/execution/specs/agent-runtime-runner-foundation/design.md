---
title: agent-runtime-runner-foundation design
doc_type: execution-spec-design
status: active
owner: ai-governance
last_reviewed: 2026-09-02
source_of_truth: agent-runtime-runner-foundation-spec
depends_on:
  - ./requirements.md
  - ../../../architecture/ai-agent-runtime-runner-model.md
---

# Design — Agent Runtime Runner Foundation (A10)

## 1. 成熟方案扫描 / Research

- 仓库既有：`AI_TOOL_REGISTRY_SHADOW`（schema+policy+writeMode）、`buildPostExecSessionMemory`、`mergeLocalToolSessionState`、`toolWriteGate`、`toolDecisionPipeline`
- 同类产品：Google ADK Runner 将 **Plugin callbacks** 挂在 Runner（`before_tool` / `after_tool` 等），Tool Catalog 为 schema 真源；LangGraph 用 node 提交 state，禁止旁路 `update`
- 业内 best practice：单一 commit 点提交工具副作用；catalog 与 executor/eval 只读；callbacks 可短路（本切片不实现短路，留给 A9）
- 公认不可行：引入 `@google/adk` 运行时；把业务写进 Orchestrator；每条工具路径各自 `setSessionMemory`
- 潜在的坑：shadow 已被 MCP/evals 引用，必须 re-export；batch local tools 应合并后再一次 commit，避免逐步 persist
- 决定：**适配** ADK 的 Runner/Catalog/Callback 形状，**自研** 最小 TypeScript 实现，复用现有 shadow 与 post-exec patch

## 2. 架构选择

- 落位：`actions`（commit）+ `routing`（callbacks）+ `derived`（catalog）
- 方案 A：抽出 `commitToolEffects` 供 auto/confirm/local 共用 — **选 A**，改动面小、可 grep 旁路
- 拒绝：把 session 写入下沉到每个 executor（旁路会继续扩散）

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `src/ai/runtime/agentCallbacks.ts` | 五相位 registry | < 80 / 0 hooks |
| `src/ai/catalog/aiToolCatalog.ts` | Catalog SSOT；shadow re-export | < 90 |
| `src/ai/runtime/commitToolEffects.ts` | 唯一 session/localToolState 提交 | < 120 |
| `src/ai/runtime/agentRunId.ts` | `newAgentRunId()` | < 20 |
| `src/hooks/ai/useAiChat.autoExecute.ts` 等 | 改经 commit；before/after_tool | 接线 |

约束自查：不引入 `src/features/`；编排层不承载提交逻辑。

## 4. ADR 引用

- 不新建 ADR（可逆的内部提交点）。架构：[ai-agent-runtime-runner-model.md](../../../architecture/ai-agent-runtime-runner-model.md)

## 5. Feature flag

- A10 提交点无新 flag（行为应与现网一致，只换入口）
- A4b（同 Wave 2）：`aiAgentLoopEffortScalingEnabled` 默认 `false`

## 6. 失败模式 / 兼容性

- 旧路径：shadow 符号保留；audit metadata 增可选 `agentRunId`
- 回滚：revert PR；flag off 即关闭 effort scaling

## 7. 验证矩阵

| 验证 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元 | `npx vitest run src/ai/runtime src/ai/catalog src/hooks/ai/useAiChat.autoExecute.test.ts` | pass |
| 守卫 | `npm run check:architecture-guard` + `check:agent-evals:smoke` | OK |
| docs | `npm run check:docs-governance` | OK |
