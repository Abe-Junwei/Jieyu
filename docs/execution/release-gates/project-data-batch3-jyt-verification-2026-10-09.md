---
title: 项目数据第 3 批第一个切片（JYT）验证记录
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-10-09
source_of_truth: tests/e2e/batch3Jyt.spec.ts
---

# 项目数据第 3 批第一个切片（JYT）验证记录（2026-10-09）

对应方案：[项目、资料与持久化架构改进方案（修订五）](../plans/project-data-architecture-improvement-2026-10-08.md) 第 3 批，按 JYT → JYM → JYB 分切片，本记录只覆盖 JYT（D1、D5、D7 的 JYT 部分；7.1–7.4；T22、T28、T29、T31、T32、T33、T35 的 JYT 部分），并合入 RD-1、JY-13。

## 范围

- 快照结构版本升到 5（`SNAPSHOT_SCHEMA_VERSION`）。`jieyudb_v2` 或版本低于 5 的文件报“旧版本导出”，不导入、不转换（D9）；版本更新或非数字报“版本不受支持”。
- RD-1：预览阶段就逐条校验全部记录，列出每张表的不合格条数；不再等到导入时才报 zod 原文。
- JY-13：导出在一个只读事务里读完。
- 新 JYT 格式 `application/vnd.jieyu.jyt`，`formatVersion 1`：
  - `mimetype`（第一条、不压缩）、`META-INF/manifest.json`、`data/project.json`（加密时 `data/project.enc`）。
  - 只含一个项目：项目内容、标注文档、项目拥有的全部目录行；系统模板只以 `systemRefs` 出现。
  - 不含任何字节文件；媒体、附件、来源原件实体一律 `bytes: omitted`，带 `contentSha256` / `contentSize`（已知时）。
  - 不含 AI 记忆与历史、审计日志、派生数据、凭据、协作状态、clientId。
- 入站检查（7.4-1，全部通过才写入）：清单结构、版本、路径安全（OCFL 规则）、重复条目、`files[]` 的 sha256 与大小、孤儿文件、实体与 `fileRef` 一致性、只能有一个项目、数据行不得属于其他项目、实体集合与数据行一致、每一条记录。
- 恢复为新项目（D5 默认，7.4-2）：所有 id 重新映射（含 documentId、组合引用 `a::b`、按 id 作键的设置）；项目记 `restoredFrom`；媒体为 `none + missing`，保留指纹供重新关联。
- 覆盖当前项目（D5、7.4-3，T33）：
  - 只对从未协作过的当前项目提供（2C 的 D6 判定函数）；协作过或判定不了时不出现选项，服务层也拒绝。
  - 界面二次确认：第一次点击只显示警告，第二次才写入。
  - 写入前把项目存一份覆盖前快照到新库 `jieyu_overwrite_snapshots`（登记为 recovery 数据类，每个项目保留最近 3 份），写完读回核对；失败就中止。
  - 包来自本项目时沿用原 id；来自其他项目时全部重新映射到当前项目 id。
  - 4.2-7：会丢本机媒体、附件或原件字节时整体中止（预览里提前说明，写事务里再查一次）；清空与写入在同一个事务里。
- 旧格式（`application/x-jieyu-text` 整库 JYT）一律拒绝（T32）。
- 不包含：JYM、JYB、从其他项目导入目录、第 4b 批。

## 保守决定（方案未写明）

| 问题                                               | 当前做法                                                   |
| -------------------------------------------------- | ---------------------------------------------------------- |
| 恢复后的项目名                                     | 保留原名，只记 `restoredFrom`，不加后缀                    |
| 语言行是自然键（语言代码），与本机其他项目的行冲突 | 跳过该语言及其显示名、别名、历史，并在预览与结果里列出     |
| 恢复后是否切换到新项目                             | 不切换，停留在当前项目（保持 JY-02），提示新项目名         |
| 附件实体的 sha256                                  | 本机没有记录，只写 `contentSize`                           |
| JYT 加密                                           | 继续支持（沿用 JYM 的口令加密）                            |
| 覆盖前快照的恢复入口                               | 本切片只保存，不提供界面恢复入口                           |
| 覆盖前快照是否含字节                               | 不含；覆盖不会删除任何本机字节（否则中止），字节一直在主库 |

## 自动化验证

| 项                                                         | 命令                                                                                                                                          | 结果                                                                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 类型检查                                                   | `npx tsc --noEmit`                                                                                                                            | 通过                                                                                                               |
| 改动文件 lint                                              | `npx eslint --max-warnings 0 <changed files>`                                                                                                 | 通过                                                                                                               |
| JYT 单元测试                                               | `npx vitest run src/services/JytService src/services/projectPackageIdRemap src/db/snapshotImportPrecheck src/utils/archiveImportErrorMessage` | 通过                                                                                                               |
| 架构守卫 / 事务门面 / knip（CI 口径）/ 冻结检查 / 文档治理 | `npm run check:architecture-guard` 等                                                                                                         | 通过                                                                                                               |
| 全量单元测试                                               | `npx vitest run`                                                                                                                              | 877 文件通过、2 跳过；6241 用例通过、57 跳过                                                                       |
| JYT e2e                                                    | `npx playwright test --project=chromium tests/e2e/batch3Jyt.spec.ts`                                                                          | 4/4 通过                                                                                                           |
| Chromium 全量 e2e                                          | `npx playwright test --project=chromium --retries=0`                                                                                          | 62 通过、2 跳过（同一轮；前一轮 `criticalPaths` 搜索面板 Esc 用例偶发失败一次，单独重复 3 次均通过，与本切片无关） |

测试编号对应：T22/T28/T29/T35 `JytService.test.ts` + e2e；T31 `JytService.test.ts`；T32 `JytService.test.ts`、`snapshotImportPrecheck.test.ts` + e2e；T33 `JytService.overwrite.test.ts`、`LeftRailProjectHub.test.tsx` + e2e；RD-1 `snapshotImportPrecheck.test.ts`、`archiveImportErrorMessage.test.ts`。

## 已知限制

- JYM 仍走旧的整库路径，下一个切片替换。
- 包整体读入内存；容量上限沿用现有归档策略，实测留到 JYM 切片（带媒体）。
