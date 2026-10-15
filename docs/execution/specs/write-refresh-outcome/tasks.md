---
title: write-refresh-outcome tasks
doc_type: execution-spec-tasks
status: active
owner: import
last_reviewed: 2026-10-15
source_of_truth: write-refresh-outcome-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — 写入与写后刷新分开报告

## Implementation tasks

- [x] `persistedRefresh.ts` 结果类型与 `settlePersistedRefresh` → 验证：`npx vitest run src/hooks/importExport/persistedRefresh.test.ts`
- [x] 归档导入：写入后再刷新；失败返回 `written-refresh-pending` → 验证：`useImportExport.archiveHandlers.test.ts`
- [x] 标注导入：刷新失败不报导入失败；新建文稿不删；整理失败单独结果 → 验证：`useImportExport.import.test.tsx`
- [x] 项目枢纽按结果关闭对话框；刷新待完成用警告提示，且不触发「导入失败，请重试」
- [x] 架构守卫禁止这两个入口再写 `await loadSnapshot(`
- [x] 标注共用 `run`、`runCommit`、重分词、句段附注、自动注释、语素控制器：刷新失败不是 error → 验证：`annotationWorkspaceController.actions.test.ts`
- [x] 整理失败用 `follow-up-pending`，刷新成功也不写成 `done`
- [x] 架构守卫要求上述入口调用 `settlePersistedRefresh` / `publishAnnotationWriteRefresh`，并禁止把 reload 写回写入的 `await`
- [ ] 再下一批：媒体删除/导入和恢复路径里的写后 `loadSnapshot`

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域的 `vitest`（`persistedRefresh.test.ts`、`useImportExport.archiveHandlers.test.ts`、`useImportExport.import.test.tsx`、`useImportExport.error.test.tsx`、`LeftRailProjectHub.test.tsx`）
- [x] 触及交互 / ReadyWorkspace / 侧栏 / 时间轴：本批只改导入结果提示，不改时间轴交互，E2E N/A
- [x] 触及编排 / 复杂度：`npm run check:architecture-guard`
- [x] 触及 docs：`npm run check:docs-governance`

## Commit 阶段证据模板

```
fix(import): report a saved import when only the refresh fails

Verified:
- npx vitest run <paths>
- npm run typecheck
- npm run check:architecture-guard
- npm run check:docs-governance
- spec: docs/execution/specs/write-refresh-outcome/
```

## Post-merge

- [x] 标注控制器一批沿用同一结果，不另起框架
- [ ] spec frontmatter `status: completed` 留到媒体与恢复路径也分开之后
