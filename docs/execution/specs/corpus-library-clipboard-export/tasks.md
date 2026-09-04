---
title: corpus-library-clipboard-export tasks
doc_type: execution-spec-tasks
status: active
owner: corpus
last_reviewed: 2026-09-04
source_of_truth: corpus-library-clipboard-export-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Corpus Library Clipboard Export (B5b)

## Implementation tasks

- [x] `corpusWorksetExport.ts` golden plain / markdown
- [x] clipboard helper 特性检测
- [x] controller 只消费 basket；UI 两按钮
- [x] i18n 与 CHANGELOG / 路线图

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 触及域 `vitest`
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] Feature flag 仍默认 `false`
- [x] `/corpus` 占位 e2e 口径不变（flag 关；由现有 criticalPaths 覆盖，本切片不改该断言）

## Commit 阶段证据模板

```
feat(corpus): add B5b workset clipboard export

Verified:
- npm run typecheck
- npx vitest run src/pages/corpusWorksetExport.test.ts src/pages/CorpusLibraryPage.test.tsx src/pages/corpusBasketSession.test.ts src/pages/FeatureAvailabilityPage.layoutGuard.test.ts
- npm run check:architecture-guard
- npm run check:docs-governance
- npm run check:plans-frontmatter
- npm run check:dev-agent-workflow-verify
```

## Post-merge

- [ ] 自用后视放量再开 B5a-2 项目级索引
- [ ] spec `status: completed`
