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

- [x] `npm run typecheck`
- [x] 触及域 `vitest`（12 files / 37 passed）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:agent-evals:smoke`（4/4）
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] Feature flag 默认 `false`

## Commit 阶段证据模板

```
feat(ai): add B15 Zotero/OpenAlex MCP adapters

Verified:
- npm run typecheck
- npx vitest run src/ai/mcp/client src/ai/config/featureFlags.environmentMatrix.test.ts src/components/settings/SettingsAiMcpTrustSection.test.tsx src/components/settings/SettingsAiMcpTrustSection.presets.test.tsx src/components/settings/SettingsAiMcpTrustSection.fetchTools.test.tsx → 12 files / 37 passed
- npm run check:architecture-guard
- npm run check:docs-governance
- npm run check:plans-frontmatter
- npm run check:dev-agent-workflow-verify
- npm run check:agent-evals:smoke → 4/4
```

## Post-merge

- [ ] 自用后视 B11–B14 放量再考虑本 flag
- [ ] spec `status: completed`
