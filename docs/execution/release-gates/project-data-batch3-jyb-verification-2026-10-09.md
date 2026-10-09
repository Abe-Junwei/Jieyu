---
title: 项目数据第 3 批第三个切片（JYB 整库备份）验证记录
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-10-09
source_of_truth: tests/e2e/batch3Jyb.spec.ts
---

# 项目数据第 3 批第三个切片（JYB 整库备份）验证记录（2026-10-09）

对应方案：[项目、资料与持久化架构改进方案（修订五）](../plans/project-data-architecture-improvement-2026-10-08.md) 第 3 批最后一个切片（Q1、D1–D14 的 JYB 部分；7.5；T30、T34、T53）。JYT、JYM 见 [JYT 验证记录](./project-data-batch3-jyt-verification-2026-10-09.md)、[JYM 验证记录](./project-data-batch3-jym-verification-2026-10-09.md)。

## 范围

- 新 JYB 格式 `application/vnd.jieyu.jyb`，与 JYT / JYM 共用项目包路径：
  - `data/library.json`（加密时 `data/library.enc`）：`{ schemaVersion, exportedAt, dbName, projects: [{ id, collections }] }`，按项目分组。
  - 收哪些表由 `tableRegistry` 的数据类决定：JYB 数据类且不在导入丢弃类（凭据、项目 AI、审计）里的表。
  - 导出时必须写明带不带音频（菜单两项：含音频 / 不含音频）；含音频时字节放在 `bytes/` 下，规则同 JYM。
  - 清单 `excluded` 列出没打包的数据类及条数（`never-packaged`），以及不属于任何项目的行（`unowned-rows`）。
- T53：任何导出都不读凭据、AI、审计表。`exportDatabaseAsJson` 统一过滤，同时修好整库 JSON 导出和 `LinguisticService.exportToJSON` 里仍带凭据 / AI 表的问题（评审意见）。
- 入站检查（预览阶段，全部通过才写入）：清单与版本、路径安全、`files[]` 核对、解密、每个项目逐条校验、不得出现未打包的表、行不得属于别的项目、同一行不得出现在两个项目里、实体集合与数据行一致、字节文件 sha256 与大小。JYT / JYM 文件不会被当成 JYB。
- 逐项目导入（默认，T30）：预览列出备份里的每个项目，勾选的项目在一个事务里作为新项目写入，id 全部重新生成，记 `restoredFrom.packageKind = 'jyb'`。没勾选任何项目时提示并不写入。
- 整库还原（T34，只在条件满足时可选）：
  - 只有本机为空，或本机和备份里的项目都从未协作过，才可选；否则选项禁用并说明原因，服务层也拒绝。
  - 会丢本机任何媒体、附件或原件字节时禁用并中止（预览里提前说明，写事务里再查一次）。
  - 界面二次确认：第一次点击只显示警告，第二次才写入。
  - 写入前把整库存一份快照到 `jieyu_overwrite_snapshots`（键 `*library*`，不含字节）；快照失败就中止。
  - 清空备份里出现的表再写入（replace-all），沿用原 id。
- 文案：“全量备份”统一改为“整库备份 JYB（.jyb）”，项目中心导入入口接受 `.jyt / .jym / .jyb`。
- 不包含：第 4b 批（流式、暂存区）、ProvenanceEnvelope 参数。

## 保守决定（方案未写明或与方案有出入）

| 问题                                | 当前做法                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| 项目 AI 表（7.5 表列为 JYB）        | 不打包。JY-04 规定所有导入都丢弃项目 AI，且本批要求导出不含 AI 表；在 `excluded` 里计数。待确认 |
| 用户偏好（`settings`）              | 不打包；方案 8.1 仍是“待冻结”                                                                   |
| 默认带不带音频                      | 不设默认，菜单分两项让用户选                                                                    |
| 整库还原的协作判定                  | 本机和备份里的项目都必须从未协作过                                                              |
| 整库还原会丢本机字节                | 整体中止，不提供“仍然继续”                                                                      |
| 整库还原时本机的 AI / 派生 / 审计行 | 不动（可能与还原后的数据对不上）；协作绑定不还原                                                |
| 不属于任何项目的行                  | 不打包，计数                                                                                    |
| 逐项目导入时语言代码冲突            | 同 JYT：跳过冲突的语言并列出                                                                    |
| 导出入口                            | 项目中心内部的 `useLibraryBackupExport`，用提示条反馈，不经页面层传递                           |
| 整库快照的恢复入口                  | 只保存，不提供界面恢复入口                                                                      |

## 容量

- 字节部分沿用 JYM 的 512 MiB 内存上限，读字节前先按记录大小预检。
- 数据 JSON 导出时就按导入上限检查（32 MiB、50 万节点），超过直接报“太大”，建议不含音频导出或逐项目导出 JYM。
- 流式处理和暂存区留到第 4b 批。

## 自动化验证

| 项                                                             | 命令                                                                                                                                                                   | 结果                                                                                                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 类型检查                                                       | `npx tsc --noEmit`                                                                                                                                                     | 通过                                                                                                                                            |
| 改动文件 lint                                                  | `npx eslint --max-warnings 0 <changed files>`                                                                                                                          | 通过                                                                                                                                            |
| 相关单元测试                                                   | `npx vitest run src/services/JybService src/services/JymService src/services/JytService src/hooks/importExport src/db src/components/transcription/LeftRailProjectHub` | 通过                                                                                                                                            |
| 架构守卫 / 事务门面 / 冻结 / 文档治理 / i18n / knip（CI 口径） | `npm run check:architecture-guard` 等                                                                                                                                  | 通过                                                                                                                                            |
| JYB e2e                                                        | `npx playwright test --project=chromium tests/e2e/batch3Jyb.spec.ts`                                                                                                   | 4/4 通过                                                                                                                                        |
| 全量单元测试                                                   | `npm run test:vitest:dot`                                                                                                                                              | 874 文件通过、2 跳过；6225 用例通过、57 跳过（该脚本排除 `TranscriptionTimelineVerticalView.suite-*`，与 JYT 记录的 `npx vitest run` 口径不同） |
| Chromium 全量 e2e                                              | `npx playwright test --project=chromium --retries=0`                                                                                                                   | 69 通过、2 跳过（同一轮，含 JYT / JYM / JYB 三个 batch3 spec）                                                                                  |

测试编号对应：T53 `JybService.test.ts`（含整库 JSON 导出）+ e2e；T30 `JybService.test.ts`、`LeftRailProjectHub.test.tsx` + e2e；T34 `JybService.test.ts`（空库、替换、字节会丢中止、本机协作过、备份里的项目协作过）、`LeftRailProjectHub.test.tsx` + e2e。

## 已知限制

- 整库还原后本机 AI、派生数据可能过期，需要重新生成。
- 整库快照没有界面恢复入口。
