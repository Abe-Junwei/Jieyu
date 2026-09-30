---
title: annotation-precedent tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-30
source_of_truth: annotation-precedent-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation same-form gloss

## Implementation tasks

- [x] 建议排序和空白同形筛选 → `npx vitest run src/pages/annotation/annotationGlossSuggestion.test.ts`
- [x] 回车写入 `confirmed`，铺开不复制链接 → `npx vitest run src/pages/annotation/acceptAnnotationGlossSuggestion.test.ts`
- [x] 标注行显示占位和建议按钮

## Pre-merge gates（与拍板 2A 一致）

- [ ] 触及域 vitest
- [ ] `npm run check:docs-governance`
