# MCP Client / Server

Inbound Jieyu MCP server supports tools plus **B12** `resources/list|read` and `prompts/list|get` (flag `aiMcpResourcesArtifactsEnabled`, default false). Outbound HTTP/SSE client is **not** implemented.

## 计划对接的 MCP Server

- **Zotero MCP**：写作引用管理（outbound，未做）
- **OpenAlex MCP**：文献检索（outbound，未做）

## 当前状态

- `mcpClientTypes.ts`：类型定义与空注册表
- `externalMcpTrustRegistry.ts`：B11 origin allowlist
- `mcpReadSurfaces.ts`：CorpusSourceSet URI + A12 workflow prompts
- `agentArtifact.ts`：Dexie `agent_artifacts` + B5b export manifest helper

## 下一步

Outbound HTTP/SSE transport 仍未排独立切片。调用外部 tools 只经 `exposeExternalMcpToolsToLlm`。
