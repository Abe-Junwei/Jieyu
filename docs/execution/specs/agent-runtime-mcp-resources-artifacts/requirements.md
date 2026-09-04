---
title: agent-runtime-mcp-resources-artifacts requirements
doc_type: execution-spec-requirements
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-mcp-resources-artifacts-spec
---

# Requirements — MCP resources/prompts + AgentArtifactV0 (B12)

## 1. What & Why

- **要做什么**：inbound Jieyu MCP 增加只读 `resources/list`+`resources/read`（CorpusSourceSet 快照 URI）与 `prompts/list`+`prompts/get`（vertical registry）；Dexie 持久化 `AgentArtifactV0` 并挂到 AdoptionQueue；提供 B5b 导出清单纯函数。
- **为什么现在做**：B11 allowlist 已合入条件满足；主路线图下一刀；A12 registry 是 prompts 真源。
- **不做什么**：不实现 outbound HTTP MCP client；不引入 `@modelcontextprotocol/sdk`；不改 ChatWindow / send-turn 编排；不开放 B5b 语料页；不做 `resources/subscribe`；不写 P5 skill 目录。

## 2. 用户场景（≤ 3 条）

1. Flag 关：既有 `tools/list` / `tools/call` 与 write `not_supported` 不变；`resources/*` 读方法仍 Method not found。
2. Flag 开：MCP 客户端列出 `jieyu://source-set/{id}`，`resources/read` 得到 Dexie 快照 JSON；`prompts/list` 与 A12 registry id 对齐。
3. 写入 artifact → reload → AdoptionItem.artifactIds 能 readback；导出清单函数可列出同一批 id。

## 3. 验收标准（可测）

- [x] `resources/read` URI readback 与 `ai_source_sets` 行一致
- [x] `prompts/list` 名称 ⊆ `VERTICAL_WORKFLOW_REGISTRY_V0` ids
- [x] `persistAgentArtifact` 写 → requery → 字段一致；adoption `artifactIds` 引用链
- [x] `buildB5bExportManifest` 含 artifactId + uri
- [x] `aiMcpResourcesArtifactsEnabled` 默认 `false`；flag 关不改变现网 MCP 读工具合同

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Schema / DB | `types.ts` `schemas.ts` `engine.ts` v52 `agent_artifacts` | 新增表 |
| Service | `src/ai/vertical/agentArtifact.ts` | 新增 |
| MCP | `mcpReadSurfaces.ts` + `McpServer.routeMethod` | 新增 / 装配 |
| Flag | `featureFlags.ts` | 新增 |
| 测试 | MCP + artifact + flag 矩阵 + open replay | 新增 |

## 5. 已知风险与依赖

- 依赖 B11 表链（v51）之上升 v52；flag 关零行为变化。
- `-32002` 已用于 write `not_supported`；resource missing 用同一码、不同 message（MCP 规范）。
- 回滚：关 flag；空表可留。
