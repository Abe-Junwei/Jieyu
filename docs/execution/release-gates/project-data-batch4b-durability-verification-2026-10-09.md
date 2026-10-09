---
title: 项目数据第 4b 批（原始快照转换与存储耐久）验证记录
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-10-09
source_of_truth: tests/e2e/batch4bRawSnapshot.spec.ts
---

# 项目数据第 4b 批（原始快照转换与存储耐久）验证记录（2026-10-09）

对应方案：[项目、资料与持久化架构改进方案（修订五）](../plans/project-data-architecture-improvement-2026-10-08.md) 第 4b 批（N8、S4、S8；T41、T43、T44）。前置：[第 4a 批验证记录](./project-data-batch4a-migration-framework-verification-2026-10-09.md)、[第 3 批 JYB 验证记录](./project-data-batch3-jyb-verification-2026-10-09.md)。

## T41 原始快照 → JYB 转换（8.2）

- `src/services/rawSnapshotConverter.ts`：`convertRawSnapshotToJyb(rawZip)` 解析 raw-idb ZIP → 检查（只接受 `jieyu` 库；Dexie 版本不能比应用新，也不能早于基线）→ 写入临时库 `jieyu-raw-convert-<uuid>` → 用同一份版本账本打开临时库（按顺序执行 upgrader）→ 以临时库为数据源导出 JYB（含音频，不含本机偏好）→ 删除临时库。
- 原始 ZIP 与主库在整个过程中都只读；升级或导出失败时临时库被删除，错误原因分为 not-raw-snapshot / other-database / newer-than-app / older-than-baseline / upgrade-failed / export-failed。
- 转换结果走第 3 批已有的 JYB 导入预览：默认逐项目导入为新项目（新 ID、`restoredFrom.packageKind = 'jyb'`），也可走整库还原（要点两次）。
- 入口：项目中心“导入 → 从原始恢复快照导入（.zip）…”；归档导入时选中 raw-idb ZIP 也会自动识别并转换。项目中心“导出 → 导出原始恢复快照（.zip，含音频）”可在正常状态下手动导出（与迁移闸门遮罩里的原始导出是同一格式）。
- 为此 `JieyuDexie` 构造可传入版本账本（测试用合成 v2），`wrapJieyuDexie` 把任意 Dexie 实例包成 `JieyuDatabase`，`exportDatabaseAsJson` / `exportDatabaseToJyb` 支持 `source`。

## T43 按项目的崩溃恢复快照（8.3）

- `SnapshotService.saveRecoverySnapshot(dbName, { projectId })` 只保存当前项目的行（`filterCollectionsForProject`），按 `<dbName>::project::<textId>` 分开存放；读取、清除也按项目。升级前留下的整库快照（键为库名）在读取时只取当前项目的行，清除项目快照时一并删除（与旧行为一致）。
- 超过 8 MiB：不写入，返回 `skipped-too-large`，并删除本项目的旧恢复快照（旧快照比当前数据旧，留着会在崩溃后被当成“可恢复”）；日志级别从 debug 提到 warn。
- 界面：工作台顶部 `RecoverySnapshotSkippedNotice` 显示“已跳过崩溃恢复快照：当前项目约 X MiB，超过 8 MiB 上限……旧的恢复快照已清理”，可点“知道了”关闭；下一次成功保存后自动消失。
- 行为变化：以前超限时保留旧快照（有单元测试锁定），现在按方案改为清理。

## T44 存储耐久（6.2）

