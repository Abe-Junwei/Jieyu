---
title: lexicon-sense-category tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-24
source_of_truth: lexicon-sense-category-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Sense Part of Speech

## Implementation tasks

- [ ] 保存主义项与额外义项词类，空白则省略 → `npx vitest run src/pages/lexicon/saveLexiconEntry.test.ts`
- [ ] 编辑表单写入后详情可见 → `npx vitest run src/pages/LexiconPage.test.tsx`
- [ ] 路线图 B3j / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [ ] `npm run typecheck`
- [ ] 触及域 vitest（save / LexiconPage）
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] 无新 feature flag；ChatWindow 零 diff

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] DMLex 另切片
