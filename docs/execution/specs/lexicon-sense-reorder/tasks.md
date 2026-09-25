---
title: lexicon-sense-reorder tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-23
source_of_truth: lexicon-sense-reorder-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Sense Reorder

## Implementation tasks

- [x] `moveSenseSiblingBlock` → `npx vitest run src/utils/lexemeSenseTree.test.ts`
- [x] 编辑表单上移/下移并保存顺序 → LexiconPage + controller vitest
- [x] LIFT `order` 入站排序 → `npx vitest run src/utils/lexiconLiftImport.test.ts`
- [x] 路线图 B3h / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 vitest（tree / import / LexiconPage / controller）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag；ChatWindow 零 diff

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] promote/demote 与 DMLex 另切片
