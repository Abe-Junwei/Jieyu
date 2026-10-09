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
- 站点外备份：支持 File System Access 的浏览器在诊断面板里“选择文件夹…”，目录句柄存在 IndexedDB（`jieyu_backup_folder`）。“立即备份”和自动备份都写一份整库 JYB（含音频）`jieyu-backup-YYYYMMDD-HHmmss-SSS.jyb`，写好后只保留最近 3 份；只删本功能写的文件；写入失败时删掉没写完的这一份，旧备份不动。不支持的浏览器显示说明，沿用已有的下载提醒（`backupExportReminderState`，JYB 导出已计入）。
- 自动备份：设置 → 数据 可选关闭 / 每 6 小时 / 每天（默认）/ 每周。应用每小时检查一次，距上次成功满间隔才写，失败后一小时内不重试；多个标签页用 Web Locks（`jieyu-backup-folder`）只跑一个。浏览器要求重新授权时，自动备份不弹申请（没有用户手势），记为“需要重新授权”，弹出一次不阻塞的提醒；点“立即备份”时才申请授权。上次成功、上次失败（时间、原因）都显示在诊断面板。

## 大包流式处理（用户决定 #5，2026-10-09）

- 做法：包一律按 Blob 处理，整包不进 JS 内存。新增 `src/services/zipBlob.ts`（约 250 行，无新依赖）：写 ZIP 时字节文件直接引用库里的 Blob（不复制），CRC 按 8 MiB 分块读；JSON 用 fflate `deflateSync` 压缩。读 ZIP 时只读末尾的中央目录，条目按需读取，不压缩的条目直接切成 Blob。没有用 fflate 的流式 `Zip` / `Unzip`：它们让每个字节都经过 JS 数据块，做不到零拷贝；fflate 没有导出 CRC，所以 CRC 表自己写了 10 行。
- JYM / JYT / JYB 导出：`exportProjectPackage`、`exportDatabaseToJybBlob` 返回 Blob，下载、备份文件夹（`createWritable().write(blob)`）、原始快照转换都用 Blob。`exportProjectToJym` / `exportProjectToJyt` / `exportDatabaseToJyb` 保留为返回字节的薄封装（测试与小包用）。
- 导入：项目中心直接把选中的 File 交给导入（不再 `arrayBuffer()` 整份读出）。`unzipWithGuard` 先按中央目录检查条目数、单条和总大小，再逐条读：sha256 照旧逐个文件核对（同一时间只有一个文件在内存里）；不加密的音频 / 附件写库时用包文件的切片；加密的逐个解密。
- 原始快照：导出时 Blob 值只被引用；解析时 Blob 值是快照文件的切片，其余二进制读成字节。原始快照转 JYB 也全程用 Blob。
- 快照：覆盖前快照只存 JSON、不带字节（3 批设计）；迁移快照是 IndexedDB 到 IndexedDB 的复制，Blob 以句柄形式复制，抽样核对时才读字节；两者都不经过包，不需要改。按项目的恢复快照仍有 8 MiB 上限（只含 JSON）。
- 上限：JYM / JYB 的包总大小与展开总大小 512 MiB → 4095 MiB（ZIP32 上限，不写 ZIP64；超过时导出前就报“太大”）；单个文件 512 MiB → 1 GiB。`shortcut:` 单个文件仍整份读进内存算 SHA-256（WebCrypto 不能分段），单条录音超过 1 GiB 成为真实需求时改成分段 SHA-256 再放开。JYT 上限不变。
- 兼容：旧包（fflate 写的）照常读；新包 fflate 也能读（单元测试互相验证）。不支持 ZIP64 和加密 ZIP 条目，遇到时报“无法解压”。
- 注意：导入时音频按切片引用选中的文件，预览后、确认前若文件在磁盘上被改动，浏览器读取会失败，导入在事务里整体不写。

## 自动化验证

| 项           | 命令                                                                                                                                                                                                  | 结果                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| T41 单元测试 | `npx vitest run src/services/rawSnapshotConverter.test.ts`                                                                                                                                            | 4 用例通过           |
| 相关单元测试 | `npx vitest run src/components/transcription/LeftRailProjectHub.test.tsx src/hooks/importExport src/db/migration src/services/JybService`                                                             | 17 文件 182 用例通过 |
| T43 单元测试 | `npx vitest run src/services/SnapshotService.test.ts src/components/RecoverySnapshotSkippedNotice.test.tsx src/hooks/transcription`                                                                   | 通过                 |
| T44 单元测试 | `npx vitest run src/utils/storageDurability.test.ts src/services/backupFolderService.test.ts src/utils/archiveImportErrorMessage.test.ts src/contexts/ToastContext.test.tsx`                          | 通过                 |
| T44 e2e      | `npx playwright test --project=chromium tests/e2e/batch4bDurability.spec.ts`                                                                                                                          | 1/1 通过             |
| T41 e2e      | `npx playwright test --project=chromium tests/e2e/batch4bRawSnapshot.spec.ts tests/e2e/batch3Jyb.spec.ts`                                                                                             | 5/5 通过             |
| #5 单元测试  | `npx vitest run src/services/zipBlob.test.ts src/services/packageStreaming.test.ts`                                                                                                                   | 9 用例通过           |
| #5 e2e       | `npx playwright test --project=chromium tests/e2e/batch4bDurability.spec.ts tests/e2e/batch3Jym.spec.ts tests/e2e/batch3Jyb.spec.ts tests/e2e/batch3Jyt.spec.ts tests/e2e/batch4bRawSnapshot.spec.ts` | 14/14 通过           |

