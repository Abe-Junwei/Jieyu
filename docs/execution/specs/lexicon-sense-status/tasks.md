---
title: lexicon-sense-status tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-status-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Sense Status

## Implementation tasks

- [x] 保存义项状态，空白省略，且保留人类学类别 → `npx vitest run src/pages/lexicon/saveLexiconEntry.test.ts`
- [x] LIFT 义项 `trait name="status"` 往返，词条级同名 trait 忽略，省略时随 senses 替换掉 → `npx vitest run src/utils/lexiconLiftImport.test.ts src/utils/lexiconLiftExport.test.ts`
- [x] 编辑表单写入后义项列表可见 → `npx vitest run src/pages/LexiconPage.test.tsx`
- [x] 路线图 B3ag / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 vitest（save / LexiconPage / LIFT）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag；ChatWindow 零 diff

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] DMLex 与语义域浏览另切片
