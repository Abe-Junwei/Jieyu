---
title: lexicon-lift-import tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-20
source_of_truth: lexicon-lift-import-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon LIFT Import

## Implementation tasks

- [x] `lexiconLiftImport.ts`：parse 0.13 + 往返 B3e + 非法 XML 零写入 → `npx vitest run src/utils/lexiconLiftImport.test.ts`
- [x] `/lexicon` 导入按钮 + file input + i18n → `npx vitest run src/pages/LexiconPage.test.tsx`
- [x] e2e `/lexicon` 可见导入按钮 → `tests/e2e/criticalPaths.spec.ts`
- [x] 路线图 B3f / 代码地图 / CHANGELOG；R5 词典入口

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 `vitest`（lexiconLiftImport、LexiconPage）— 2 files / 26 passed
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag；ChatWindow 零 diff
- [x] `npm run test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts` — 12 passed，含 `lexicon-lift-import` 可见
- [x] `npm run test:visual-css`（lexicon CSS + baseline）

## Commit 阶段证据模板

```
feat(lexicon): import LIFT 0.13 on the lexicon page

Verified:
- npm run typecheck
- npx vitest run src/utils/lexiconLiftImport.test.ts src/pages/LexiconPage.test.tsx
```

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] 义项树 / 附件包另切片
