---
title: desktop-4ws-slice0-text-save design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-10-31
source_of_truth: desktop-4ws-slice0-text-save-spec
depends_on:
  - ./requirements.md
---

# Design — 四页切片 0

## 1. 成熟方案扫描 / Research

- 仓库既有最相似的模式：`src/main.tsx` 已装 `QueryClientProvider`，`useLexiconAttachmentController.ts` 用 `useQuery` + `useQueryClient`；`useDesktopProjectReadController.ts` 用 `shownSession` ref 防止旧会话结果落地。复用这两处，不引入新状态库。
- 同类产品 / 标杆实现：TanStack Query 官方做法是写入成功后按键前缀 `invalidateQueries`，让在用查询后台重拉，而不是手动维护缓存（tanstack.com/query/latest/docs/framework/react/guides/query-invalidation）。离开拦截用 React Router 的 `useBlocker`。
- 业内 best practice / 事实标准 / 规范：`useBlocker` 只在数据路由下可用，声明式 `<BrowserRouter>` 不行（reactrouter.com/api/hooks/useBlocker）。官方渐进迁移是 `createBrowserRouter([{ path: '*', element: <Root /> }])`，原有后代 `<Routes>` 不改（reactrouter.com/6.30.0/upgrading/v6-data）。Electron 中 `beforeunload` 返回值会取消关窗，主进程用 `will-prevent-unload` 弹确认后决定是否 `preventDefault()`（electronjs.org/docs/latest/api/web-contents）。
- 公认不可行 / 反模式 / 已弃用方案：写后在页面里手动重拉、同时又让查询重拉（重复读，结果互相覆盖）；把草稿放进查询缓存（重拉会冲掉用户输入）；输入法组合中按 blur 强提交（半成品入库）。
- 潜在的坑：全局 `staleTime` 5 分钟是为语言资产设的，桌面键要显式设短值；切会话后旧请求返回需按键里的 `sessionId` 丢弃；换数据路由会改变所有页面的路由宿主，须全量 E2E。
- 决定：**复用**（TanStack Query、React Router 数据路由、Electron 原生事件）+ **自研**最小事件表（约几十行）。不新增依赖。事件不用 `mitt` 等库：只需同进程同步分发，库带不来额外价值。

## 2. 架构选择

- 落位类别：state（草稿，留在视图/新 hook）、derived（查询键）、effect（离开拦截、关窗）、actions（保存）。
- 方案 A（事件 → 单表 → `invalidateQueries`）vs B（保存后直接 `invalidateQueries`）：选 A。账本 #10 要求四页共用一张映射表，后续标注/词典写入只加表项，不在各页散写失效。
- 拒绝的方案：把整页读模型放进 `setQueryData` 乐观更新（单库事务里还会清分析图，乐观值不对）；新增全局 store。

## 3. 落位清单

| 文件 | 职责 | 复杂度估计 |
| --- | --- | --- |
| `src/desktop/desktopDomainEvents.ts` | `emit/subscribe`，事件只在写成功后发 | < 60 行 |
| `src/desktop/desktopQueryKeys.ts` | `['desktop', sessionId, …]` 键工厂；事件→失效前缀单表 | < 80 行 |
| `src/desktop/useDesktopDraftGuard.ts` | 有未提交草稿时 `useBlocker` + `beforeunload` | < 80 行 / < 5 hooks |
| `src/pages/useDesktopProjectReadController.ts` | 读改 `useQuery`；`saveText` 发事件不 `reload()` | 行数不增 |
| `electron/main.ts` | `will-prevent-unload` 原生确认 | +20 行 |

约束自查：
- [ ] 单 hook < 300 行、< 12 hooks
- [ ] 编排层只组装 / 透传
- [ ] 不引入 `src/features/…`
- [ ] 无新面板，不涉双层边框

## 4. ADR 引用

- 相关：ADR-0048（存储接口）、ADR-0085/0086（单库与白名单）、ADR-0088/0089（改正文后分析失效）。
- 是否新建 ADR：否。事件表与查询键是可逆实现细节；若后续四页统一事件模型要锁成对外合同，再另写。

## 5. Feature flag

- 不加。本片不换界面，只换刷新机制与离开保护；行为差异由测试覆盖。切片 1 起换界面再按清单原则 7 加 flag。

## 6. 失败模式 / 兼容性

- 过渡期：正文保存走失效；切分/合并/改界/映射/备注仍 `reload()`。两者都写同一份读模型查询；`reload()` 改为调用 `refetch()`，避免两条路径各持一份状态。
- 旧会话：会话过期仍由 `DesktopSessionGate` 回文件夹页；切会话时 `removeQueries(['desktop', oldSessionId])`。
- 数据迁移：无。
- 回滚：单提交可整体 revert；路由改动若引起回归，可单独回退 `main.tsx` 并暂用 `beforeunload` 只拦关窗。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/desktop src/pages/DesktopProjectReadPage.test.tsx src/db/desktop/unitTextUndo.test.ts` | all pass |
| 结构守卫 | `npm run check:architecture-guard` | OK |
| E2E（换路由） | `npm run test:e2e:chromium` | green |
| 桌面 E2E | `npx playwright test --config=playwright.desktop-project.config.ts` | green |
