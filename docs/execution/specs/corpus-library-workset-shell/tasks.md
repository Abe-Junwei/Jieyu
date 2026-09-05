---
title: corpus-library-workset-shell tasks
doc_type: execution-spec-tasks
status: active
owner: corpus
last_reviewed: 2026-09-04
source_of_truth: corpus-library-workset-shell-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Corpus Library Workset Shell (B5a-1)

## Implementation tasks

- [x] flag 默认 false + 环境矩阵
- [x] 会话 basket helper（换 media/text 清空）
- [x] `corpusViewState` 筛选
- [x] controller + workspace UI；flag 关占位
- [x] 路线图 / CHANGELOG

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 触及域 `vitest`
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] Feature flag 默认 `false`

## Commit 阶段证据模板

```
feat(corpus): add B5a-1 corpus library workset shell

Verified:
- npm run typecheck
- npx vitest run src/pages/corpusBasketSession.test.ts src/pages/CorpusLibraryPage.test.tsx src/pages/FeatureAvailabilityPage.layoutGuard.test.ts src/ai/config/featureFlags.environmentMatrix.test.ts
- npm run check:architecture-guard
- npm run check:docs-governance
- npm run check:plans-frontmatter
- npm run check:dev-agent-workflow-verify
- npm run check:agent-evals:smoke
```

## Post-merge

- [ ] 自用后视放量再开 B5a-2（项目级索引）/ B5b 出站
- [ ] spec `status: completed`
