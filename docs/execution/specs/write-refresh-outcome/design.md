---
title: write-refresh-outcome design
doc_type: execution-spec-design
status: active
owner: import
last_reviewed: 2026-10-15
source_of_truth: write-refresh-outcome-spec
depends_on:
  - ./requirements.md
---

# Design — 写入与写后刷新分开报告

## 1. 成熟方案扫描 / Research

- 仓库既有最相似的模式：`SnapshotRestoreDialog` 在恢复成功后用 `refresh().catch`，刷新失败不把已提交的恢复报成失败，用户另按重新加载。语言目录变更后的 `refreshLanguageCatalogReadModel().catch` 同样只记日志。
- 同类产品 / 标杆实现：TanStack Query 把 mutation 成功和 `invalidateQueries` 分开。查询失效失败不会把 mutation 标成失败，也不会自动再执行 mutation。
- 业内 best practice / 事实标准 / 规范：命令与查询分开（CQRS 的结果边界）。至少一次投递必须配幂等；本仓库的「恢复为新项目」会重映射 id，再次调用不是幂等的。
- 公认不可行 / 反模式 / 已弃用方案：用一条全库正则禁止 `try/catch`。它既误报纯读取，也证明不了读回。把多步导入收成一个布尔值也会盖住「事务已提交、整理未完成」。
- 潜在的坑：标注导入的词条匹配发生在 `withTransaction` 之外。事务失败不能宣称什么都没写。整理写入（层约束、时长扩展）在事务之后，失败时主导入已经在库里。
- 决定：**适配** `SnapshotRestoreDialog` 的语义，收成 `settlePersistedRefresh`。只服务「一次已返回的写入 + 一次刷新」。整理失败用单独的 `written-follow-up-unconfirmed`，不塞进刷新结果。

本批核对过的调用，不把搜索命中数当成缺陷数：

- 已分开：快照恢复对话框、语言目录刷新、首个转写层补写失败；归档与标注导入的 `loadSnapshot`；标注共用 `run`、`runCommit`、重分词、句段附注、自动注释、语素控制器。刷新失败是 `refresh-pending`，重试只调用 reload。
- 整理失败的界面状态是 `follow-up-pending`。随后的刷新即使成功，也不写成 `done`。
- 仍留给下一批：媒体删除/导入和恢复路径里的写后 `loadSnapshot`。MWE、关系、词性批量、备选分析的 `reload()` 不 await，拒绝不会进写入 catch。
- 纯刷新或明确跳过：深链、工具栏、时间轴状态、文稿切换后的重载，以及协作水合。

## 2. 架构选择

- 落位类别：actions。结果类型在 helper；两个导入入口负责把结果写成 `SaveState`。
- 关键 trade-off：入口返回可穷尽的结果，不再用 `boolean` 或「是否调用了 `setSaveState(error)`」判断新文稿该不该删。
- 拒绝的方案：给 `SaveState` 单独做一套重试框架；把整理失败说成刷新失败。

## 3. 落位清单（与 requirements §4 对应）

| 文件                                 | 职责（一句话）                           | 复杂度估计（行 / hooks） |
| ------------------------------------ | ---------------------------------------- | ------------------------ |
| `persistedRefresh.ts`                | 刷新失败时返回待刷新，重试只调用 refresh | 约 70 行，无 hook        |
| `useImportExport.archiveHandlers.ts` | 写入成功后才刷新                         | 原文件内增加一个局部函数 |
| `useImportExport.importHandlers.ts`  | 事务、整理、刷新三段结果                 | 整理放进事务后的内层 try |
| `LeftRailProjectHub.tsx`             | 未确认才留在导入对话框                   | 判断一行                 |

约束自查：

- [x] 不新增 hook
- [x] 编排层只根据结果关对话框
- [x] 不引入 `src/features/…`
- [x] 无新面板边框

## 4. ADR 引用

- 相关 ADR：无。这是导入结果报告，不改变层模态或媒体生命周期。
- 是否需要新建 ADR？否

## 5. Feature flag（如启用）

不启用。这是错误报告修正。默认关掉会留下重复导入。

## 6. 失败模式 / 兼容性

- 旧用户路径：项目枢纽的测试仍可返回 `boolean`。`projectArchiveImportStored` 把 `true` 当成已写入。
- 数据迁移（如有）：无。
- 回滚预案：恢复「刷新失败走导入失败」会重新带来重复导入，不回滚。

## 7. 验证矩阵

| 验证类型  | 命令                               | 期望结果 |
| --------- | ---------------------------------- | -------- |
| typecheck | `npm run typecheck`                | 0 errors |
| 单元测试  | `npx vitest run` 三个导入测试文件  | all pass |
| 结构守卫  | `npm run check:architecture-guard` | OK       |
| 文档      | `npm run check:docs-governance`    | OK       |
