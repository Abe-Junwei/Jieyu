---
title: agent-runtime-runner-foundation requirements
doc_type: execution-spec-requirements
status: active
owner: ai-governance
last_reviewed: 2026-09-02
source_of_truth: agent-runtime-runner-foundation-spec
---

# Requirements — Agent Runtime Runner Foundation (A10)

## 1. What & Why

- **要做什么**：把工具后果提交收敛到 Runner 基座——CallbackRegistry + AiToolCatalog SSOT + `commitToolEffects` 唯一写 `localToolState` / session 偏好。
- **为什么现在做**：主路线图 Wave 2；B4/B5 写工具硬前置；A7 Phase 1 已在 #118。
- **不做什么**：不引入 Google ADK；不做 A11 Preview UI、A9 semantic guard、A12 StepKind、MCP trust。

## 2. 用户场景

1. 自动执行写工具成功后，session 记忆只经 `commitToolEffects` 更新，且不把语段原文写入 `projectFacts`。
2. 本地 context 工具（search/list）结果合并进 `localToolState` 走同一提交点。
3. 后续 A9 可向 `AgentCallbackRegistry` 登记 `before_model` / `before_tool`，无需改 executor。

## 3. 验收标准（可测）

- [x] `assertAiToolCatalogParity` 绿；shadow 名称保持兼容 re-export
- [x] `executeAutoToolCall` / confirm / local-context 成功路径调用 `commitToolEffects`
- [x] `commitToolEffects` 不写 `projectFacts`
- [x] CallbackRegistry 按登记序执行 `before_tool` / `after_tool`
- [x] 每 send-turn 生成 `agentRunId` 并写入 tool decision audit metadata（A8 同 PR）

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Runtime | `src/ai/runtime/agentCallbacks.ts`、`commitToolEffects.ts`、`agentRunId.ts` | 新增 |
| Catalog | `src/ai/catalog/aiToolCatalog.ts`；`aiToolRegistryShadow.ts` re-export | 新增 / 兼容 |
| Hook | `useAiChat.autoExecute.ts`、`confirmExecution.ts`、`streamCompletion.ts`、`sendTurnPreflight.ts` | 改经 commit |
| 测试 | 上述对应 `*.test.ts` | 新增 / 修改 |

## 5. 已知风险与依赖

- 依赖 A7 policy 矩阵（#118）。hotspot：勿向 `useAiChat.sendTurnStreamPhase.ts` 堆逻辑。
- 回滚：revert；catalog 保留 shadow 别名避免 eval/MCP 断裂。
