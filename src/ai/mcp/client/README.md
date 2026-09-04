# MCP Client / Server

Inbound Jieyu MCP server supports tools plus **B12** `resources/list|read` and `prompts/list|get` (flag `aiMcpResourcesArtifactsEnabled`, default false).

Outbound **B13** Streamable HTTP client (`externalMcpHttpClient.ts`) POSTs `tools/list` / `tools/call` to B11-enabled origins (flag `aiExternalMcpHttpClientEnabled`, default false). **B14** send-turn bridge (`externalMcpTurnBridge.ts`) injects cached `extmcp__` tools into the system prompt and executes them after local tools (flag `aiExternalMcpSendTurnEnabled`, default false). **B15** Zotero/OpenAlex adapters (`externalMcpProviderAdapters.ts`) map known `tools/call` text JSON to `EvidencePacketV0` and offer Settings origin drafts (flag `aiExternalMcpProviderAdaptersEnabled`, default false). It does not use `@modelcontextprotocol/sdk`. ChatWindow is not modified.

## 计划对接的 MCP Server

- **Zotero MCP**：写作引用管理（HTTP Streamable 默认环回 `http://127.0.0.1:8765/mcp`；浏览器不 spawn stdio、不直连 `:23119`）
- **OpenAlex MCP**：文献检索（自托管 HTTP MCP；无单一官方公网 URL；默认 CSP 不放行公网 host）

## 当前状态

- `mcpClientTypes.ts`：类型定义与空注册表（预置 drafts 在 adapters，避免循环依赖）
- `externalMcpTrustRegistry.ts`：B11 origin allowlist + 可选 `lastToolsJson` 缓存；schema 扫描为逐工具全文（含 `inputSchema`），无合并 16k 截断
- `externalMcpHttpClient.ts`：B13 Streamable HTTP JSON-RPC 子集
- `externalMcpTurnBridge.ts`：B14 send-turn guide / parse / execute
- `externalMcpProviderAdapters.ts`：B15 指纹 + EvidencePacket 映射 + Settings 预置
- `mcpReadSurfaces.ts`：CorpusSourceSet URI + A12 workflow prompts
- `agentArtifact.ts`：Dexie `agent_artifacts` + B5b export manifest helper

## 下一步

B5b 语料页（阻塞于 B5a）。远端 OpenAlex HTTP MCP 仍需部署层 CSP 枚举具体 host（ADR-0031，不恢复 `https:` 通配）。
