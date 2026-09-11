---
title: lexicon-entry-edit tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-11
source_of_truth: lexicon-entry-edit-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Entry Edit (B3b)

## Implementation tasks

- [ ] `saveLexiconEntry` patch + write→list readback → `npx vitest run src/pages/lexicon/saveLexiconEntry.test.ts`
- [ ] `useLexiconEntryEditController` + `LexiconEntryEditForm`；`LexiconPage` 只装配
- [ ] i18n；CSS 不用第 3 层容器 border
- [ ] `LexiconPage.test.tsx`：编辑保存与新建

## Pre-merge gates（与拍板 2A 一致）

- [ ] `npm run typecheck`
- [ ] `npx vitest run src/pages/lexicon src/pages/LexiconPage.test.tsx src/services/linguisticServiceLexemeOps.ts`
- [ ] `npm run test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts`
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`

## Commit 阶段证据模板

```
feat(lexicon): edit and create entries through saveLexeme

Verified:
- npm run typecheck
- npx vitest run src/pages/lexicon src/pages/LexiconPage.test.tsx
```
