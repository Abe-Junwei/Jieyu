---
title: desktop-4ws-slice0-text-save tasks
doc_type: execution-spec-tasks
status: active
owner: repo
last_reviewed: 2026-10-31
source_of_truth: desktop-4ws-slice0-text-save-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — 四页切片 0

> 前置已满足：四页计划与账本 §11 第 8 条均于 2026-10-31 拍板。

## Implementation tasks

- [x] T1 `main.tsx` 换 `createBrowserRouter([{ path: '*', element: <App /> }])` + `RouterProvider`，`App.tsx` 不动 → 验证：`npm run test:e2e:chromium` 全绿
- [ ] T2 `desktopDomainEvents.ts` + 测试：失败不发、订阅可退 → 验证：`npx vitest run src/desktop/desktopDomainEvents.test.ts`
- [ ] T3 `desktopQueryKeys.ts` + 单表：`unit.textSaved` → 读模型前缀 → 验证：`npx vitest run src/desktop/desktopQueryKeys.test.ts`
- [ ] T4 读页读路径改 `useQuery`（键含 `sessionId`、显式 `staleTime`）；`reload()` 改 `refetch()` → 验证：`npx vitest run src/pages/DesktopProjectReadPage.test.tsx`
- [ ] T5 `saveText` 成功后发事件，不再 `reload()`；慢返回 + 切会话用例 → 验证：同上
- [ ] T6 正文输入改受控草稿，组合输入期间不提交 → 验证：同上，加 IME 用例
- [ ] T7 `useDesktopDraftGuard`：切页/切文稿拦截、重试、放弃 → 验证：`npx vitest run src/desktop/useDesktopDraftGuard.test.tsx`
- [ ] T8 `electron/main.ts` 接 `will-prevent-unload` 确认框 → 验证：`project-flow.spec.ts` 增「有草稿关窗被确认」一例
- [ ] T9 i18n 键：离开确认、重试、放弃 → 验证：`npm run check:all` 中 i18n 检查
- [ ] T10 Electron 手测：改正文 → 杀进程 → 重开读回；失败保存（断开会话）→ 草稿在 → 验证：手测记录写进 PR

## Pre-merge gates

- [ ] `npm run typecheck`
- [ ] `npx vitest run src/desktop src/pages/DesktopProjectReadPage.test.tsx src/db/desktop/unitTextUndo.test.ts src/db/desktop/analysisRestore.test.ts`
- [ ] `npm run test:e2e:chromium`
- [ ] `npm run check:architecture-guard`
- [x] 不适用：不触及 `src/ai/**`
- [ ] `npm run check:docs-governance`
- [x] 不适用：本片不加 feature flag（见 design §5）

## Commit 阶段证据模板

```
feat(desktop): route unit text save through domain event and query

Verified:
- npm run typecheck → 0 errors
- npx vitest run <paths> → N passed
- npm run test:e2e:chromium → green
- spec: docs/execution/specs/desktop-4ws-slice0-text-save/
```

## Post-merge

- [ ] 切片 1 开工时把其余写入逐条迁到事件表
- [ ] 删除 `docs/execution/specs/desktop-4ws-slice0-text-save/`
