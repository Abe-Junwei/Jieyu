---
title: 对项目/资料/持久化方案修订二的外部评审核查结论
doc_type: execution-audit
status: completed
owner: repo
last_reviewed: 2026-10-08
source_of_truth: code_snapshot_review
depends_on:
  - ../plans/project-data-architecture-improvement-2026-10-08.md
  - ./project-file-architecture-review-2026-10-08.md
---

# 对修订二外部评审的核查结论

**核查范围**
- 代码：box 克隆 `origin/main@85ff9f82`；用户 Mac 分支 `feat/project-file-board-ui`（只读）。该分支相对 origin/main 只改了 UI 和文档，`src/db`、`src/services`、`src/collaboration`、`src/hooks` 的 diff 为空，所以下面的证据对两者都适用。
- 实验：在 box 上用 fake-indexeddb 跑了一个临时探针，验证完已删除。没有改 Mac 仓库，也没有提交任何东西。

**编号说明**：七点的编号按父代理转述的议题顺序排，可能和评审原文的编号不完全一致。

**结论标记**：✅ 成立 / ◐ 部分成立 / ✗ 不成立。

## 1. 入站字节语义：JYT 清掉标记、词典附件、skip-existing（✅ 成立，并纠正修订二的两处错误）

**证据**
- JYT 导出会删掉省略标记：`JymService.ts:446-462` 的 `sanitizeSnapshotForJyt` 删除 `audioDataUrl`，**同时删除 `audioExportOmitted`**。所以 JYM 和 JYT **并不等价**：JYM 保留 `audioExportOmitted: true`，JYT 的行上没有任何省略标记。修订二写的“JYT 只多删一个本来就不存在的字段”是错的。
- 词典附件用的是另一个标记：`io.ts:72-79` 去掉 `lexeme_assets.blob`，写的是 `blobExportOmitted`，不是 `audioExportOmitted`。修订二第 1 批的修复条件“凡标了 `audioExportOmitted` 的行都保留本机字节”有三处覆盖不到：词典附件、JYT 导入、没有标记的旧快照。
- 不是所有导入策略都会覆盖本机字节（`io.ts:644-666`）：
  - `skip-existing` 只插入本机还不存在的 id（`bulkGet` 后过滤），本机已有的行不动，字节不会被覆盖。
  - `upsert` 用 `bulkPut` 整行覆盖，会丢字节。
  - `replace-all` 先 `table.clear()` 再写，会丢字节。
  - 修订二 N2 里“任何策略”的说法过宽。

**方案改动**
- 定义三种入站字节语义：**携带字节**、**明示省略**、**未知（旧包或标记已被清掉）**。后两种一律保留本机已有字节；“入站行里没有字节”永远不能解释为“删除字节”。
- JYT 导出改为保留省略标记，manifest 写 `media: excluded`。
- `replace-all` 必须先读出本机字节，或者在预览里写明会丢失的数量。
- T8 按“导入策略 × 字节语义 × 表（media_items / lexeme_assets）”拆成矩阵来测。

## 2. 缺失和占位要分开：timelineKind 与 N4 风险（✅ 成立）

**证据**
- `resolveMediaItemTimelineKind`（`mediaItemTimelineKind.ts:31-44`）只区分两种：`acoustic` 和 `placeholder`。
- 但 `importAudio` 判断占位时额外加了一个条件：只要“既不是附属录音、又没有可播放载荷”就算占位（`linguisticServiceMediaImport.ts:40-51`（`:47-51`））。因此 JYM/JYT 导入后那些 `timelineKind: acoustic`、但没有 blob 的录音行，会被当作占位合并（N4）。
- `timelineKind` 在主要写入路径上会补齐（`linguisticServiceMediaReadWrite.ts:8,18`），但缺这个字段的旧行仍然走启发式判断。

**方案改动**
- 继续用 `timelineKind` 表示“这条轴的性质”，另加两个独立字段：`byteLocation`（managed / url / none）和 `availability`（available / missing）。“声学轴但缺字节”的状态是 `acoustic + none + missing`，和 `placeholder` 完全分开。
- `importAudio` 只合并 `timelineKind = placeholder` 的行。
- 新增测试：导入 JYT 之后再导入其中一条录音的音频，其他录音不受影响。

## 3. 迁移被阻止后，导出入口会绕回去触发升级；还要按版本区间分级、注意唯一索引（✅ 成立；唯一索引一项 ◐；另有一个更严重的新发现）

**证据：导出会触发升级**
- `exportDatabaseAsJson` 调用 `getDb()`（`io.ts:49`）。`getDb` 走 `_createDb`，其中会执行 `dexie.open()`，也就是执行升级（`engine.ts:1615-1640,1851-1858`）。
- 所以“阻止升级，然后提供 JYB 导出”这条路要么会在导出时触发升级，要么也被拦住，形成死循环。
- 可以复用的基础：`preMigrationBackup.ts:69-129` 已经用原生 IndexedDB 按现有版本只读读取所有 store。

