---
title: desktop-4ws-slice0-text-save requirements
doc_type: execution-spec-requirements
status: active
owner: repo
last_reviewed: 2026-10-31
source_of_truth: desktop-4ws-slice0-text-save-spec
depends_on:
  - ../../plans/jieyu-4ws-impl-checklist-2026-10-31.md
  - ../../plans/jieyu-4ws-ledger-2026-10-31.md
---

# Requirements — 四页切片 0：正文保存一条链路 + 最小事件与查询

> 2026-10-31 四页计划已拍板通过（含换数据路由、不套 flag），本规格可执行。

## 1. What & Why

- **要做什么**：桌面转写读页上「选中语段 → 改正文 → 保存」这一条，改成：单库写入 → 成功才发领域事件 → 统一表映射为查询失效 → 重读；切页/切文稿/关窗时按 #12 处理草稿。
- **为什么现在做**：账本 Grill #10–#12；四页后续切片都沿用这条链路。现状是每个写入后各自手动 `reload()`（`useDesktopProjectReadController.ts`），无失败保护。
- **不做**：波形/时间轴；其他 6 个写入（切分、合并、改界、映射、备注）的迁移；新界面或视觉改动；改库。

## 2. 用户场景

1. 用户改一句正文点保存：列表与详情显示新值；杀进程重开仍是新值。
2. 保存失败：草稿还在，有错误提示和重试；此时切页/切文稿/关窗会被拦下，可重试或明确放弃。
3. 输入法组合未完成就切走：不强行提交半成品。

## 3. 验收标准

- [x] 保存成功只经统一失效表触发重读，正文路径不再调 `reload()`（vitest 断言调用路径与读回值）
- [x] 保存失败不发事件、草稿保留、离开被拦（vitest + Chromium E2E）
- [x] 切项目/会话后，旧请求结果不写入新会话缓存（查询键含 `sessionId`；vitest 制造慢返回）
- [x] 关窗：有未提交草稿时弹确认（Electron 手测 + `tests/e2e-desktop/project-flow.spec.ts` 增一例）
- [x] 重开读回：已提交正文在，未提交的不在库中
- [x] IME `compositionstart` 后到 `compositionend` 前不提交
- [x] 改正文后分析图按 `updateUnitText` 事务清空（P0a 回归，复用 `unitTextUndo` / `analysisRestore` 测试）

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| 路由入口 | `src/main.tsx` | 修改：`BrowserRouter` → `createBrowserRouter` + `RouterProvider`（单个 `*` 路由包 `<App />`） |
| 事件 | `src/desktop/desktopDomainEvents.ts` | 新增：会话内最小发布/订阅 |
| 查询键与失效表 | `src/desktop/desktopQueryKeys.ts` | 新增：键工厂 + 事件→失效单表 |
| 草稿与离开拦截 | `src/desktop/useDesktopDraftGuard.ts` | 新增 hook：`useBlocker` + 关窗 |
| 读页 controller | `src/pages/useDesktopProjectReadController.ts` | 修改：`saveText` 走新链路；读路径改 `useQuery`；不加行数 |
| 读页视图 | `src/pages/DesktopProjectReadView.tsx` | 修改：正文输入改受控草稿 + 组合输入判断 |
| Electron 主进程 | `electron/main.ts` | 修改：`will-prevent-unload` 确认框 |
| i18n | `src/i18n/dictKeys.ts`、字典 | 新键：离开确认、重试、放弃 |
| 测试 | `src/desktop/*.test.ts`、`src/pages/DesktopProjectReadPage.test.tsx`、`tests/e2e-desktop/project-flow.spec.ts` | 新增 / 修改 |

## 5. 已知风险与依赖

- 换数据路由影响全部页面路由；须跑全量 `test:e2e:chromium`，不只是桌面页。
- 读页 controller 已 414 行；新逻辑必须落新模块，避免过 architecture guard。
- 过渡期两种刷新并存：正文走失效，其余写入仍 `reload()`；两者都会重读同一读模型，需确认不互相覆盖（设计 §6）。
