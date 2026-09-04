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

- [ ] `corpusWorksetExport.ts` golden plain / markdown
- [ ] clipboard helper 特性检测
- [ ] controller 只消费 basket；UI 两按钮
- [ ] i18n 与 CHANGELOG / 路线图

## Pre-merge gates

- [ ] `npm run typecheck`
- [ ] 触及域 `vitest`
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] Feature flag 仍默认 `false`
- [ ] `/corpus` 占位 e2e 口径不变（flag 关）

## Commit 阶段证据模板

```
feat(corpus): add B5b workset clipboard export

Verified:
- npm run typecheck
- npx vitest run <touched>
```

## Post-merge

- [ ] 自用后视放量再开 B5a-2 项目级索引
- [ ] spec `status: completed`
