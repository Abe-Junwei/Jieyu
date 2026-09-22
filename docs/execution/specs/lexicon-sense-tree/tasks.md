---
title: lexicon-sense-tree tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-22
source_of_truth: lexicon-sense-tree-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Sense Tree

## Implementation tasks

- [x] `lexemeSenseTree.ts`：parentId / depth / 子树 / LIFT roots → `npx vitest run src/utils/lexemeSenseTree.test.ts`
- [x] `saveLexiconEntry` + 编辑表单添加子义项；删父带子 → `npx vitest run src/pages/lexicon/saveLexiconEntry.test.ts src/pages/LexiconPage.test.tsx`
- [x] LIFT `<subsense>` 出站/入站 → `npx vitest run src/utils/lexiconLiftExport.test.ts src/utils/lexiconLiftImport.test.ts`
- [x] 路线图 B3g / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [ ] `npm run typecheck`
- [ ] 触及域 vitest
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] 无新 feature flag；ChatWindow 零 diff
- [ ] `npm run test:visual-css`（若改 lexicon CSS）
- [ ] `npm run test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts`（环境允许时）

## Commit 阶段证据模板

```
feat(lexicon): nest senses with parentId and LIFT subsense

Verified:
- npm run typecheck
- npx vitest run src/utils/lexemeSenseTree.test.ts src/pages/lexicon/saveLexiconEntry.test.ts
```

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] 拖拽排序 / DMLex 另切片
