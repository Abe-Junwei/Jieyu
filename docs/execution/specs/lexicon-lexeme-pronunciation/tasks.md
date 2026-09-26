---
title: lexicon-lexeme-pronunciation tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-pronunciation-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Entry Pronunciation

## Implementation tasks

- [x] 保存发音，空白省略，且保留 `morphemeType` → `npx vitest run src/pages/lexicon/saveLexiconEntry.test.ts`
- [x] LIFT `<pronunciation>` 往返 → `npx vitest run src/utils/lexiconLiftImport.test.ts src/utils/lexiconLiftExport.test.ts`
- [x] 编辑表单写入后概览可见 → `npx vitest run src/pages/LexiconPage.test.tsx`
- [x] 路线图 B3m / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 vitest（save / LexiconPage / LIFT）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag；ChatWindow 零 diff

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] DMLex 另切片
