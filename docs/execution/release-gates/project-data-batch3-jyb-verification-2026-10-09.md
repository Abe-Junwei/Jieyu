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
  - `data/library.json`（加密时 `data/library.enc`）：`{ schemaVersion, exportedAt, dbName, projects: [{ id, collections }], settings? }`，按项目分组。
  - 收哪些表由 `tableRegistry` 的数据类决定（`JIEYU_DATA_CLASS_IN_JYB`）：项目内容、目录、项目 AI 记忆与历史；凭据、审计、派生、协作状态、恢复快照不收。
  - 项目 AI（用户决定 2026-10-09，7.5）按项目切分：对话按 `textId`，消息与会话记忆跟对话走；记忆、资料集按 `projectId`（资料集也可按媒体 / 层归属）；任务按 `targetId`，任务快照跟任务走。`agent_artifacts` 无项目归属，不打包，计入 `unowned-rows`。
  - 用户偏好（用户决定 2026-10-09）放在 `settings` 条目：只收白名单里的 localStorage 键（`userPreferencesBackup.ts`），字段名像密钥 / 令牌 / 密码的一律清掉；商业 STT、地图服务密钥、外部声学 API key、AI 设置的加密部分不在白名单里。带服务地址的三个键（向量服务 `jieyu.embeddingProvider`、本地 Whisper `jieyu.voiceAgent.localWhisper`、语音增强 `jieyu.voiceAgent.sttEnhancement`）也不收（复审 REV5-N1）。
  - 导出时写明带不带音频（菜单两项）；默认、排在第一位的是“含音频”（用户决定 2026-10-09），“仅数据，不含音频”保留。含音频时字节放在 `bytes/` 下，规则同 JYM。
  - 清单 `excluded` 列出没打包的数据类及条数（`never-packaged`），以及不属于任何项目的行（`unowned-rows`）。
- T53：任何导出都不读凭据、审计表。`exportDatabaseAsJson` 统一过滤；项目 AI 表只有 JYB 显式传 `includeProjectAi: true` 才读，整库 JSON 导出、`LinguisticService.exportToJSON`、JYT、JYM 仍不带。
- 入站检查（预览阶段，全部通过才写入）：清单与版本、路径安全、`files[]` 核对、解密、每个项目逐条校验、不得出现未打包的表、行不得属于别的项目、同一行不得出现在两个项目里、实体集合与数据行一致、字节文件 sha256 与大小。JYT / JYM 文件不会被当成 JYB。
- 逐项目导入（默认，T30）：预览列出备份里的每个项目（含项目 AI 行数），勾选的项目在一个事务里作为新项目写入，id 全部重新生成（AI 行里引用的旧 id 一起改），记 `restoredFrom.packageKind = 'jyb'`。没勾选任何项目时提示并不写入。
  - 项目 AI 默认随项目导入，可取消勾选“同时导入项目 AI 记忆与历史”。
- JY-04 调整：只有 JYB 的两条导入路径保留项目 AI（`keepProjectAi`）；JYT / JYM 和普通 JSON 导入照旧丢弃项目 AI；凭据、审计任何路径都丢弃。
- 整库还原（T34，只在条件满足时可选）：
  - 只有本机为空，或本机和备份里的项目都从未协作过，才可选；否则选项禁用并说明原因，服务层也拒绝。
  - 备份里的项目是否协作过，以清单 `projects[].collaborated` 为准（导出设备上按 D6 判定，不确定记为 true）；为 true 或缺失都按协作过处理，同时仍查本机记录（复审 REV5-N4，清单格式新增字段）。
  - 会丢本机任何媒体、附件或原件字节时禁用并中止（预览里提前说明，写事务里再查一次）。
  - 界面二次确认：第一次点击只显示警告，第二次才写入。
  - 写入前把整库存一份快照到 `jieyu_overwrite_snapshots`（键 `*library*`，不含字节，含项目 AI；勾选了写回偏好时也存这些偏好的旧值）；快照失败就中止。
  - 清空备份里出现的表再写入（replace-all），沿用原 id；项目 AI 表一起替换。
  - 用户偏好：预览列出包里的偏好键（以及被忽略的非白名单键），默认不写回；勾选“同时还原用户偏好”才在写库成功后写回，只有地址类字段（url / endpoint / host…）与本机完全相同时才保留本机已有的密钥字段，否则包里的地址拿不到本机密钥（REV5-N1）。逐项目导入从不写回偏好。
- 文案：“全量备份”统一改为“整库备份 JYB（.jyb）”，项目中心导入入口接受 `.jyt / .jym / .jyb`。
- 不包含：第 4b 批（流式、暂存区）。

