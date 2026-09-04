# MCP Client / Server

Inbound Jieyu MCP server supports tools plus **B12** `resources/list|read` and `prompts/list|get` (flag `aiMcpResourcesArtifactsEnabled`, default false).

Outbound **B13** Streamable HTTP client (`externalMcpHttpClient.ts`) POSTs `tools/list` / `tools/call` to B11-enabled origins (flag `aiExternalMcpHttpClientEnabled`, default false). **B14** send-turn bridge (`externalMcpTurnBridge.ts`) injects cached `extmcp__` tools into the system prompt and executes them after local tools (flag `aiExternalMcpSendTurnEnabled`, default false). It does not use `@modelcontextprotocol/sdk`. ChatWindow is not modified.

## 计划对接的 MCP Server

- **Zotero MCP**：写作引用管理（outbound transport 已有，专用适配未做）
- **OpenAlex MCP**：文献检索（outbound transport 已有，专用适配未做）

## 当前状态

- `mcpClientTypes.ts`：类型定义与空注册表
- `externalMcpTrustRegistry.ts`：B11 origin allowlist + 可选 `lastToolsJson` 缓存
- `externalMcpHttpClient.ts`：B13 Streamable HTTP JSON-RPC 子集
- `externalMcpTurnBridge.ts`：B14 send-turn guide / parse / execute
- `mcpReadSurfaces.ts`：CorpusSourceSet URI + A12 workflow prompts
- `agentArtifact.ts`：Dexie `agent_artifacts` + B5b export manifest helper

## 下一步

Zotero/OpenAlex 专用适配另排。浏览器 CSP `connect-src` 不因本切片放宽（ADR-0031）。