**证据：版本区间**
- 一次升级可能跨好几个版本（例如从 v40 升到 v54），中间的 upgrader 依次执行。全仓有 17 个带 `.upgrade()` 的版本。还有多处把表设为 `null` 来删表（`engine.ts:609,615,734,959,1280,1305-1307`）。所以分级必须按 `(from, to]` 区间整体判断：区间里任一步改写或删除数据，整次升级就按会改写处理。

**证据：唯一索引**
- 当前 schema 里没有唯一索引（`&`）。所以这是未来的风险，不是现状。
- 规则可以采纳：以后新增唯一索引或修改主键，都不算加法迁移，因为已有重复数据会触发 ConstraintError，导致整个升级中止。

**新发现 N12（P1，已复现）：升级前备份实际上从未运行**
- `readCurrentIdbVersion` 读的是原生 IDB 版本，Dexie 把它存成 `verno × 10`。但代码拿它和 Dexie 的版本号 `54` 比较（`engine.ts:1579-1591,1618-1619`）。
- 后果：任何 Dexie 版本 ≥ 6 的已有数据库都满足 `530 < 54 == false`，所以 `migrationNeeded` 永远是 false。升级前备份、进度遮罩、失败后自动恢复、升级后抽查都不会执行。
- 探针：先建一个 Dexie v53 的 `jieyudb_v2`（原生版本 530），再调用 `getDb()`。结果是升级到 540，没有触发 `jieyu:db-migration-start` 事件，也没有生成备份库。
- 修订二描述的“备份失败仍继续升级”在实际环境里根本到不了，因为备份从一开始就没被调用。
- 修复时要注意：`createPreMigrationBackupSnapshot` 用 `fromVersion` 打开原生库（`preMigrationBackup.ts:170`），需要传原生版本号。另外，备份会复制全部 Blob 而且没有保留上限，修好版本单位后会立刻占用一倍空间，所以必须同时加上保留上限和配额预检。

**方案改动**
- N12 进第 1 批：修正版本单位，加保留上限 1 份和配额预检，并让失败可见。
- 第 4 批新增一条不经过 `getDb` 的原生 IndexedDB 只读恢复导出路径，生成含字节的 ZIP。
- 版本区间分级：每个版本声明 `additive | rewriting`；新增唯一索引、修改主键、删表都算 rewriting。

## 4. claimUnscopedCatalog：第一次读取就认领，且有并发问题（✅ 成立）

**证据**
- `projectCatalogScope.ts:11-47` 会把 15 张表里所有没有 `textId` 的行**全部**归给调用它的项目，不看这些行是否被该项目用到。
- 它在**读路径**上被调用，例如列出正字法时（`LinguisticService.orthography.ts:338`），另外还有 6 处调用（speaker/lexeme/languageCatalog 等）。
- 整个过程不在事务里，逐行 `update`，说话人和词条的克隆也不是原子操作（`:83-106,131-138`）。两个标签页或两个项目同时首次读取时，认领结果取决于时序。
- ADR-0044 第 2 条把这种做法写成了规则（`docs/adr/0044-project-owned-catalogs.md:19`）。

**方案改动**
- 新增一个显式任务：一次性、可审计的认领迁移。规则是：有引用的按引用归属；被多个项目引用的复制；没有引用的进“待归属”区，由用户分配，或者明确归入当前项目并记日志。整个过程在一个事务里完成，并写审计记录。
- 同时修订 ADR-0044 第 2 条。
- 配套测试：并发两个项目同时首次读取；无引用行的处理；审计记录可查。

## 5. 依赖闭包只按引用收集，会丢掉项目内未被引用的词条；JYB 要有两种恢复模式（✅ 对修订二的文字成立；修订二对现有过滤器的描述有一处要更正）

**证据**
- 修订二把闭包写成“项目内容加上它**引用**的项目目录行”。按这个定义，没有被单元引用的词条、正字法等都会丢失。
- 现有协作过滤器其实是**按 `textId` 全量收集**项目目录：`projectScopedSnapshot.ts:189-194`；说话人是“被引用的或 `textId` 等于本项目的”，见 `:181-184`。修订二说它“会漏掉没被单元引用的名单说话人”不准确，真正会漏的只有**还没被认领的**无主行。

**方案改动**
- 项目包包含该项目拥有的**全部**目录行，再加上被引用、但还没有归属的行（先完成第 4 点的认领再导出）。
- JYB 定义两种恢复模式：
  - 默认：逐项目作为新项目导入。
  - 整库替换：只在本地库为空，或者本地没有协作过的项目时提供，需要二次确认，并先自动做整库快照。这样和 D5 一致。

## 6. 协作删除安全应单独成批并提前（✅ 成立）

