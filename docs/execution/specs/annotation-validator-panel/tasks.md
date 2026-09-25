---
title: annotation-validator-panel tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-25
source_of_truth: annotation-validator-panel-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation Validator Panel (B4h)

## Implementation tasks

- [x] 只读预览 `dog-PL` 与 `touch<PRS`，relation 仍为 0 → `npx vitest run src/pages/annotation/annotationValidatorPanel.test.ts`
- [x] 聚焦行渲染结构校验；无 gloss 显示空态
- [x] 路线图 B4h / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 vitest
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag；ChatWindow 零 diff

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