- persist：`src/utils/storageDurability.ts`。启动时照旧申请一次（无手势，Chromium 按站点参与度静默决定），结果只在还没有手势申请时记录；第一次导入（项目中心选文件、工作台导入文件）或第一次保存项目包（JYT/JYM 导出、JYB 导出）时，在处理函数第一个 await 之前伴随手势再申请一次并记录（`jieyu.storage.persistRequest.v1`：结果、触发方式、时间）。之后的导入 / 保存不再打扰；诊断面板里的“申请持久存储”每次都申请。
- 诊断面板：设置 → 数据 → “存储诊断与备份”，显示 `estimate()` 的已用 / 配额、`persisted()`、最近一次申请的结果与触发方式、Safari ITP 提示（原文见方案 6.2）。
- 写入失败：归档导入的错误说明复用 4a 的 `classifyStorageFailure`；配额不足（包括被包在 AbortError 里的）显示“存储空间不足，导入没有完成；已有数据没有改动，也没有删除任何原件”。导入在事务里，失败时什么都不写。
- 顺带修复：保存状态出错的提示条以前用 `errorMeta.i18nKey` 不带参数翻译，带占位符的键会显示成“导入失败：{message}”，所有导入失败的原因都看不到；现在键里有占位符时用调用方已填好的消息。
- 站点外备份：支持 File System Access 的浏览器在诊断面板里“备份到文件夹…”：每次让用户选文件夹（浏览器按 `id` 记住位置，不保存句柄），写一份整库 JYB（含音频）`jieyu-backup-YYYYMMDD-HHmmss-SSS.jyb`，写好后只保留最近 3 份；只删本功能写的文件；写入失败时删掉没写完的这一份，旧备份不动。不支持的浏览器显示说明，沿用已有的下载提醒（`backupExportReminderState`，JYB 导出已计入）。没有做定时自动写入（需要已保存的句柄和权限重新确认，留到需要时再做）。

## 流式处理评估（4a 遗留）

- 现状：恢复快照（8 MiB 上限）、迁移快照、原始导出、JYM/JYB 导出与导入都是整份读进内存；fflate 在内存里打包。字节（音频）是主要体积。
- 结论：本批不改。理由：（1）IndexedDB 读本身按事务整表取，真正的流式需要游标分批 + 分段写 ZIP（fflate 的 `Zip` 流式 API 可用）+ 下载端 `showSaveFilePicker`/`createWritable` 或 Service Worker 流，改动面覆盖 4a 快照校验与 3 批导入预览；（2）恢复快照现在按项目且有 8 MiB 上限，超限会显示“已跳过”，不再是静默风险；（3）当前数据量（开发期、单项目音频几十 MiB）在桌面浏览器内存内可完成。
- 触发条件（任一满足就做）：单库 JYB 超过约 500 MiB；出现导出 / 快照时的内存不足报告；要支持移动端 Safari。做法：原始导出与 JYB 导出先改为逐表游标 + fflate 流式 `Zip` + `createWritable` 写盘，导入端用 `Unzip` 流式解析 manifest 后逐条写入。

## 自动化验证

| 项           | 命令                                                                                                                                                                         | 结果                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| T41 单元测试 | `npx vitest run src/services/rawSnapshotConverter.test.ts`                                                                                                                   | 4 用例通过           |
| 相关单元测试 | `npx vitest run src/components/transcription/LeftRailProjectHub.test.tsx src/hooks/importExport src/db/migration src/services/JybService`                                    | 17 文件 182 用例通过 |
| T43 单元测试 | `npx vitest run src/services/SnapshotService.test.ts src/components/RecoverySnapshotSkippedNotice.test.tsx src/hooks/transcription`                                          | 通过                 |
| T44 单元测试 | `npx vitest run src/utils/storageDurability.test.ts src/services/backupFolderService.test.ts src/utils/archiveImportErrorMessage.test.ts src/contexts/ToastContext.test.tsx` | 通过                 |
| T44 e2e      | `npx playwright test --project=chromium tests/e2e/batch4bDurability.spec.ts`                                                                                                 | 1/1 通过             |
| T41 e2e      | `npx playwright test --project=chromium tests/e2e/batch4bRawSnapshot.spec.ts tests/e2e/batch3Jyb.spec.ts`                                                                    | 5/5 通过             |

测试编号对应：T41 `rawSnapshotConverter.test.ts`（转换后逐项目导入字节完整、原始 ZIP 不变、合成 v2 upgrader 被执行、upgrader 失败时原始数据和主库不变且临时库被删、比应用新 / 其他库 / 非原始快照被拒绝）+ e2e；T43 `SnapshotService.test.ts`（超限返回已跳过并清理旧快照、按项目存取、升级前整库快照按项目读取并一并清除）、`RecoverySnapshotSkippedNotice.test.tsx`；T44 `storageDurability.test.ts`（只在第一次导入 / 保存时申请、启动申请不覆盖手势记录、不支持与出错都记录）、`backupFolderService.test.ts`（保留最近 3 份、不动其他文件、写入失败不动旧备份）+ e2e（主库写入全部报 QuotaExceededError 时导入只提示、项目数和音频字节不变；persist 记录为导入时；诊断面板；OPFS 目录代替用户文件夹轮换 4 次后剩 3 份）。
