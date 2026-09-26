---
title: annotation-translation-line tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-25
source_of_truth: annotation-translation-line-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation Translation Line

## Implementation tasks

- [x] 翻译层文本进入 IGT 行，音频模态跳过 → `npx vitest run src/pages/annotation/annotationTranslationText.test.ts src/pages/AnnotationPage.test.tsx`
- [x] 路线图 B4i / 代码地图 / CHANGELOG

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 vitest
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag；ChatWindow 零 diff

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] M2 typed relation 另切片
