---
title: lexicon-sense-reversals tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-reversals-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Sense Reversals

## Implementation tasks

- [x] 保存按书写系统分条的反转，并保留 main 链，空白省略，且保留导入残留 → `npx vitest run src/pages/lexicon/saveLexiconEntry.test.ts`
- [x] LIFT `<reversal>` 往返，词条级 reversal 不写入，省略时随 senses 替换掉 → `npx vitest run src/utils/lexiconLiftImport.test.ts src/utils/lexiconLiftExport.test.ts`
- [x] 编辑表单写入后义项列表可见 → `npx vitest run src/pages/LexiconPage.test.tsx`
- [x] 路线图 B3ak / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 vitest（save / LexiconPage / LIFT）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag；ChatWindow 零 diff

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] 义项参考文献另切片；词汇关系、图片、DMLex 仍不排
