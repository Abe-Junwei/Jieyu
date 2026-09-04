---
title: annotation-morpheme-edit tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-04
source_of_truth: annotation-morpheme-edit-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation Morpheme Edit (B4b)

## Implementation tasks

- [x] `replaceMorphemesForToken` + `saveAnnotationMorphemes` Dexie readback → `npx vitest run src/pages/annotation/saveAnnotationMorphemes.test.ts`
- [x] token 切分/合并 + readback → `npx vitest run src/pages/annotation/splitMergeAnnotationTokens.test.ts`
- [x] lexeme link 写/删 + readback；Leipzig invalid 纯函数 → 对应 vitest
- [x] `useAnnotationMorphologyController` + IGT 词素/切分/链接 UI + i18n / CHANGELOG / 路线图
- [x] `AnnotationPage.test.tsx` 覆盖分词素保存与切分

## Pre-merge gates（与拍板 2A 一致）

- [ ] `npm run typecheck`
- [ ] 触及域 `vitest`（上列路径 + AnnotationPage）
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] Feature flag 仍默认 `false`
- [ ] 不改 ChatWindow；LeipzigValidator 复用既有 `src/ai/LeipzigValidator.ts`（无新 AI 文案）

## Commit 阶段证据模板

```
feat(annotation): add B4b morpheme split link and Leipzig check

Verified:
- npm run typecheck
- npx vitest run src/pages/annotation src/pages/AnnotationPage.test.tsx
- npm run check:architecture-guard
```

## Post-merge

- [ ] 自用后再考虑开 flag
- [ ] spec `status: completed` + `closed_at`
