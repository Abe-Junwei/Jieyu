---
title: lexicon-sense-grammar-note tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-26
source_of_truth: lexicon-sense-grammar-note-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Sense Grammar Note

## Implementation tasks

- [x] 保存义项语法注释，空白省略，且保留百科注释 → `npx vitest run src/pages/lexicon/saveLexiconEntry.test.ts`
- [x] LIFT 义项 `note type="grammar"` 往返，词条级同名 note 忽略，省略时随 senses 替换掉 → `npx vitest run src/utils/lexiconLiftImport.test.ts src/utils/lexiconLiftExport.test.ts`
- [x] 编辑表单写入后义项列表可见 → `npx vitest run src/pages/LexiconPage.test.tsx`
- [x] 路线图 B3w / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 vitest（save / LexiconPage / LIFT）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag；ChatWindow 零 diff

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] DMLex 另切片
