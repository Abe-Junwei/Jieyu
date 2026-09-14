---
title: annotation-retokenize tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-14
source_of_truth: annotation-retokenize-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation Retokenize (B4f)

## Implementation tasks

- [x] `proposeAnnotationTokenForms` + 人工痕迹判断 → `npx vitest run src/pages/annotation/annotationRetokenize.test.ts`
- [x] 确认：无痕迹写 `unit_tokens` readback；有痕迹 `submitAnalysisGraphCandidate` → 同上
- [x] controller + extras 按钮/文案 + dictKeys
- [x] 路线图 / 开放门槛 / 代码地图 / CHANGELOG；`AnnotationPage` 烟测

## Pre-merge gates（与拍板 2A 一致）

- [ ] `npm run typecheck`
- [ ] `npx vitest run src/pages/annotation/annotationRetokenize.test.ts src/pages/AnnotationPage.test.tsx`
- [ ] `npm run test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts`
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] 无新 feature flag

## Commit 阶段证据模板

```
feat(annotation): add conservative secondary auto-tokenization

Preview Unicode word splits on /annotation. Unannotated units write
unit_tokens; annotated units store a pending alternativeAnalysis.

Verified: typecheck; annotationRetokenize + AnnotationPage vitest.
```
