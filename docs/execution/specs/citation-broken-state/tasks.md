---
title: citation-broken-state tasks
doc_type: execution-spec-tasks
status: active
owner: corpus
last_reviewed: 2026-09-05
source_of_truth: citation-broken-state-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Citation Broken State (B6)

## Implementation tasks

- [x] `citationResolver.ts`：unit live/broken + 残留 segment 不复活已删 unit → `npx vitest run src/services/citationResolver.test.ts`
- [x] `citationJump` 消费 resolver → `npx vitest run src/pages/TranscriptionPage.citationJump.test.ts`
- [x] footer 省略 index-miss snippet → `npx vitest run src/utils/citationFootnoteUtils.test.ts`
- [x] 悬空 lexeme 链接 brokenCode + IGT 文案 → `npx vitest run src/pages/annotation/saveAnnotationLexemeLink.test.ts`
- [x] ADR-0011 错误码表 + 路线图 / 代码地图回写 → `npm run check:docs-governance`

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 vitest（上列路径）
- [x] 触及交互 / ReadyWorkspace / 侧栏 / 时间轴：N/A（jump 单测覆盖）
- [x] `npm run check:architecture-guard`
- [x] `src/ai/**`：N/A
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag

## Commit 阶段证据模板

```
fix(citation): surface broken refs after unit delete

Verified:
- npx vitest run <paths>
- npm run typecheck
- spec: docs/execution/specs/citation-broken-state/
```

## Post-merge

- [ ] 无 flag 可切
- [ ] spec `status: completed` + `closed_at` 在稳定后更新