## 保守决定（方案未写明或与方案有出入）

| 问题                          | 当前做法                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| 项目 AI 表（7.5 表列为 JYB）  | 已定（用户 2026-10-09）：按项目打包；只在 JYB 导入 / 还原路径保留，JYT / JYM 仍丢弃 |
| 用户偏好（`settings`）        | 已定（用户 2026-10-09）：白名单打包、去密钥；只在整库还原时、预览列出并勾选后写回   |
| 默认带不带音频                | 已定（用户 2026-10-09）：默认含音频，保留“不含音频”选项                             |
| `jieyu-project-memory` 独立库 | 不在主库里，本批不打包（待定）                                                      |
| `agent_artifacts`             | 没有项目归属，不打包，计入 `unowned-rows`                                           |
| 整库还原的协作判定            | 本机和备份里的项目都必须从未协作过                                                  |
| 整库还原会丢本机字节          | 整体中止，不提供“仍然继续”                                                          |
| 整库还原时本机的派生 / 审计行 | 不动（可能与还原后的数据对不上）；协作绑定不还原                                    |
| 不属于任何项目的行            | 不打包，计数                                                                        |
| 逐项目导入时语言代码冲突      | 同 JYT：跳过冲突的语言并列出                                                        |
| 导出入口                      | 项目中心内部的 `useLibraryBackupExport`，用提示条反馈，不经页面层传递               |
| 快照的恢复入口                | 已定（用户 2026-10-09）：项目中心“导入 → 从快照恢复…”，见下文“从快照恢复”           |

## 从快照恢复（用户决定 2026-10-09）

- 入口：项目中心“导入 → 从快照恢复…”。列出 `jieyu_overwrite_snapshots` 里的全部快照：项目覆盖前快照、整库还原前快照（键 `*library*`）、从快照恢复前快照，显示时间、项目（整库显示项目数）、触发操作、大小与条数。
- 预览：每张表快照里与本机现有的条数；整库快照列出会写回的偏好键；不能恢复时写明原因（协作过、会丢本机字节、数据版本不支持）。
- 恢复（`overwriteSnapshotRestoreService.restoreOverwriteSnapshot`）：
  - 二次确认：第一次点击只显示警告，第二次才写入。
  - 只在项目（整库时为本机与快照里的全部项目）从未协作过时可用。
  - 本机字节不丢：快照不含字节，同 id 的媒体 / 附件沿用本机字节；快照里没有、本机却带字节的行一律算会丢，整体拒绝（预览时说明，写事务里再查一次）。
  - 写入前把当前状态另存一份快照（`packageKind: 'snapshot-restore'`），失败就中止；所以恢复本身也能撤回。
  - 项目快照：清空该项目内容后写入，沿用原 id。整库快照：只替换快照里出现的表（含项目 AI），并把记下的偏好原值写回。
  - 写完读回核对：快照里每一行都必须读得回来，否则报错并给出恢复前快照的序号。
  - 成功后提示重新加载页面，以读到恢复后的数据与偏好。
- 测试：`overwriteSnapshotRestoreService.test.ts`（列表、预览、恢复与读回、字节保留、恢复前快照可再恢复、协作过拒绝、会丢字节拒绝、整库快照含偏好与项目 AI）、`SnapshotRestoreDialog.test.tsx`（列表字段、空状态、二次确认、拒绝原因、失败提示、重新加载）、e2e `tests/e2e/snapshotRestore.spec.ts`（覆盖后经界面恢复、字节保留、恢复前快照；会丢字节时拒绝且不写入）。

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

用户决定（2026-10-09）的补充测试：`JybService.aiAndPreferences.test.ts`（项目 AI 切分与 id 重映射、取消导入 AI、JYM 仍丢 AI、默认含音频、偏好打包与去密钥、整库还原写回偏好）、`LeftRailProjectHub.test.tsx`（AI 勾选、偏好列表与勾选）。

测试编号对应：T53 `JybService.test.ts`（含整库 JSON 导出）+ e2e；T30 `JybService.test.ts`、`LeftRailProjectHub.test.tsx` + e2e；T34 `JybService.test.ts`（空库、替换、字节会丢中止、本机协作过、备份里的项目协作过）、`LeftRailProjectHub.test.tsx` + e2e。

## 已知限制

- 整库还原后本机派生数据可能过期，需要重新生成。
- 快照不含字节：快照里没有、本机却带字节的行（例如覆盖后新录的音频）会让恢复被拒绝，需要先导出或删除那段录音。
