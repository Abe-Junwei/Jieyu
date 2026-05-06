# MCP Client (预留)

PR-20 数据结构预留，无 runtime 实现。

## 计划对接的 MCP Server

- **Zotero MCP**：写作引用管理
- **OpenAlex MCP**：文献检索

## 当前状态

- `mcpClientTypes.ts`：类型定义与空注册表
- 检索结果将自动包装为 `EvidencePacket`，进入 AI 侧边栏「文献问答」workflow

## 下一步

待 MCP Server 生态稳定后，实现 HTTP/SSE transport 与认证层。
