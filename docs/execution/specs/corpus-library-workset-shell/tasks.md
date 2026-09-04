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

- [ ] `npm run typecheck`
- [ ] 触及域 `vitest`
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] Feature flag 默认 `false`

## Commit 阶段证据模板

```
feat(corpus): add B5a-1 corpus library workset shell

Verified:
- npm run typecheck
- npx vitest run <touched>
```

## Post-merge

- [ ] 自用后视放量再开 B5a-2（项目级索引）/ B5b 出站
- [ ] spec `status: completed`
