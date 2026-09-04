---
title: agent-runtime-external-mcp-trust tasks
doc_type: execution-spec-tasks
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-external-mcp-trust-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — External MCP Trust (B11)

## Implementation tasks

- [x] Dexie v51 `external_mcp_trust` + validator + io 名单 + a2a 守卫版本断言 → 验证：`npx vitest run src/db/engine.externalMcpTrust.test.ts src/db/engine.aiSessionMemories.test.ts`
- [x] `externalMcpTrustRegistry`：normalize、enable、expose、A9 scan、audit_logs → 验证：`npx vitest run src/ai/mcp/client/externalMcpTrustRegistry.test.ts`
- [x] flag `aiExternalMcpTrustEnabled` 默认 false + 环境矩阵 → 验证：`npx vitest run src/ai/config/featureFlags.environmentMatrix.test.ts`
- [x] Settings AI 节 `SettingsAiMcpTrustSection` + catalog 文案 → 验证：定向 vitest
- [x] 路线图 / 安全架构 / CHANGELOG 收口 B11 🟡 → 验证：`npm run check:docs-governance`

## Pre-merge gates

- [ ] `npm run typecheck`
- [ ] 触及域 vitest（上列路径）
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:agent-evals:smoke`
- [ ] `npm run check:docs-governance` + `npm run check:plans-frontmatter`
- [ ] Flag 已注册且默认 `false`

## Commit 阶段证据模板

```
feat(ai): add B11 external MCP trust allowlist

Verified:
- npm run typecheck
- npx vitest run <touched>
- spec: docs/execution/specs/agent-runtime-external-mcp-trust/
```

## Post-merge

- [ ] 自用 1 周后评估 flag 默认值
- [ ] spec `status: completed` + `closed_at`
