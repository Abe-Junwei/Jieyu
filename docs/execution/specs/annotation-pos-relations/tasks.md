---
title: annotation-pos-relations tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-29
source_of_truth: annotation-pos-relations-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation POS and morphology relations

## Implementation tasks

- [x] 同形词选择与写入读回 → `npx vitest run src/pages/annotation/saveAnnotationPosByForm.test.ts`
- [x] 重叠、异干、换段、删段、声调及重新投影保留 → `npx vitest run src/annotation/morphologyRelations.test.ts`
- [x] 词性建议列表和关系按钮接到聚焦行

## Pre-merge gates（与拍板 2A 一致）

- [x] `npx tsc --noEmit`
- [x] `npx vitest run src/annotation/morphologyRelations.test.ts src/pages/annotation/saveAnnotationPosByForm.test.ts src/pages/AnnotationPage.test.tsx`
- [x] 不跑时间轴 e2e
- [x] `npm run check:docs-governance`
