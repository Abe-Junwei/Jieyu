---
title: lexicon-senses-forms tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-19
source_of_truth: lexicon-senses-forms-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Senses & Forms (B3c)

## Implementation tasks

- [x] `applyLexiconEntryFields` 写入 extra senses / forms，空行丢弃 → `npx vitest run src/pages/lexicon/saveLexiconEntry.test.ts`
- [x] controller 增删行 + 表单/i18n
- [x] `LexiconPage` 保存 extra sense + form 后详情可见
- [x] 路线图 / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [ ] `npm run typecheck`
- [ ] `npx vitest run src/pages/lexicon/saveLexiconEntry.test.ts src/pages/LexiconPage.test.tsx src/pages/useLexiconEntryEditController.test.tsx`
- [ ] `npm run test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts`
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] 无新 feature flag

## Commit 阶段证据模板

```
feat(lexicon): edit extra senses and wordforms

Verified: typecheck; saveLexiconEntry + LexiconPage vitest.
```
