---
title: lexicon-sense-semantics-note tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-semantics-note-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Sense Semantics Note

## Implementation tasks

- [ ] 保存义项语义注释，空白省略，且保留音系注释 → `npx vitest run src/pages/lexicon/saveLexiconEntry.test.ts`
- [ ] LIFT 义项 `note type="semantics"` 往返，词条级同名 note 忽略，省略时随 senses 替换掉 → `npx vitest run src/utils/lexiconLiftImport.test.ts src/utils/lexiconLiftExport.test.ts`
- [ ] 编辑表单写入后义项列表可见 → `npx vitest run src/pages/LexiconPage.test.tsx`
- [ ] 路线图 B3z / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [ ] `npm run typecheck`
- [ ] 触及域 vitest（save / LexiconPage / LIFT）
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] 无新 feature flag；ChatWindow 零 diff

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] DMLex 与语义域浏览另切片
