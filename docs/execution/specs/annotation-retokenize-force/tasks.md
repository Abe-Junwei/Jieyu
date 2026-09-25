---
title: annotation-retokenize-force tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-25
source_of_truth: annotation-retokenize-force-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation Retokenize Force (B4g)

## Implementation tasks

- [x] 强制覆盖写快照并替换词列，恢复后 gloss / 词素 / 链接回来 → `npx vitest run src/pages/annotation/annotationRetokenize.test.ts`
- [x] 脏草稿不覆盖
- [x] 路线图 B4g / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 vitest
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag；ChatWindow 零 diff

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [x] 更完整 Validator 面板另切片（B4h）
