---
title: annotation-gloss-structure tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-29
source_of_truth: annotation-gloss-structure-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation gloss structure

## Implementation tasks

- [x] `glossStructureForToken` 覆盖附缀、零形式、中缀、`[]`、`\` 和 `.` → `npx vitest run src/annotation/glossStructure.test.ts`
- [x] 整句投影在没有人工词素时调用它；两段 surface 仍是 `discontinuousPartOf`
- [x] 聚焦行展示这次投影，而不只展示上次保存的图
- [x] 单 token 投影测试仍通过

## Pre-merge gates（与拍板 2A 一致）

- [x] `npx tsc --noEmit`
- [x] `npx vitest run src/annotation/glossStructure.test.ts src/annotation/analysisGraphProjection.test.ts src/annotation/projectUtteranceAnalysisGraph.test.ts src/annotation/analysisGraphView.test.ts`
- [x] 不跑时间轴 e2e：这一刀不改时间轴
- [x] `npm run check:docs-governance`
