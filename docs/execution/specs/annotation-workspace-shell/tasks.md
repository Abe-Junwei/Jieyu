---
title: annotation-workspace-shell tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-04
source_of_truth: annotation-workspace-shell-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation Workspace Shell (B4a-1)

## Implementation tasks

- [ ] `annotationPageEnabled` 默认 false + env 覆盖矩阵
- [ ] 键盘 reduce + lane 投影 focused tests
- [ ] controller / workspace 只读 IGT；flag 装配保 layout guard
- [ ] i18n / CHANGELOG / 主路线图 / 代码地图

## Pre-merge gates

- [ ] `npm run typecheck`
- [ ] 触及域 `vitest`
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] Feature flag 默认 `false`

## Commit 阶段证据模板

```
feat(annotation): add B4a-1 readonly IGT shell

Verified:
- npm run typecheck
- npx vitest run src/pages/annotation/annotationKeyboardMachine.test.ts src/pages/annotation/annotationLaneUnitProjection.test.ts src/pages/AnnotationPage.test.tsx src/pages/FeatureAvailabilityPage.layoutGuard.test.ts src/ai/config/featureFlags.environmentMatrix.test.ts
- npm run check:architecture-guard
- npm run check:docs-governance
```

## Post-merge

- [ ] 自用后视放量再开 B4a-2 编辑保存
- [ ] spec `status: completed`
