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

- [ ] `promoteSense` / `demoteSense` → `npx vitest run src/utils/lexemeSenseTree.test.ts`
- [ ] 编辑表单提升/降级并保存 `parentId` → LexiconPage + controller vitest
- [ ] 路线图 B3i / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [ ] `npm run typecheck`
- [ ] 触及域 vitest（tree / LexiconPage / controller）
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] 无新 feature flag；ChatWindow 零 diff

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] DMLex 另切片
