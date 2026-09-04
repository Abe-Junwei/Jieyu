# MCP Client

PR-20 类型预留 + **B11 origin allowlist**。Outbound HTTP/SSE client 仍属 **B12**。

## 计划对接的 MCP Server

- **Zotero MCP**：写作引用管理
- **OpenAlex MCP**：文献检索

## 当前状态

- `mcpClientTypes.ts`：类型定义与空注册表
- `externalMcpTrustRegistry.ts`：规范化 origin、Dexie `external_mcp_trust`、`exposeExternalMcpToolsToLlm` 门面。未登记 / 未启用 / flag off 的 `tools/list` **不得**进 LLM。
- 检索结果将自动包装为 `EvidencePacket`，进入 AI 侧边栏「文献问答」workflow（B12 接线）

## 下一步

B12：HTTP/SSE transport、`resources/list` / `prompts/list`、`AgentArtifactV0`。调用方只经 `exposeExternalMcpToolsToLlm`。
