---
title: agent-runtime-external-mcp-http-client requirements
doc_type: execution-spec-requirements
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-external-mcp-http-client-spec
---

# Requirements — External MCP HTTP Client (B13)

## 1. What & Why

- **要做什么**：自研 outbound Streamable HTTP JSON-RPC 子集（`tools/list` + `tools/call`），只打 B11 已启用 origin；结果进 LLM 前仍走 `exposeExternalMcpToolsToLlm`；MCP audit 写入 `agentRunId`。
- **为什么现在做**：B11/B12 已进 main；主路线图把 outbound HTTP 标为 Agent 轨余量；没有 client 则 allowlist 无法对真实 `tools/list` 取样。
- **不做什么**：不引入 `@modelcontextprotocol/sdk`；不实现 HTTP+SSE 双端点 / OAuth / GET 长连接；不接 ChatWindow / send-turn；不接 Zotero/OpenAlex 专用；不改 `connect-src` 通配；不开放 B5b 语料页。

## 2. 用户场景（≤ 3 条）

1. Flag 关：任何 origin 都 **不** 发 HTTP。
2. B11 已启用 origin：`listExternalMcpToolsViaHttp` POST `tools/list`，A9 扫描通过后才返回 schema；audit 含 `agentRunId` 可 requery。
3. 写向 JSON-RPC（`resources/create` 等）或未启用 origin：不发网络，返回 deny。

## 3. 验收标准（可测）

- [ ] `aiExternalMcpHttpClientEnabled` 默认 `false`；flag 关零 fetch
- [ ] 未登记 / 未启用 origin 零 fetch
- [ ] `tools/list` JSON 与 SSE `data:` 均可解析
- [ ] 返回 tools 前必须 `exposeExternalMcpToolsToLlm` 允许
- [ ] `tools/call` 写方法 `-32002 not_supported` 且零 fetch
- [ ] `mcp_tool_call_audits` 写 → requery 含可选 `agentRunId`

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Service | `src/ai/mcp/client/externalMcpHttpClient.ts` | 新增 |
| Audit | `mcpToolCallAudit.ts` + `McpToolCallAuditDoc` | 增 `agentRunId` |
| Flag | `featureFlags.ts` / `vite-env.d.ts` | 新增 |
| 测试 | client + engine mcp audits + flag 矩阵 | 新增 / 修改 |
| Docs | roadmap / architecture / CHANGELOG | 收口 B13 |

## 5. 已知风险与依赖

- 依赖 B11 allowlist + A9 inspect；浏览器 CSP 仍拦截未列入 `connect-src` 的 host（ADR-0031，不放宽）。
- 回滚：关 `aiExternalMcpHttpClientEnabled`。
