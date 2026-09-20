---
title: lexicon-lift-export tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-20
source_of_truth: lexicon-lift-export-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon LIFT Export

## Implementation tasks

- [x] `lexiconLiftExport.ts`：LIFT 0.13 序列化 + 空列表拒绝 + XML 转义 → `npx vitest run src/utils/lexiconLiftExport.test.ts`
- [x] `/lexicon` 导出按钮 + i18n；空库 disabled → `npx vitest run src/pages/LexiconPage.test.tsx`
- [x] e2e `/lexicon` 可见导出按钮 → `tests/e2e/criticalPaths.spec.ts`
- [x] 路线图 B3e / 代码地图 / CHANGELOG；R5 词典入口

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域 `vitest`（lexiconLiftExport、LexiconPage：2 files / 25 passed）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] 无新 feature flag；ChatWindow 零 diff
- [ ] 交互页按钮：`npm run test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts`（环境允许时）

## Commit 阶段证据模板

```
feat(lexicon): export LIFT 0.13 from the lexicon page

Verified:
- npm run typecheck
- npx vitest run src/utils/lexiconLiftExport.test.ts src/pages/LexiconPage.test.tsx
```

## Post-merge

- [ ] spec frontmatter `status: completed` after merge
- [ ] LIFT 导入 / 附件包 / 义项树另切片
