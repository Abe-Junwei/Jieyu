---
title: annotation-sentence-export tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-30
source_of_truth: annotation-sentence-export-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation sentence export

## Implementation tasks

- [x] 按 id 读回句子、时间和语素词类 → `npx vitest run src/pages/annotation/annotationSentenceExport.test.ts`
- [x] 标注页导出带上当前语素

## Pre-merge gates（与拍板 2A 一致）

- [x] 触及域 vitest
- [x] `npm run check:docs-governance`
