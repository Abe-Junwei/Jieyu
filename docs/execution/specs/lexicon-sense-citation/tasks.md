---
title: lexicon-sense-citation tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-30
source_of_truth: lexicon-sense-citation-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon sense citation

## Implementation tasks

- [x] 清空手写例证后引用还在 → `npx vitest run src/utils/dmlexEntry.test.ts`
- [x] 词典义项展示现场读到的句子，失效可删除

## Pre-merge gates（与拍板 2A 一致）

- [x] 触及域 vitest
- [x] `npm run check:docs-governance`
