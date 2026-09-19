---
title: lexicon-entry-delete tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-19
source_of_truth: lexicon-entry-delete-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Entry Delete (B3d)

## Implementation tasks

- [x] `deleteLexeme` 事务删除 lexeme + links + 附件 GC，emit `lexeme-deleted` → Dexie vitest
- [x] `deleteLexiconEntry` list readback + controller 确认框 + 表单/i18n
- [x] `LexiconPage` 删除后列表无该 id；取消不写
- [x] 路线图 / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [ ] `npm run typecheck`
- [ ] `npx vitest run src/pages/lexicon/deleteLexiconEntry.test.ts src/pages/LexiconPage.test.tsx src/pages/useLexiconEntryEditController.test.tsx`
- [ ] `npm run test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts`
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] 无新 feature flag

## Commit 阶段证据模板

```
feat(lexicon): hard-delete lexicon entries

Verified: typecheck; deleteLexiconEntry + LexiconPage vitest.
```
