---
title: agent-runtime-external-mcp-http-client design
doc_type: execution-spec-design
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-external-mcp-http-client-spec
depends_on:
  - ./requirements.md
  - ../../../architecture/ai-agent-runtime-security-local-first.md
  - ../../specs/agent-runtime-external-mcp-trust/design.md
---

# Design — External MCP HTTP Client (B13)

## 1. 成熟方案扫描 / Research

- 仓库既有：inbound `McpServer` JSON-RPC 2.0（不引入 SDK）；B11 `externalMcpTrustRegistry`；`mcp_tool_call_audits`；`MCP_CLIENT_REGISTRY` 空占位。
- 同类产品：MCP 2025-03-26 Streamable HTTP（单 endpoint POST）；2024-11-05 HTTP+SSE 已弃用；TS SDK `StreamableHTTPClientTransport` 体积与 OAuth 远超本仓需要。
- 业内规范：POST `Accept: application/json, text/event-stream`；响应 JSON 或 request-scoped SSE；`MCP-Protocol-Version`；tools/list 仍是投毒面（B11 扫描）。
- 公认不可行：引入 `@modelcontextprotocol/sdk`；恢复 CSP `https:` 通配；用 display name 当 URL；把 schema 先拼进 prompt 再扫描。
- 潜在的坑：Jieyu inbound 仍是 SSE `/messages` 202，**不是**本 client 的对端；flag 关必须零 fetch；Bearer 不得写入 Dexie。
- 决定：**适配** Streamable HTTP JSON（加最小 SSE `data:` 解析）；**复用** B11 expose 门面与 inbound audit 表；**自研** `fetch` client（不借 SDK）。

## 2. 架构选择

- 落位：`actions`（HTTP + audit）+ `derived`（JSON/SSE 解析）
- 方案 A：`externalMcpHttpClient.ts` 只 POST 已启用 origin — **选 A**
- 拒绝：在 Settings UI 里直接 fetch；在 `McpServer.ts` 里做 outbound；localStorage token

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `externalMcpHttpClient.ts` | list/call + 门 + audit | < 250 |
| `externalMcpHttpTransport.ts` | JSON/SSE 解析 + 写方法表 | < 80 |
| `mcpToolCallAudit.ts` | 可选 `agentRunId` | 数行 |
| `featureFlags.ts` | `aiExternalMcpHttpClientEnabled` 默认 false | 数行 |

约束自查：编排层不写规则；不引入 `src/features/`；无新 UI 边框。

## 4. ADR 引用

- 相关：ADR-0031 CSP connect-src（不放宽）；ADR-0030 inbound 只读
- 新建 ADR：否（transport 子集可演进）

## 5. Feature flag

- Flag：`aiExternalMcpHttpClientEnabled` / `VITE_AI_EXTERNAL_MCP_HTTP_CLIENT_ENABLED`
- 默认：`false`（全部环境）
- 放量：合并后自用 1 周再考虑；仍受 B11 flag 与 CSP 约束

## 6. 失败模式 / 兼容性

- 旧用户：flag 关 = 零网络；B11 表不改
- 迁移：audit 字段可选，不升 Dexie 版本
- 回滚：关 flag

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/ai/mcp/client src/db/engine.mcpToolCallAudits.test.ts src/ai/config/featureFlags.environmentMatrix.test.ts` | pass |
| 结构守卫 | `check:architecture-guard` + docs/plans | OK |
| Agent evals | `check:agent-evals:smoke` | OK |
