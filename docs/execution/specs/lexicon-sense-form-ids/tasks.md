---
title: lexicon-sense-form-ids tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-20
source_of_truth: lexicon-sense-form-ids-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Sense/Form Stable Ids

## Implementation tasks

- [x] `Sense`/`Form` 可选 `id`；Zod 要求 `id` min(1)；`validateLexemeDoc` 先补再 parse → `npx vitest run src/db/migrations/m54LexemeNestedIds.test.ts`
- [x] Dexie v54 `upgradeV54LexemeNestedIds`；`JIEYU_DEXIE_TARGET_SCHEMA_VERSION = 54` → `npx vitest run src/db/engine.lexemeAssets.test.ts src/db/migrations/jieyuDexieOpenReplay.test.ts`
- [x] `saveLexeme` / `matchOrCreateLexemeByForm` / `applyLexiconEntryFields` 保留或分配 id；草稿携带 id，删中间行按 id 对齐 → `npx vitest run src/pages/lexicon/saveLexiconEntry.test.ts src/pages/useLexiconEntryEditController.test.tsx`
- [x] 路线图 / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 `vitest`（m54、saveLexiconEntry、entry edit controller、LexiconPage）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag；ChatWindow 零 diff

## Commit 阶段证据模板

```
feat(lexicon): give senses and forms stable ids

Verified:
- npm run typecheck
- npx vitest run src/db/migrations/m54LexemeNestedIds.test.ts src/pages/lexicon/saveLexiconEntry.test.ts
```

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] 义项树 UI 另切片；LIFT 出站另切片