**证据**
- 云端有 `projects.archived_at` 字段（`supabase/sql/001_collaboration_foundation.sql:78`），但客户端从不使用它；全仓也没有删除或归档云端项目的代码。
- RLS 插入策略只检查成员身份（`002_collaboration_rls_identity_bind.sql:24-32`），不检查项目是否已归档或删除。
- 本地删除项目时，不处理待发队列（`CollaborationOutboundQueue.ts`，删除路径不经过这里）。
- 协作开关默认开启：`featureFlags.ts:174` 是 `?? true`，前提是配置了 Supabase。
- 结论：修订二把这件事放在第 5 批，风险太晚才处理。

**方案改动**
- 新增“第 2C 批 协作删除安全”，排在第 3 批之前，可以和第 2 批并行。内容：
  - 删除时写一条持久化、可重试的清理任务，覆盖跨库和 localStorage 队列。
  - 项目级墓碑。
  - 服务端用 RLS/触发器拒绝对已删除或已归档项目的写入。
  - 区分“仅从本机移除”和“删除云端项目”（后者只有 owner 能做）。
  - 待发操作标为 `cancelled_by_delete`。
  - clientId 按安装实例稳定生成，并且不会通过项目包或 JYB 复制出去。

## 7. 第 3 批前先冻结 AnnotationDocument 最小契约；manifest 改为文件条目数组；LIFT guid 的粒度（✅ / ◐ / ✅）

**证据：AnnotationDocument 最小契约（✅）**
- D4 已决定最终要支持多文稿。如果第 3 批在没有文档概念的情况下就定下 JYM/JYT 格式，第 5 批就得升级包格式。
- 采纳：第 3 批开工前先冻结最小契约，包括 `documentId`、来源引用、层归属、manifest 里的 `documents[]`。当前每个项目只有一份文档时，以 `documentId = default` 写入。

**证据：manifest 结构（◐）**
- OCFL 的 `digest → [paths]` 本身能表示“相同字节、多个路径”，所以修订二的映射在技术上没有错。
- 但解语的每个文件都要带 `mediaId`、`role`、`status`、`derivedFrom` 等元数据，用摘要作键既别扭，又会诱导人按摘要合并身份。
- 采纳：改为 `files[]` 条目数组，每条包含 `path`、`sha256`、`size`、`role`、`entityId`；sha256 只用来校验和提示重复。

**证据：LIFT guid 粒度（✅）**
- LIFT 的 guid 和 id 是**词条或义项级**的，没有文档级标识（调研报告 3.2 节）。
- 解语的导入器读的是词条 `id`，不读 `guid`（`lexiconLiftImport.ts:208`）；导出只写 `id="lexeme.id"`（`lexiconLiftExport.ts:130`）。
- 修订二把 LIFT guid 当成 `externalDocId` 是错的。改为：LIFT 不参与文档级匹配，只在**词条级**按 guid（缺失时用 id）做更新匹配。导出时补写 `guid`。

## 8. 浏览器调研的措辞：Safari 7 天（◐ 部分成立）

**证据**
- WebKit 2020 博文原话是：“deleting all of a website’s script-writable storage after seven days of **Safari use** without user interaction on the site”；主屏 Web App 单独计数，官方说“不预期删除”。
- WebKit 2023 存储策略：驱逐还可能因为超出总配额、存储压力，或者“一段时间没有交互（见 ITP）”而发生；persist 是按启发式批准的，例如是否作为主屏 Web App 打开。
- 修订二写的“7 天无交互会被清除”漏掉了两点：“按 Safari 使用天数计算”和“这是 ITP 机制”，而且没有说明我们没有在当前 Safari 版本上实测过。

**方案改动**
- 措辞收窄为：“按 WebKit 2020 的 ITP 说明，Safari 使用满 7 天、其间没有与本站交互，可能删除 IndexedDB 等脚本可写存储；主屏 Web App 单独计数。当前版本的行为未实测。”
- 诊断面板只提示风险，不给出确定的天数承诺。

## 9. 证据与表述方面

- **“第 0 批决定没有来源记录”（✗ 不成立，但建议采纳）**：用户在 2026-10-08 的对话里明确给出了决定，原话是：“1. JYM同意，JYT是导出不含媒体，如eaf这种，JYB是整库备份 2. 同意 3. 同意 4. 同意 5. 同意”。评审方看不到这段对话。修订三在决定记录里逐字引用原话。
- **“直接 revert”的回滚说法过于乐观（✅）**：第 1 批改变的是导入语义，回退代码会让数据丢失问题重新出现；第 2 批之后的新字段是在新语义下写入的。修订三改成条件式回滚，写明能回滚的前提和回滚后会失去什么保护。
- **工作量（✅）**：修订三统一标注“粗估，没有测量依据，不作为承诺”。
- **T8（✅）**：见第 1 点，改为矩阵。
- **只在 fake-indexeddb 里验证（成立，修订二已经说明）**：N12 同样只在 fake-indexeddb 里复现。Dexie 的 `×10` 规则在真实浏览器中也一样（Dexie 源码 `dexie.mjs:4002,4506`），但仍建议在隔离的浏览器配置里确认一次。
