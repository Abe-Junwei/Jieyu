---
title: workspace-cross-page-events tasks
doc_type: execution-spec-tasks
status: active
owner: corpus
last_reviewed: 2026-09-10
source_of_truth: workspace-cross-page-events-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Workspace Cross-Page Events (B2)

## Implementation tasks

- [x] `workspaceEvents.ts` 四类事件 + dispatch/subscribe + 幂等决策 golden
- [x] LinguisticService 单写路径 persist 后 emit（POS/gloss、saveUnit、saveUnitText、removeUnit、saveLexeme）
- [x] `useWorkspaceEventRefresh` 接到 annotation / corpus / lexicon
- [x] 草稿不覆盖 + 定向 page 测试
- [x] 回写路线图 / 代码地图 / CHANGELOG；纠正「总线已在 appShellEvents」的过时说法

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 触及域 `vitest`
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 不新增 feature flag；ChatWindow 零 diff

## Commit 阶段证据模板

```
feat(workspace): wire B2 cross-page unit refresh events

Verified:
- npm run typecheck
- npx vitest run src/utils/workspaceEvents.test.ts src/hooks/useWorkspaceEventRefresh.test.tsx src/pages/AnnotationPage.test.tsx src/pages/CorpusLibraryPage.test.tsx src/pages/LexiconPage.test.tsx
  (5 files, 31 tests)
- npm run check:architecture-guard
- npm run check:docs-governance + check:plans-frontmatter + check:dev-agent-workflow-verify
- npm run check:i18n-hardcoded:guard (pages delta +0)
- npx playwright test --project=chromium tests/e2e/criticalPaths.spec.ts (11 passed)
- ChatWindow / featureFlags: zero diff
```

## Post-merge

- [ ] `context-sync` 生产派发另切片
- [ ] lexeme 删除 API 补齐后再接 `lexeme-deleted` 生产者
