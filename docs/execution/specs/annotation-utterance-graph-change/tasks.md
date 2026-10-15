---
title: annotation-utterance-graph-change tasks
doc_type: execution-spec-tasks
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: annotation-utterance-graph-change-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — annotation-utterance-graph-change

## Implementation tasks

- [x] 在 `saveAnnotationUnitAnalysisGraph.ts` 增加 `saveAnnotationUtteranceGraphChange` → 验证：`npx vitest run src/pages/annotation/saveAnnotationUnitAnalysisGraph.test.ts`
- [x] 关系 `apply`、多词表达 `confirm`、备选分析 `select` 与 `addPos` 改为调用它 → 验证：同上，外加 `npm run typecheck`
- [x] 投影失败不写入；旧基线第二次写入冲突并保留第一次结果 → 验证：同上

## Pre-merge gates

- [x] `npm run typecheck`
- [x] `npx vitest run src/pages/annotation/saveAnnotationUnitAnalysisGraph.test.ts`
- [ ] 不跑 E2E：未改 ReadyWorkspace、侧栏或时间轴
- [ ] 不跑 `check:agent-evals`：未改 `src/ai/**`
- [ ] `npm run check:docs-governance`
