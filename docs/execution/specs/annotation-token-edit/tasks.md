---
title: annotation-token-edit tasks
doc_type: execution-spec-tasks
status: active
owner: annotation
last_reviewed: 2026-09-04
source_of_truth: annotation-token-edit-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Annotation Token Edit (B4a-2)

## Implementation tasks

- [ ] `annotationTokenDrafts.ts` + 单测（脏字段、gloss lang=`default` 优先） → `npx vitest run src/pages/annotation/annotationTokenDrafts.test.ts`
- [ ] `saveAnnotationIgtRowTokens.ts` Dexie 写→requery→readback → `npx vitest run src/pages/annotation/saveAnnotationIgtRowTokens.test.ts`
- [ ] 键盘 `focusInput`；controller 草稿 + commitStay/commitNext → `AnnotationPage.test.tsx`
- [ ] IGT 受控 POS/gloss；输入态 Space 不 playToggle；i18n / CHANGELOG / 路线图 / 代码地图

## Pre-merge gates（与拍板 2A 一致）

- [ ] `npm run typecheck`
- [ ] 触及域 `vitest`（上列路径 + `annotationKeyboardMachine` + layout guard + flag 矩阵）
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] Feature flag 仍默认 `false`
- [ ] 不触及 `src/ai/**`（无需 agent-evals）

## Commit 阶段证据模板

```
feat(annotation): add B4a-2 POS/gloss save and readback

Verified:
- npm run typecheck
- npx vitest run src/pages/annotation/annotationTokenDrafts.test.ts src/pages/annotation/saveAnnotationIgtRowTokens.test.ts src/pages/annotation/annotationKeyboardMachine.test.ts src/pages/AnnotationPage.test.tsx
- npm run check:architecture-guard
```

## Post-merge

- [ ] 自用后再考虑开 flag；下一刀 B4b
- [ ] spec `status: completed` + `closed_at`
