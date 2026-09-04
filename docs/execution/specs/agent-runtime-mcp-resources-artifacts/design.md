---
title: agent-runtime-mcp-resources-artifacts design
doc_type: execution-spec-design
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-mcp-resources-artifacts-spec
depends_on:
  - ./requirements.md
  - ../../../architecture/ai-agent-runtime-runner-model.md
---

# Design — MCP resources/prompts + AgentArtifactV0 (B12)

## 1. 成熟方案扫描 / Research

- 仓库既有：inbound `McpServer` JSON-RPC（tools/list|call，write hard-fail）；`ai_source_sets`；A12 `VERTICAL_WORKFLOW_REGISTRY_V0`；AdoptionQueue MVP（内存队列 + audit）。
- 同类产品：MCP 2024-11-05 `resources/list|read`（URI 身份）与 `prompts/list|get`；Claude/Cursor 用 prompt name 当 slash 命令，不另造 RPC。
- 业内规范：资源用 URI 而非 display name；prompts 与 workflow/skill 单真源（Anthropic P5.3）；artifact 引用链而非复制正文。
- 公认不可行：引入 `@modelcontextprotocol/sdk`；本切片做 outbound HTTP client（与 §10 任务表不符，属后续）；把 prompt 文案复制进 MCP 层。
- 潜在的坑：flag 关必须 Method not found；v52 须同步 a2a 守卫；B5b 页仍占位，只提供清单函数。
- 决定：**适配** MCP 读表面 JSON-RPC；**复用** `ai_source_sets` + vertical registry；**自研** Dexie `agent_artifacts`（不借 ADK ArtifactService）。

## 2. 架构选择

- 落位：`derived`（URI / prompt 映射）+ `actions`（artifact persist + audit）
- 方案 A：独立 `mcpReadSurfaces.ts` + `agentArtifact.ts`，McpServer 只 route — **选 A**
- 拒绝：把 list/read 写进 `McpServer.ts`；localStorage artifact；新 Settings tab

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `mcpReadSurfaces.ts` | resources/prompts 只读 handler | < 180 |
| `agentArtifact.ts` | persist / 引用 / B5b manifest | < 180 |
| `engine.ts` v52 | `agent_artifacts` | 迁移块 |
| `featureFlags.ts` | `aiMcpResourcesArtifactsEnabled` 默认 false | 数行 |

约束自查：编排层不写规则；不引入 `src/features/`；无 UI 边框。

## 4. ADR 引用

- 相关：ADR-0030 MCP 只读 scope；ADR-0031 CSP
- 新建 ADR：否

## 5. Feature flag

- Flag：`aiMcpResourcesArtifactsEnabled` / `VITE_AI_MCP_RESOURCES_ARTIFACTS_ENABLED`
- 默认：`false`（全部环境）
- 放量：合并后自用 1 周再考虑默认 true

## 6. 失败模式 / 兼容性

- 旧用户：flag 关 = 现网 MCP；无 artifact 行
- 迁移：v52 空表
- 回滚：关 flag

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/ai/mcp/server src/ai/vertical/agentArtifact.test.ts src/db/engine.agentArtifacts.test.ts` | pass |
| 结构守卫 | `check:architecture-guard` + docs/plans | OK |
| Agent evals | `check:agent-evals:smoke` | OK |
