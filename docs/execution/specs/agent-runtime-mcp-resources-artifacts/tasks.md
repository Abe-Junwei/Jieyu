---
title: agent-runtime-mcp-resources-artifacts tasks
doc_type: execution-spec-tasks
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-mcp-resources-artifacts-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — MCP resources/prompts + AgentArtifactV0 (B12)

## Implementation tasks

- [x] Dexie v52 `agent_artifacts` + validator + io + a2a 版本断言 → 验证：`npx vitest run src/db/engine.agentArtifacts.test.ts src/db/engine.aiSessionMemories.test.ts src/db/migrations/jieyuDexieOpenReplay.test.ts`
- [x] `mcpReadSurfaces` + McpServer route；flag 关 Method not found → 验证：`npx vitest run src/ai/mcp/server`
- [x] `agentArtifact` persist + adoption `artifactIds` + B5b manifest → 验证：`npx vitest run src/ai/vertical/agentArtifact.test.ts`
- [x] flag 默认 false + 环境矩阵 → 验证：`npx vitest run src/ai/config/featureFlags.environmentMatrix.test.ts`
- [x] 路线图 / Runner / CHANGELOG 收口 B12 🟡 → 验证：`npm run check:docs-governance`

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 触及域 vitest
- [x] `npm run check:architecture-guard`
- [x] `npm run check:agent-evals:smoke`
- [x] `npm run check:docs-governance` + `npm run check:plans-frontmatter`
- [x] Flag 已注册且默认 `false`

## Commit 阶段证据模板

```
feat(ai): add B12 MCP resources/prompts and AgentArtifactV0

Verified:
- npm run typecheck
- npx vitest run <touched>
- spec: docs/execution/specs/agent-runtime-mcp-resources-artifacts/
```

## Post-merge

- [ ] 自用 1 周后评估 flag 默认值
- [ ] spec `status: completed` + `closed_at`
- [ ] ChatWindow / send-turn 接线另排（B13 已提供 HTTP 子集）
