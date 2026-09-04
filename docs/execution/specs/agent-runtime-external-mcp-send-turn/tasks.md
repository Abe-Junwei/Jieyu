---
title: agent-runtime-external-mcp-send-turn tasks
doc_type: execution-spec-tasks
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-external-mcp-send-turn-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — External MCP Send-Turn (B14)

## Implementation tasks

- [x] `aiExternalMcpSendTurnEnabled` 默认 false + 环境矩阵 → 验证：`npx vitest run src/ai/config/featureFlags.environmentMatrix.test.ts`
- [x] `lastToolsJson` 可选字段 + list/enable 写 → requery → 验证：trust / HTTP client / engine tests
- [x] `externalMcpTurnBridge` encode/guide/parse/execute；flag 关零 HTTP → 验证：`npx vitest run src/ai/mcp/client`
- [x] `buildAiSystemPrompt` 可选 guide；persist opening 注入 → 验证：`promptContext.tiered.test.ts`
- [x] `streamCompletion` local 空时路由 bridge（不改 ChatWindow）
- [x] Settings 拉取按钮（B13 HTTP flag）→ 验证：`SettingsAiMcpTrustSection.test.tsx`

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 触及域 `vitest`（`src/ai/mcp/client` 等）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:agent-evals:smoke`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] Feature flag 默认 `false`

## Commit 阶段证据模板

```
feat(ai): add B14 outbound MCP send-turn bridge

Verified:
- npm run typecheck
- npx vitest run <touched>
- spec: docs/execution/specs/agent-runtime-external-mcp-send-turn/
```

## Post-merge

- [ ] 自用后视 B11/B13 放量再考虑本 flag
- [ ] spec `status: completed` + `closed_at`
