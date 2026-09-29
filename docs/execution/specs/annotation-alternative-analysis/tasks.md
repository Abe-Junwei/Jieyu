---
title: annotation-alternative-analysis tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-29
source_of_truth: annotation-alternative-analysis-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation alternative analysis

## Implementation tasks

- [x] 列出、选定、重新投影保留 → `npx vitest run src/annotation/alternativeAnalysis.test.ts`
- [x] 两条以上未拒绝候选才可点选定 → `npx vitest run src/annotation/analysisGraphView.test.ts`
- [x] 聚焦行芯片和选定按钮接到工作区

## Pre-merge gates（与拍板 2A 一致）

- [x] `npx tsc --noEmit`
- [x] `npx vitest run src/annotation/alternativeAnalysis.test.ts src/annotation/analysisGraphView.test.ts src/annotation/analysisGraph.test.ts src/i18n/index.test.ts`
- [x] 不跑时间轴 e2e
- [x] `npm run check:docs-governance`
