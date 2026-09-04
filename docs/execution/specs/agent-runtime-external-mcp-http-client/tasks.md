---
title: agent-runtime-external-mcp-http-client tasks
doc_type: execution-spec-tasks
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-external-mcp-http-client-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — External MCP HTTP Client (B13)

## Implementation tasks

- [x] `aiExternalMcpHttpClientEnabled` 默认 false + 环境矩阵 → 验证：`npx vitest run src/ai/config/featureFlags.environmentMatrix.test.ts`
- [x] `externalMcpHttpClient` list/call + flag/trust/write gates → 验证：`npx vitest run src/ai/mcp/client`
- [x] `mcp_tool_call_audits.agentRunId` 写 → requery → 验证：`npx vitest run src/db/engine.mcpToolCallAudits.test.ts`
- [x] 路线图 / Runner / 安全策略 / CHANGELOG 收口 B13 → 验证：`npm run check:docs-governance`

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 触及域 vitest
- [x] `npm run check:architecture-guard`
- [x] `npm run check:agent-evals:smoke`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter`
- [x] Flag 已注册且默认 `false`

## Commit 阶段证据模板

```
feat(ai): add B13 outbound Streamable HTTP MCP client

Verified:
- npm run typecheck
- npx vitest run src/ai/mcp/client src/db/engine.mcpToolCallAudits.test.ts
- spec: docs/execution/specs/agent-runtime-external-mcp-http-client/
```

## Post-merge

- [ ] 自用 1 周后评估 flag 默认值
- [ ] spec `status: completed` + `closed_at`
- [ ] ChatWindow / send-turn 接线另排
- [ ] B5b 语料页仍占位