全量（Node 22，提交 `e76f90d6`，同一次运行）：`npm run test:vitest:dot` 882 文件通过、2 跳过，6268 用例通过、57 跳过；`npx playwright test --project=chromium --retries=0` 73 通过、2 跳过。

全量（Node 22，#4 + #5 + REV5-N1/N6/N7/N4 全部在内，同一次运行，2026-10-09 13:26）：`npm run test:vitest:dot` 884 文件通过、2 跳过，6286 用例通过、57 跳过；`npx vite build` 通过；`npx playwright test --project=chromium --retries=0` 74 通过、2 跳过（含 160 MiB JYM e2e）。

测试编号对应：T41 `rawSnapshotConverter.test.ts`（转换后逐项目导入字节完整、原始 ZIP 不变、合成 v2 upgrader 被执行、upgrader 失败时原始数据和主库不变且临时库被删、比应用新 / 其他库 / 非原始快照被拒绝）+ e2e；T43 `SnapshotService.test.ts`（超限返回已跳过并清理旧快照、按项目存取、升级前整库快照按项目读取并一并清除）、`RecoverySnapshotSkippedNotice.test.tsx`；T44 `storageDurability.test.ts`（只在第一次导入 / 保存时申请、启动申请不覆盖手势记录、不支持与出错都记录）、`backupFolderService.test.ts`（保留最近 3 份、不动其他文件、写入失败不动旧备份并记录失败、只有交互时才申请授权、自动备份到期 / 未到期 / 失败退避 / 关闭、自动备份缺授权时记为需要重新授权）+ e2e（主库写入全部报 QuotaExceededError 时导入只提示、项目数和音频字节不变；persist 记录为导入时；诊断面板；OPFS 目录代替用户文件夹，选择后立即备份 4 次剩 3 份；把上次成功改成两天前再打开应用，自动备份写入新的一份，仍剩 3 份）。

#5 测试：`zipBlob.test.ts`（与 fflate 互相读写、UTF-8 文件名、20 MiB Blob 分块 CRC 与 zlib 一致、不读字节的切片、非 ZIP / ZIP64 / 实际比声明大时拒绝）；`packageStreaming.test.ts`（合成 4 条 12 MiB 录音共 48 MiB：JYM 导出与恢复中最大的一次读取正好是一条录音，从不整包读取，恢复后每条 sha256 一致；录音中改一个字节被 sha256 拒绝；JYB 整库导出导入同样；原始快照导出 / 解析不整包读取且 Blob 值字节一致；中央目录声明两条 600 MiB 的条目通过新上限检查，旧上限拒绝）；e2e 在页面里合成 160 MiB 录音，经项目中心导出 JYM（下载到磁盘）、以文件导入恢复为新项目，恢复后的音频 sha256 与原来一致（约 23 秒）。

## 复审修复（REV5，2026-10-09）

- REV5-N1（安全）：JYB 偏好白名单去掉三个带服务地址的键（`jieyu.embeddingProvider`、`jieyu.voiceAgent.localWhisper`、`jieyu.voiceAgent.sttEnhancement`），包里带了也忽略、不写回。其余键写回时，只有地址类字段（url / endpoint / host / origin / server）与本机完全相同才保留本机密钥字段，所以包里换了地址也拿不到本机 API Key。测试：`JybService.aiAndPreferences.test.ts`（REV5-N1 两条）。
- REV5-N6：原始快照解析先按 JYB 的上限检查中央目录里的条目数与大小（`parseRawIdbSnapshot(source, JYB_PACKAGE_POLICY)`，复用 `unzipWithGuard`），超限在读任何条目前拒绝；识别原始快照时 `manifest.json` 声明大于 4 MiB 直接判为不是。测试：`packageStreaming.test.ts`（REV5-N6）。
- REV5-N7 + P1：判断包类型（原始快照 / JYB / JYT / JYM）只读中央目录和 `mimetype`，不再整包解压（`isJybPackage` 改用 `readArchiveMimetype`，随 #5 一并完成）。一次导入里每个条目只读一次：预览核对一次，确认导入时为防文件被改动再核对一次，不再有额外的整包解压。测试：`packageStreaming.test.ts`（REV5-N7：在 48 MiB 的包上识别类型，最大一次读取小于 128 KiB）。
- REV5-N4（清单格式）：JYB 清单 `projects[]` 新增 `collaborated: boolean`，导出时按导出设备上的 D6 证据写（`isProjectNeverCollaborated`，不确定按 true）。整库还原的预览和服务层都把包里为 true 或缺失的项目当作协作过，再加上本机记录，所以在新设备上恢复别处协作过的项目也会被拒绝；逐项目导入不受影响。没有这个字段的旧 JYB 只能逐项目导入。测试：`JybService.test.ts`（REV5-N4 两条）。
