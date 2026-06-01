---
title: derived-table-reconciliation tasks
doc_type: execution-spec-tasks
status: active
owner: repo
last_reviewed: 2026-06-01
source_of_truth: derived-table-reconciliation-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — derived-table-reconciliation

- [x] `segmentMetaSyncBestEffort.ts` + 13 处 call site 替换
- [x] `segmentMetaReconcile.ts` + vitest
- [x] `segmentReadQueries` 读路径对账
- [x] `check-segment-meta-sync-governance.mjs`
