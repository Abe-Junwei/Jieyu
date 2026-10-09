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

## 自动化验证

| 项           | 命令                                                                                                                                      | 结果                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| T41 单元测试 | `npx vitest run src/services/rawSnapshotConverter.test.ts`                                                                                | 4 用例通过           |
| 相关单元测试 | `npx vitest run src/components/transcription/LeftRailProjectHub.test.tsx src/hooks/importExport src/db/migration src/services/JybService` | 17 文件 182 用例通过 |
| T43 单元测试 | `npx vitest run src/services/SnapshotService.test.ts src/components/RecoverySnapshotSkippedNotice.test.tsx src/hooks/transcription`       | 通过                 |
| T41 e2e      | `npx playwright test --project=chromium tests/e2e/batch4bRawSnapshot.spec.ts tests/e2e/batch3Jyb.spec.ts`                                 | 5/5 通过             |

测试编号对应：T41 `rawSnapshotConverter.test.ts`（转换后逐项目导入字节完整、原始 ZIP 不变、合成 v2 upgrader 被执行、upgrader 失败时原始数据和主库不变且临时库被删、比应用新 / 其他库 / 非原始快照被拒绝）+ e2e；T43 `SnapshotService.test.ts`（超限返回已跳过并清理旧快照、按项目存取、升级前整库快照按项目读取并一并清除）、`RecoverySnapshotSkippedNotice.test.tsx`。
