---
title: agent-runtime-external-mcp-provider-adapters tasks
doc_type: execution-spec-tasks
status: active
owner: ai-governance
last_reviewed: 2026-09-04
source_of_truth: agent-runtime-external-mcp-provider-adapters-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — External MCP Provider Adapters (B15)

## Implementation tasks

- [x] flag 默认 false + 环境矩阵
- [x] 适配器指纹 + EvidencePacket 映射 + flag-off
- [x] send-turn 成功结果附 packets
- [x] Settings 预置填草稿（不写库）
- [x] CSP 枚举 loopback 8765；路线图 / CHANGELOG

## Pre-merge gates

- [ ] `npm run typecheck`
- [ ] 触及域 `vitest`
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:agent-evals:smoke`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] Feature flag 默认 `false`

## Commit 阶段证据模板

```
feat(ai): add B15 Zotero/OpenAlex MCP adapters

Verified:
- npm run typecheck
- npx vitest run src/ai/mcp/client ...
```

## Post-merge

- [ ] 自用后视 B11–B14 放量再考虑本 flag
- [ ] spec `status: completed`
