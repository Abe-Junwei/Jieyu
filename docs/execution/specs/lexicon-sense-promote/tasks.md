---
title: lexicon-sense-promote tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-24
source_of_truth: lexicon-sense-promote-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Sense Promote / Demote

## Implementation tasks

- [x] `promoteSense` / `demoteSense` → `npx vitest run src/utils/lexemeSenseTree.test.ts`
- [x] 编辑表单提升/降级并保存 `parentId` → LexiconPage + controller vitest
- [x] 路线图 B3i / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 vitest（tree / LexiconPage / controller）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag；ChatWindow 零 diff

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] DMLex 另切片
