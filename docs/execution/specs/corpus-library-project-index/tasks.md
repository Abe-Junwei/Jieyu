---
title: corpus-library-project-index tasks
doc_type: execution-spec-tasks
status: active
owner: corpus
last_reviewed: 2026-09-04
source_of_truth: corpus-library-project-index-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Corpus Library Project Index (B5a-2)

## Implementation tasks

- [x] `corpusUnitIndexQuery.ts` 投影 + 排序 + `listCorpusUnitIndexByTextId` → 验证：`npx vitest run src/services/corpusUnitIndexQuery.test.ts`
- [x] `LinguisticService.units.listCorpusIndexByTextId` 接线
- [x] basket 作用域改为 `textId`；controller 不再按 media 滤列表；行展示 mediaId
- [x] 导出头在混合 media 时去掉单一 `mediaId`；per-unit 保留
- [x] i18n / CHANGELOG / 主路线图 / 语料路线图 / 代码地图

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 触及域 `vitest`（上表路径）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] Feature flag 仍默认 `false`
- [x] `/corpus` 占位 e2e 口径不变（flag 关；由现有 criticalPaths 覆盖，本切片不改该断言）

## Commit 阶段证据模板

```
feat(corpus): add B5a-2 project-level unit index

Verified:
- npm run typecheck
- npx vitest run src/services/corpusUnitIndexQuery.test.ts src/pages/corpusBasketSession.test.ts src/pages/CorpusLibraryPage.test.tsx src/pages/corpusWorksetExport.test.ts src/pages/FeatureAvailabilityPage.layoutGuard.test.ts
- npm run check:architecture-guard
- npm run check:docs-governance
- npm run check:plans-frontmatter
- npm run check:dev-agent-workflow-verify
```

## Post-merge

- [ ] 自用后视放量再开页面 flag
- [ ] spec `status: completed`
