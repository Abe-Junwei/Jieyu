---
title: annotation-token-detach tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-30
source_of_truth: annotation-token-detach-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation token detach

## Implementation tasks

- [x] 改挂后删除，孤立词需确认 → `npx vitest run src/pages/annotation/deleteAnnotationToken.test.ts`
- [x] 词菜单写出将失去的条数

## Pre-merge gates（与拍板 2A 一致）

- [ ] 触及域 vitest
- [ ] `npm run check:docs-governance`
