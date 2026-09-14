---
title: annotation-m1-open tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-11
source_of_truth: annotation-m1-open-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation M1 Open

## Implementation tasks

- [x] `playAnnotationUnitRange` + playback controller；Space 接线 → `npx vitest run src/pages/annotation/playAnnotationUnitRange.test.ts src/pages/AnnotationPage.test.tsx`
- [x] `saveAnnotationUnitMeta` note/selfCertainty write→readback → `npx vitest run src/pages/annotation/saveAnnotationUnitMeta.test.ts`
- [x] `autoGlossPreview` 抽出；`applyAnnotationAutoGloss` 确认写；既有 `AutoGlossService.test.ts` 仍绿
- [x] IGT 行 UI + i18n；`annotationPageEnabled` 默认 true；env false 仍占位
- [x] 手工脚本 `docs/execution/archive/manual-validation/` + 开放门槛 / 路线图 / 代码地图

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 `vitest`（`src/pages/annotation`、`AnnotationPage`、`AutoGlossService`、`featureFlags.environmentMatrix`）
- [x] `npm run test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts`
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] Feature flag 默认 `true`；env 可关
- [x] 不改 ChatWindow；不调用 `glossUnit` 做 preview

## Commit 阶段证据模板

```
feat(annotation): open M1 playback notes and autogloss

Verified:
- npm run typecheck
- npx vitest run src/pages/annotation src/pages/AnnotationPage.test.tsx src/ai/AutoGlossService.test.ts
- npm run check:architecture-guard
```

## Post-merge

- [ ] 语料 flag 仍保持 false
- [ ] spec `status: completed` + `closed_at` 待稳定一 cycle
