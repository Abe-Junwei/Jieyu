---
title: 项目、资料与持久化架构完整改进方案（修订三）
doc_type: execution-plan
status: proposed
owner: repo
last_reviewed: 2026-10-08
---

# 项目、资料与持久化架构改进方案（修订三）

> 第 0 批已于 2026-10-08 由用户决定（D1–D5；细则 D6–D8 于同日 19:19 确认），决定记录见 10.1。修订三吸收了一份对修订二的外部评审，逐条核查见[核查结论](../audits/project-file-plan-rev2-review-verdict-2026-10-08.md)。其余部分仍为待实施方案。

## 1. 目标与状态

解语是本地优先的田野语言资料研究工作台，需要长期保存录音、说明标注来源、可靠协作，并能与外部工具交换资料。本方案把项目组织、文件身份、领域写入、持久化、归档和代码治理放在同一条数据生命周期里处理。

**依据**
- [审查草稿](../audits/project-file-architecture-review-2026-10-08.md)（F1–F8）。
- 2026-10-08 对 `origin/main@85ff9f82` 的代码调查。功能分支 `feat/project-file-board-ui` 只改了 UI，数据层代码相同。
- 同类产品调研。
- 一份外部评审。

**写法约定**
- 全程没有改动生产数据库。
- 当前代码事实和目标设计分开写。
- 标“已复现”的问题，是在 fake-indexeddb 单元环境里复现的，**不等于真实浏览器里已经发生过数据损坏**。
- 每批实施都要留下验证证据，不能用勾选任务或检查文档代替真实数据验收。

**成功标准**
- S1 同名资料不会被误覆盖。
- S2 改名、重载之后，关联关系保持不变。
- S3 删除录音后时间轴保留；恢复或导入**不会**抹掉本机已有的媒体字节和附件字节。
- S4 一个项目能连同必要依赖一起导出，并在空库里完整恢复。
- S5 失败或跳过不会被报告成成功。
- S6 已删除的项目不会因为离线操作或同步而复活。
- S7 代码边界能支撑以上行为。

**范围外**：更换 Dexie、微服务、monorepo、全仓目录搬迁、引入 CRDT、通用文件管理器、一次性做成完整的档案馆平台。

## 2. 已确认现状与问题

### 2.1 原稿事实复核

| 原稿所述事实 | 复核结论（代码位置） | 主要缺口 |
| --- | --- | --- |
| 项目用 texts/textId 表示，录音放在 media_items | 成立（`db/types.ts:76-97`）。媒体没有原名、哈希、大小字段，字节放在 `details.audioBlob` | 概念边界需要明确 |
| 来源存在 metadata.sourceFiles，内容在 layer_units/contents | 成立。`sourceFiles` 不在 `PROJECT_TEXT_METADATA_KEYS` 里（`types/projectTextMetadata.ts:6-20`），没有类型约束 | 来源与内容之间没有作用域关系（F5） |
| 来源 ID 由格式加小写文件名组成 | 成立（`utils/projectSourceFiles.ts:83-85`）。已复现：`Story.eaf` 和 `story.eaf` 会合并成一条；改名后再导入原文件，名字会被改回去 | 同名不同内容会被覆盖（F1） |
| 可以按文件名回退关联录音 | 成立（`projectSourceFiles.ts:121-140`）。已复现：同名录音时**后一条胜出**；显式给出的 mediaId 不校验是否存在 | 歧义被静默吞掉（F2） |
| 来源登记和改名是读出项目后整行 put | 成立，已复现并发下的丢更新。**更正：`projectFileOps.ts` 的写操作完全没有事务**，唯一的事务是只读计数（`:59-65`）。同类写法共 18 处：10 处整行 put，8 处先 remove 再 insert | 需要**新建**项目元数据的事务原语（F3） |
| JYM/JYT 调用整库 JSON 导出，不传 textId，也不打包媒体 | 成立（`JymService.ts:466-497`）。**更正**：JYM 和 JYT 并不完全相同。JYT 会额外删掉 `audioExportOmitted` 标记（`:446-462`），导入方因此无法判断“字节是被省略了”。界面把两者都叫“全量备份”（`zh-CN.ts:3035`） | 产品契约不成立，命名误导（F4） |
| JSON 省略媒体和词典附件的 Blob；快照只接受当前版本 | 成立。媒体省略后标 `audioExportOmitted`，词典附件省略后标 **`blobExportOmitted`**（`io.ts:59-79`）。JYM 只接受 `formatVersion=1`（`JymService.ts:513`）。导出没有限额，导入限额是 32 MiB JSON / 80 MB 包 | 可能导出读不回来的包；没有长期兼容承诺 |
| 恢复快照先整库导出再筛选，超过 8 MiB 就跳过 | 成立（`io.ts:108-128`、`SnapshotService.ts:164-170`）。跳过时只打 debug 日志，旧快照还留着，而且它覆盖所有项目 | 状态看不见，恢复点可能已经过期（F6/F7） |
| 迁移前备份失败后仍继续升级 | 代码确实这么写（`engine.ts:1627-1633`），**但实际上这段走不到**：见 N12，升级前备份从来没有被调用过 | 安全网实际不存在（F6） |
| 启动时请求 persist | 成立，**但返回结果被丢弃**（`main.tsx:45`）。全仓没有调用 `storage.estimate()` | 违背“伴随用户手势、在保存时请求”的建议 |
| 多个存储库已有不同程度的清理 | 成立。迁移前备份库没有保留上限 | 缺少统一清单 |
| 架构地图同一页里同时写着 v34/v53/v54 | 成立（`仓库现状与代码地图.md:321,322,329,531,686,688`）。`migration-safety-ARCH-5.md:27` 写“不做自动备份”，与代码意图也不一致 | 文档不能作为事实依据（F8） |

### 2.2 原稿未涉及的问题

严重度定义：P0 = 正常操作就可能丢失用户数据；P1 = 数据完整性或一致性问题，或安全网缺失；P2 = 可靠性与可见性；P3 = 体验或文档。

| ID | 严重度 | 当前事实 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| N1 | P1（契约） | 导入任何标注文件，都会先删掉**整个项目**的单元图，而且删除发生在提交事务之外。`sourceFiles` 却留着历史条目，“多文稿”只是表象 | `importHandlers.ts:303-317,756`；现有测试明确断言了这种替换（`useImportExport.import.test.tsx:1922-1975`） | 代码与测试确认 |
| N2 | P0 | 入站数据里没有字节时，会把本机字节覆盖掉。各路径情况：`upsert` 用 `bulkPut` 整行覆盖；`replace-all` 先 `clear` 再写；**`skip-existing` 不会覆盖本机已有的 id**。受影响的有媒体 `audioBlob` 和词典附件 `blob`。应用恢复快照走 upsert；JYM/JYT 默认走 replace-all；协作 restore 先 prune 删行，再 upsert | `io.ts:644-666`；`useTranscriptionRecoveryActions.ts:83`；`projectScopedSnapshot.ts:324,409-410` | 已复现（upsert、协作路径） |
| N3 | P0 | 工作台的“导入标注”接受 .jym/.jyt，**不预览就用 replace-all 替换整个数据库** | `WorkbenchFilePane.tsx:207-214` → `importHandlers.ts:136-147` → `io.ts:644-646` | 代码确认 |
| N4 | P0（叠加 N2） | `importAudio` 把“没有可播放载荷”的行都当成占位，不管它的 `timelineKind` 是不是 `acoustic`。导入一个音频时，其他录音的句段会被并过去，其他媒体行被删除。JYM/JYT 导入之后的录音行都是这种状态 | `linguisticServiceMediaImport.ts:40-56,126-176`；`mediaItemTimelineKind.ts:31-44` | 已复现 |
| N5 | P1 | 8 处元数据写入用“先 remove 再 insert”，且没有事务。如果校验失败或中途中断，项目行已经被删掉了 | `adapter.ts:94-99` 等 | 静态推断 |
| N6 | P1 | 删除项目后会残留 `layer_links`、`project_ai_memories`、`user_notes(text)`、`ai_session_memories`、协作待发变更、`jieyu-project-memory` 库 | `LinguisticService.cleanup.ts:111-221` | 前三项已复现 |
| N7 | P1 | 协作 clientId 每次挂载都重新生成；协议里没有项目级墓碑；删除项目时不取消待发队列；云端 `projects.archived_at` 从来没用过；RLS 不检查项目是否已归档或删除；全仓没有删除云端项目的代码；协作开关默认开启 | `useTranscriptionCollaborationBridge.ts:122-127,160`；`syncTypes.ts:13-35`；`supabase/sql/001…:78`、`002…:24-32`；`featureFlags.ts:174` | 代码确认 |
| N8 | P2 | 恢复快照超过上限时静默跳过；应用恢复时会 upsert 所有项目的核心图 | `SnapshotService.ts:164-178`、`useTranscriptionRecoveryActions.ts:41-83` | 代码确认 |
| N9 | P2 | 删除录音会把 filename 改成占位名，文件列表又会隐藏占位行，结果关联的文稿变成孤立卡片 | `cleanup.ts:289`、`projectFileOps.ts:32` | 代码确认 |
| N10 | P1 | 无主的目录行会在**读路径**上（例如列出正字法时）被第一个读取它的项目**全部认领**，不管这个项目有没有用到。认领不在事务里，逐行 update，克隆也不是原子操作，并发时结果取决于时序。ADR-0044 第 2 条把这种做法写成了规则 | `projectCatalogScope.ts:11-47,83-138`；`LinguisticService.orthography.ts:338` | 代码确认 |
| N11 | P3 | 合成文稿的 id 在两处分别构造，改名后可能和已有来源撞 id | `projectFileOps.ts:70`、`ProjectFileBrowser.tsx:416,441-447` | 代码确认 |
| N12 | P1 | **升级前备份从来没有运行过。** `readCurrentIdbVersion` 读到的是原生 IDB 版本，也就是 Dexie 版本 ×10（如 530），代码却拿它和 Dexie 版本 54 比较。结果 `migrationNeeded` 永远为 false，备份、进度遮罩、失败后自动恢复、升级后抽查全部不会执行 | `engine.ts:1579-1591,1618-1619`；Dexie `dexie.mjs:4002,4506` | 已复现：v53 库升级到 540，没有触发事件，也没有生成备份库 |

## 3. 成熟方案依据与取舍

| 来源 | 借鉴内容 | 采用边界 |
| --- | --- | --- |
| [ELAR/lameta](https://blogs.soas.ac.uk/elar/2020/04/30/introducing-lameta/)、[SayMore](https://software.sil.org/saymore/features/)、[EXMARaLDA](https://www.exmaralda.org/pdf/Understanding_the_basics_of_exmaralda_EN.pdf)、[PARADISEC](https://www.paradisec.org.au/deposit/catalog-structure/) | 一个资料组就是一次采录事件；人物独立建档，可跨组复用 | 资料组是可选项；**不采用**“文件名即身份”（lameta 的改名级联 bug，LAM-112） |
| [ELAN EAF 3.0](https://www.mpi.nl/tools/elan/EAF_Annotation_Format_3.0_and_ELAN.pdf)、[LIFT 技术说明](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf) | EAF 的 URN 是**文档级**标识；LIFT 的 guid 是**词条或义项级**标识；`EXTRACTED_FROM` 记录派生关系 | EAF 按 URN 做文档匹配；LIFT 只按 guid 做词条级匹配 |
| [Lightroom](https://www.lightroomqueen.com/lightroom-photos-missing-fix/)、[ELAN 关联文件](https://www.mpi.nl/tools/elan/docs/manual/Sec_Changing_the_links_to_media_files.html)、[Zotero 附件](https://www.zotero.org/support/attaching_files) | 缺失文件用 Relink 修复，记录保持不变；受管文件和外链文件分开 | “修复缺失”和“导入新文件”做成两个入口 |
| [FLEx 恢复](https://downloads.languagetechnology.org/fieldworks/Documentation/en/User_Interface/Menus/File/Backup_and_Restore/Restore_a_project.htm)、[Logseq 导出](https://github.com/logseq/docs/blob/master/db-version.md) | 协作过的项目只能恢复成新项目；每种出口写明保真度；定期轮换备份到用户选的文件夹 | 恢复默认生成新项目；出口如实标注 |
| [OCFL 1.1](https://ocfl.io/1.1/spec/)、[BagIt](https://datatracker.ietf.org/doc/html/rfc8493)、[LDaC RO-Crate](https://github.com/Language-Research-Technology/ldac-profile/blob/master/profile/profile.md) | 内容路径用 ID、逻辑名只作元数据；sha256 校验；路径安全规则；文件角色分原始/派生/标注 | 采纳这些原则，manifest 改用文件条目数组；没做合规验证就不声称兼容 |
| [Zotero 数据目录](https://www.zotero.org/support/zotero_data)、[audacity-project-tools](https://github.com/audacity/audacity-project-tools)、[ELAN 备份](https://www.mpi.nl/tools/elan/docs/manual/Sec_Creating_automatic_backups.html) | 升级前留副本；恢复工具只写副本，不碰原件；保留最近一个已知良好的副本 | 改写或删除数据的迁移，必须先有恢复点 |
| [Joplin BaseItem](https://github.com/laurent22/joplin/blob/dev/packages/lib/models/BaseItem.ts)、[Lexbox #2367](https://github.com/sillsdev/languageforge-lexbox/pull/2367)、[Harmony](https://github.com/sillsdev/harmony) | 墓碑清理过早会让数据复活；冲突时删除优先（delete-wins）；每台设备一个稳定的 ClientId | 墓碑长期保留；服务端拒绝对已删除项目的写入 |
| [web.dev](https://web.dev/articles/persistent-storage)、[WebKit 2023](https://webkit.org/blog/14403/updates-to-storage-policy/)、[WebKit 2020 ITP](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)、[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)、[FSA](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api) | 只在保存关键数据时，伴随用户手势请求 persist；WebKit 按启发式批准 persist；ITP 有可能清除长期没有交互的站点的存储（见 6.2）；分库不能隔离配额 | 站点外备份是第一道防线 |
| [Dexie 设计说明](https://dexie.org/docs/Tutorial/Design) | 事务里一旦等待非 IDB 的异步调用，就会提前自动提交；已发布的 upgrader 必须冻结 | 先在事务外算哈希，再进事务写入；恢复导出不经过 Dexie 的 open |

**结论**
- 沿用成熟的数据语义，复用 Dexie、fflate 和现有领域模块。
- 第 1、2 批不新增依赖。
- 是否需要流式归档库，等第 3 批实测之后再比较。
- 同步压缩只在**测量过的**体量范围内使用。

## 4. 目标领域模型

### 4.1 概念与关系

| 对象 | 身份与职责 | 推荐关系 | 与现状的差距 |
| --- | --- | --- | --- |
| Project 项目 | 研究范围、元信息、默认访问级别；继续用 textId | 拥有资料组、项目目录和项目独占数据 | — |
| MaterialGroup 资料组 | 一次采录事件，包括源录音、派生媒体和全部标注 | 包含零到多份媒体和标注文档；允许纯文字 | 还不存在，放到第 5 批，而且要以真实场景为前提 |
| MediaResource 媒体 | 独立 ID；原名、显示名、格式、大小、sha256、时长和采样信息；角色 `primary / derived`；状态由三个**相互独立**的字段描述：`timelineKind`（acoustic / placeholder，沿用现有字段）、`byteLocation`（managed / url / none）、`availability`（available / missing） | 派生关系用 `derivedFrom` 记录；占位行可以作为时间轴宿主；“声学轴但缺字节”记为 `acoustic + none + missing`，它**不是**占位 | 现在只有 filename 和 details；占位判断靠启发式，而且两处判断不一致（N4） |
| AnnotationDocument 标注文档 | 独立 ID、语言和层的范围、关联的时间轴和来源；角色 `annotation` | 内容仍放在现有单元图里，不复制正文 | 现在每个项目只有一份内容（N1）。D4 决定最终支持多份：第 3 批开工前先冻结最小契约（见 4.2-9），第 5 批再完整实现 |
| SourceRecord 导入来源 | UUID 主键，另存 `legacyId`；`originalName`、`displayName`、`format`、`byteSize`、`sha256`、`externalDocId?`、`importedAt`、`importBatchId`、`storedBytes` | 通过导入活动把来源、文档和产出的层与单元连起来 | 现在只有 id、name、format、mediaId?、linkedMediaFilename? |
| ProjectCatalog 项目目录 | 说话人、词条、正字法、语言记录、标签等，**按 ADR-0044 归项目所有**（D3）；内置的语言代码和正字法种子在代码里，是只读模板 | 跨项目复用的方式是“导出时复制”或“从其他项目导入”（复制并重映射 ID）；无主旧行通过一次性认领处理（4.2-8） | 现在是读路径上的隐式认领，并且有并发问题（N10） |

这是逻辑模型，不要求新建六张表。texts 暂不改名。

### 4.2 身份、匹配与写入规则

1. **来源身份**：新来源用随机 UUID。旧的 `src-${format}-${name}` 保留为 `legacyId`，旧 `name` 继续可读。
2. **重新导入时的匹配顺序**：
   - 先看外部文档 ID。目前只有 EAF 的 `PROPERTY[@NAME="URN"]` 可用，命中时提示“更新已有文档”，并预览影响范围。
   - 再看 sha256。相同时提示“内容完全相同”。
   - **只有文件名相同的，一律当作新来源**，显示名自动加序号区分。
   - LIFT 没有文档级标识，不参与文档匹配。它的 guid 只用于**词条级**更新匹配；没有 guid 时用 id。现在的导入器只读 `id`、导出也不写 `guid`（`lexiconLiftImport.ts:208`、`lexiconLiftExport.ts:130`），导出时应补写。
   - FlexText 是否带 guid 还没核实。
3. **哈希在 Dexie 事务之外先算好**，再进事务登记，写完读回校验。
4. **关联媒体**：mediaId 必须存在，并且属于本项目。只有文件名时，唯一候选才提示匹配；有多个候选的，进入“未关联”状态。
5. **写入边界**：新增 `patchProjectMetadata(textId, fn)` 事务原语，替换那 18 处写法，禁止对 texts 先 remove 再 insert。项目不存在时要返回明确的结果。
6. **导入主体和来源登记在同一个提交里完成**（提交事务本来就包含 texts，`dexieTranscriptionGraphStores.ts:37-59`）。N1 中的清理步骤也并进去。
7. **入站字节的三种语义**（适用于媒体 `audioBlob` 和词典附件 `blob`，也适用于所有导入、恢复、协作 restore 路径）：
   - **携带字节**：写入字节。
   - **明示省略**（`audioExportOmitted` / `blobExportOmitted` / manifest 写 `media: excluded`）：本机已有同一 id 时**保留本机字节**；没有时，行状态记为 `none + missing`。
   - **未知**（旧快照、JYT 旧包这类标记已被清掉的情况）：按“明示省略”处理。
   - **入站数据里缺少字节，永远不能被理解为删除字节**；删除字节只能通过专门的操作完成。
   - `replace-all` 和协作的“先 prune 再写”必须在删行**之前**先读出要保留的字节。做不到时，要在预览里写明会丢失多少。
8. **目录认领**：读路径上的隐式认领改成**一次性、可审计的认领任务**。规则：
   - 被引用的行归引用它的项目；被多个项目引用的就复制。
   - 没有引用的行进入“待归属”状态（D8），**不自动归给任何项目**；由用户在界面中分配到某个项目，分配记审计日志。待归属的行在各项目的列表中都不显示，但可以在“待归属”视图里查看。
   - 整个过程在一个事务里完成，并写审计记录。
   - 完成后，读路径不再写入。
   - 相应修订 ADR-0044 第 2 条。
9. **AnnotationDocument 最小契约**（第 3 批的前置条件）：
   - `documentId`（现有的单份内容固定为 `default`）。
   - 文档 → 层的归属关系。
   - 文档 → 来源（SourceRecord）的引用。
   - manifest 里的 `documents[]`。
   - 只冻结字段和包格式；多文稿的界面与导入流程放到第 5 批。
10. **修复缺失（Relink）与重新导入分开**：Relink 保持 MediaResource 的 ID 不变，依次按 sha256、时长加名称校验。
11. 无法恢复的历史来源，标记为 `unknown`。

### 4.3 元信息与访问

**各层元信息**
- 项目：标题、研究说明、语言与工作语言、负责人和贡献者、默认访问级别。
- 资料组：采录时间、地点（存精确值，另设公开精度）、体裁、参与者及当次角色、说明。

**访问级别**
- 按 项目 → 资料组 → 文件 三层继承，下层可以覆盖上层。
- 候选词表：`open / registered / restricted / community-protocol`，外加 `embargoUntil`。
- 现有的 `accessRights` 字段作为过渡。

**原则**
- 必填项只有稳定 ID 和有效的归属。
- 同意书、敏感身份、公开描述三者分开保存。

## 5. 操作与界面契约

| 操作 | 当前行为（代码事实） | 目标行为 |
| --- | --- | --- |
| 首次导入 | 主体在一个事务里提交，来源登记在事务外 | 内容和来源在同一次提交里写入 |
| 再次导入 | 替换整个项目的单元图（N1） | 第 2 批：替换前先显示覆盖预览，清理与写入放在同一次提交里。第 5 批：可以选择“作为新的标注文档加入”（D4） |
| 改名 | 再导入原文件时，名字会被改回去 | 只改 displayName |
| 挂接/替换媒体 | 只能走 `importAudio(replace)` | 用 Relink 保持身份，或者明确创建一个派生资源；时长不一致时先预览 |
| 导入音频 | 会合并所有“没有载荷”的行（N4） | 只合并 `timelineKind = placeholder` 的行；缺字节的声学行走 Relink |
| 删除录音字节 | 原文件名被覆盖，行被隐藏（N9） | 保留原名，状态记为 `acoustic + none + missing` |
| 删除项目 | 有残留（N6），不处理同步队列（N7） | 见第 9 节：区分“仅从本机移除”和“删除云端项目”；用持久化、可重试的清理任务；写项目墓碑；取消待发操作 |
| 导出 JYM | 整库、不含媒体，带省略标记 | 单项目可编辑包，默认含受管媒体；不含媒体时在 manifest 里写明（D1） |
| 导出 JYT | 整库、不含媒体，且**删掉了省略标记** | 单项目、不含媒体的轻量标注/数据包（类似 EAF）；**保留省略标记**，标明“不含音频”（D1） |
| 导出 JYB（新格式） | 不存在 | 整库备份，界面和 manifest 都写明是否含音频（D1） |
| 导入 .jym/.jyt | 工作台入口直接整库 replace-all（N3） | 只走项目包导入流程，默认恢复成新项目；旧版整库包先给出提示和预览，按 4.2-7 保留本机字节 |
| 恢复 JYB | 不存在 | 两种模式，见第 7 节 |
| 覆盖当前项目 | 不存在 | 只对从未协作的本地项目提供，需要二次确认，并自动做覆盖前快照（D5） |
| 从其他项目导入目录 | 不存在 | 复制并重映射 ID（D3） |

保留现有的左侧面板切换、可折叠侧栏和工作区骨架。新增文案走 dictKeys/字典，颜色走语义 token。

## 6. 持久化与代码组织

### 6.1 存储分类

| 数据 | 现状 | 保存与失败策略 | 备份与清理 |
| --- | --- | --- | --- |
| 项目、内容、关系 | 主库 `jieyudb_v2` v54；部分写入没有事务 | 用事务、校验边界、写后读回 | 进项目包和 JYB |
| 原始媒体与附件 | 存在 `details.audioBlob`、`lexeme_assets.blob` | 入站按 4.2-7 的三种语义处理 | JYM 默认带字节，JYT 一律不带，JYB 写明带不带 |
| 派生数据 | 声学缓存有上限 | 可以重建 | 不进项目包 |
| 协作出站队列 | 失败默认不丢弃；存在 localStorage，满了退到 IDB 镜像 | 显示 pending、failed、cancelled 三种状态 | 删除项目时标为 `cancelled_by_delete` |
| 恢复快照与迁移备份 | 恢复快照只有一份，覆盖所有项目；迁移备份**从来没有运行过**（N12），而且没有保留上限 | 状态显式记录为 success、skipped 或 failed | 保留最近一个已知良好的副本，并设空间上限 |
| UI 偏好、行为日志、AI 历史 | 有部分上限 | 写明保留期限 | 默认不随对外项目包导出 |

### 6.2 存储耐久性

1. **persist 的时机**：改为在第一次导入资料，或者用户点击保存/导出时，伴随用户手势请求；记录结果；不阻断启动。
2. **存储诊断**：
   - 显示 `estimate()` 的用量和配额，以及 persist 的结果。
   - 显示风险提示。Safari 的提示措辞收窄为：“按 WebKit 2020 年的 ITP 说明，Safari 使用满 7 天、期间没有与本站交互，可能会删除 IndexedDB 等脚本可写存储；添加到主屏幕的 Web App 单独计数。当前 Safari 版本的实际行为没有实测。”WebKit 2023 年的说明还提到，超出配额或存储压力也可能导致驱逐，persist 由浏览器按启发式批准。
   - 统一处理 `QuotaExceededError`，**不自动删除原件**。
3. **站点外备份**：
   - Chromium 上用 File System Access 的持久权限，让用户选一个备份文件夹，定期轮换写入 JYB。
   - 其他浏览器退回到“提醒下载备份”。
4. **固定 origin**：将来如果做桌面封装，要先准备好从旧 origin 迁移数据的路径。

### 6.3 代码边界

**分层职责**
- UI/controller 负责交互。
- service 负责完整的领域操作。
- db 负责事务、schema、迁移和校验。

**现状问题**
- `pages/components` 里有 51 个文件直接 import db，28 个直接 import services。
- 删除项目有两条入口。
- 目录表清单至少有 4 份需要手工同步（`cleanup.ts:185-203`、`projectScopedSnapshot.ts:27-45`、`projectCatalogScope.ts:15-31`、`io.ts:150-259`），应该收拢成一处。

**约束**：不修改已经发布的迁移。

## 7. 项目包、整库备份与互操作

### 7.1 出口格式（D1）

- **JYM 项目包**：单项目、可编辑，能在空库里恢复，默认包含受管媒体。
- **JYT 轻量项目包**：单项目、**不含媒体**，定位类似 EAF。携带标注、层、来源记录和完整的项目目录。manifest 写 `media: excluded`，每条媒体行保留省略标记。导入后录音显示为“缺音”，用 Relink 补回。
- **JYB 整库备份**：所有项目，用于灾备；必须写明是否含音频。
- **交换格式**：EAF、TextGrid、TRS、FLEx、Toolbox、LIFT，附“未能表示的字段”报告。

### 7.2 manifest

**格式**：采用文件条目数组，不再用摘要作键。字段：

```
formatVersion, appVersion, created, kind: project|library,
media: included|excluded, digestAlgorithm: sha256,
projects[]: { id, restoredFrom?, documents[]: { documentId, layers[], sources[] } },
files[]: { path, sha256, size, role: data|media|source|metadata|interchange,
           entityType?, entityId?, mediaStatus?, derivedFrom? },
dependencies[], excluded[]: { kind, count, reason }
```

**规则**
- `path` 由 ID 生成，原名只作为元数据保存。
- sha256 只用于完整性校验和提示重复，**不作为身份**。字节相同的两份文件，各占一个条目。
- 路径校验参照 OCFL：不允许出现 `.`、`..`、空段、开头或结尾的 `/`、前缀冲突；大小写敏感；拒绝重复条目。
- 包里**永远不带** clientId、协作绑定、凭据或令牌。

### 7.3 依赖范围

项目包包含：
- 该项目的内容。
- 该项目**拥有的全部**目录行（按 `textId`，结构规则按 `projectId`），**不管有没有被单元引用**。
- 被引用但还没有归属的行。导出前先触发 4.2-8 的认领，做不了时在 `excluded[]` 里列出。

现有协作过滤器已经按 `textId` 收集目录行（`projectScopedSnapshot.ts:181-194`），可以复用。其他项目的私有内容一律排除。

### 7.4 入站流程

**导入前校验**：依次校验清单、版本、路径、大小和数量上限、哈希、引用，全部通过后才开始写入。

**JYM/JYT**
- 默认作为新项目恢复：生成新 projectId，完整重映射所有引用，记录 `restoredFrom`。
- “覆盖当前项目”只对从未协作的本地项目提供。流程是：显式选择 → 二次确认 → 自动做覆盖前快照（快照失败就中止）→ 写入（D5）。
- “从未协作”的判定（D6）：本地没有协作绑定，**并且**从来没有任何出站变更记录；判定不了时按“协作过”处理。

**JYB 的两种恢复模式**
- **逐项目导入（默认）**：先预览所有项目，每个项目都作为新项目导入。
- **整库替换**（D7）：只在本地库为空，或者本地所有项目都从未协作过（按 D6 判定）时才提供；需要二次确认，并先自动做一次整库快照。

**结果与提交**
- 失败的条目和跳过的条目都要列成清单。
- 小包用单个事务；大包先暂存，最后统一提交；支持取消。

### 7.5 兼容

- 旧的 JYM/JYT（formatVersion 1、整库、不含媒体）保留只读导入路径。导入时提示“旧版整库包，不含音频，包含多个项目”，必须先预览；本机字节按 4.2-7 保留。
- 遇到不认识的新版本，拒绝写入。
- 导出和导入的容量上限要对称。
- fflate 同步压缩的上限需要实测。

## 8. 迁移与恢复策略

**N12 修正（第 1 批）**
- 版本比较统一用 Dexie 版本号，即原生版本 / 10。
- 备份时传原生版本号。
- 同时加上保留上限（只留最近一个已知良好的副本）和配额预检，因为备份会复制全部 Blob。
- 备份失败要在界面上显示出来。D2 的阻止策略在第 4 批完成之前暂不启用。

**分级（D2）**
- 每个 Dexie 版本都显式声明 `additive | rewriting`，没有声明的按 rewriting 处理。
- 分级按升级区间 `(from, to]` **整体判断**：区间里只要有一步是 rewriting，整次升级就按 rewriting 处理。
- 新增唯一索引（`&`）、修改主键、删除表（`table: null`）都算 rewriting。当前 schema 没有唯一索引，但删表已经发生过多次（`engine.ts:609,615,734,959,1280,1305-1307`）。
- **rewriting**：只有在升级前快照成功后才执行。快照失败（包括处于冷却期）时，应用停在旧版本，界面提供“导出恢复备份”和“重试”。
- **additive**：快照失败时可以继续，但要显示可见的警告。

**恢复导出路径（第 4 批）**
- 阻止升级时，**不能调用 `getDb()`**，因为它会打开数据库并执行升级（`io.ts:49` → `engine.ts:1615-1640`）。
- 新增一条只读导出路径：用原生 IndexedDB、不指定版本打开现有库，按 store 读出，生成含字节的 ZIP。读取逻辑复用 `preMigrationBackup.ts:69-129`。
- 这份导出不需要能被当前版本直接打开；导入时走 JYB 逐项目流程，必要时先经过对应版本的升级器。

**其他**
- 恢复时要重建 Dexie 定义的索引和主键（现在没有重建，`preMigrationBackup.ts:350-372`）。
- 数据版本高于代码版本时，提示用户更新应用，不尝试降级写入。
- 恢复快照按当前项目读取。超过上限时，清掉旧快照或标为过期，并在界面上显示。
- 已发布的 upgrader 冻结，upgrade 函数里不调用 WebCrypto 或 fetch。
- 前提：先修改 ADR-0008 的“绿场”假设。

## 9. 协作删除安全

在第 3 批之前单独成批（第 2C 批）。

- **两种删除**：
  - “仅从本机移除”：删除本地数据和队列，云端项目保持不变；以后再次水合时，需要用户确认才重新拉取。
  - “删除云端项目”：只有 owner 可以执行。云端标记 `archived_at` 或删除，然后写项目墓碑。
- **持久化、可重试的清理任务**：删除时写一条清理任务记录，覆盖主库、项目记忆库和 localStorage/IDB 镜像中的队列。启动时如果发现未完成的任务，就继续执行，直到完成，并显示状态。
- **项目级墓碑**：`{projectId, deletedAt, deletedBy, clientId, scope: local|cloud}`，长期保留。apply 层采用 delete-wins，丢弃迟到的写入并记录日志。
- **服务端拒绝**：在 RLS 或触发器里，拒绝对已归档或已删除项目的 `project_changes` 和 snapshot 写入。
- **待发操作**：标为 `cancelled_by_delete`，并在界面上显示。
- **clientId**：每个安装实例生成一次，存进库里；不随项目包或 JYB 复制。导入为新项目时，不继承任何协作身份。
- **协作 restore**：遵守 4.2-7；并且把 prune 和写入放进同一个事务，或者先暂存再提交（现在是两个独立的事务，`projectScopedSnapshot.ts:409-410`）。

## 10. 实施批次

工作量都是粗估，没有测量依据，不作为承诺。

| 批次 | 覆盖问题 | 改动范围 | 验收（第 11 节编号） | 回滚条件 | 粗估 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| **0 决策（已决定）** | D1–D8 | 把决定写成 ADR：归档格式、迁移、导入与恢复、ADR-0044 第 2 条修订 | ADR 合入 | — | 0.5–1 天 | 无 |
| **1 紧急止损** | N2、N3、N4、N12 | 按 4.2-7 修正 `io.ts` 的入站字节语义（覆盖 media 和 lexeme_assets，upsert、replace-all 和协作 prune 前都先读出字节）；JYT 导出保留省略标记；工作台入口不再接受 .jym/.jyt；`importAudio` 只合并 `placeholder`；修正 N12 的版本单位，并加保留上限、配额预检、可见失败提示 | T7、T8a–f、T9、T10、T30、T31 | 不改 schema。代码可以回退，但**回退会让 N2/N4 的丢数据问题重新出现**，所以只有修复本身造成新的数据错误时才回退；N12 的修正可以单独关闭 | 2–4 天 | 无 |
| **2 数据完整性** | F1–F3、N5、N6（本地部分）、N9、N10、N11、N1 中“删除在事务外”的问题 | 来源 UUID 加 legacyId；事务原语；替换 18 处写法；导入提交合并；覆盖预览；删除录音保留原名；**一次性可审计的目录认领**（无引用行进入“待归属”，D8），新增“待归属”视图和分配操作，并修订 ADR-0044；schema 只做加法 | T1–T6、T11、T12、T22、T32、T42 | 新字段可以忽略，legacyId 一直保留，所以前端回退后数据仍然可读。认领**不可逆**，回退时只能保留认领结果，可以用审计记录人工复查 | 4–7 天 | 第 1 批 |
| **2C 协作删除安全** | N6 中跨库和队列的部分、N7 | 第 9 节全部内容；RLS/触发器迁移；稳定的 clientId；按 D6 提供“是否协作过”的判定函数，供第 3 批复用 | T21、T33、T34、T35、T41 | 本地清理任务可以关闭；服务端规则需要通过新的 SQL 迁移来撤销 | 4–7 天 | 第 1 批；可以与第 2 批并行 |
| **3 前置** | D4 | 按 4.2-9 冻结 AnnotationDocument 的最小契约，写进 manifest 和 ADR | 契约评审通过 | 纯文档 | 0.5–1 天 | 第 2 批 |
| **3 可携带** | F4、F7、N8 的范围部分 | JYM/JYT/JYB 与文件条目式 manifest；依赖范围取完整项目目录；媒体打包；恢复成新项目；覆盖确认路径（按 D6 判定）；JYB 两种恢复模式（整库替换按 D7）；旧包只读路径；从其他项目导入目录；文案统一；容量实测 | T13–T16、T23–T26、T29、T36、T37、T38 | 新格式有自己的版本号，旧包路径保留；已经导出的新包在回退后**不能读取**，所以回退前要提示用户 | 2–4 周 | 第 0 批、第 2 批、3 前置 |
| **4 耐久性** | F6、N8、迁移安全、persist、诊断 | persist 时机；诊断面板；按项目读取恢复快照；不经过 getDb 的原生 IDB 恢复导出；版本区间分级与阻止策略；唯一索引和删表规则；恢复时重建索引；FSA 备份文件夹或下载提醒 | T17–T20、T27、T39、T40 | 各项都可以单独关闭；只有阻止策略关闭后会回到“警告后继续” | 1.5–2.5 周 | 第 1 批（N12）、D2；任何 rewriting 迁移发布之前必须完成 |
| **5 模型演进** | F5、N1 的多文稿部分、资料组、访问级别 | 多文稿界面与“作为新文档导入”；MaterialGroup；文件角色；访问级别继承 | T28；其余用例等真实场景出现后再定 | 用默认关闭的 flag 隔离 | 不估 | D4、第 3 批 |
| **文档（随各批进行）** | F8、ARCH-5 | 代码地图；`migration-safety-ARCH-5.md:27`；“全量备份”文案（第 1 批先改为如实描述，第 3 批改指 JYB）；ADR-0008、ADR-0044 | `check:docs-governance` 等 | 文档回退 | 0.5–1 天 | 第 1 批之后 |

**依赖关系**
- 0 → 2（ADR-0044 修订）、3、4、5。
- 1 → 2 → 3 前置 → 3。
- 1 → 2C，2C 可以与第 2 批并行，但必须在第 3 批之前完成。
- 1 → 4。
- 任何 rewriting 迁移发布之前，第 4 批的阻止策略和恢复导出必须已经完成。

**流程要求**
- 每批实施前建立 SDD 三件套。
- 涉及 schema、协议或不可逆的决定时，同步写 ADR。

### 10.1 第 0 批决定记录

**日期**：2026-10-08。**决定人**：用户（Bai Junwei），在对话中给出。原话逐字引用如下：

> 1. JYM同意，JYT是导出不含媒体，如eaf这种，JYB是整库备份 2. 同意 3. 同意 4. 同意 5. 同意

| 编号 | 议题 | 决定 | 影响的批次与验收 |
| --- | --- | --- | --- |
| D1 | JYM/JYT/JYB 的契约 | JYM：单项目可编辑包，默认含受管媒体，不含时在 manifest 里写明。JYT：单项目、不含媒体的轻量标注/数据包（类似 EAF），标明“不含音频”；旧版整库 .jyt/.jym 继续可读，读取时给出提示和预览。JYB：新的整库备份格式，取代“全量备份”，必须写明是否含音频 | 第 1、3 批；T16、T23–T25、T29、T37 |
| D2 | 迁移前快照失败 | 改写或删除数据的迁移：阻止，停在旧版本，并提供导出。只加表或索引的迁移：可以继续，但要给出可见的警告 | 第 1（N12）、4 批；T18、T27、T39、T40 |
| D3 | 目录归属 | 维持 ADR-0044 的项目所有制；跨项目复用通过复制实现；共享目录等出现真实需求时再议 | 第 2、3 批；T26、T32、T36 |
| D4 | 再次导入的语义 | 最终支持一个项目有多份标注文档。第 2 批只修事务并加覆盖预览；多文稿放到第 5 批 | 第 2 批、3 前置、第 5 批；T22、T28 |
| D5 | 恢复的默认行为 | 默认恢复为新项目。从未协作的本地项目可以显式选择覆盖，需二次确认并自动做覆盖前快照。协作过的项目不提供覆盖选项 | 第 3 批；T13、T25、T37 |

**细则确认（D6–D8）**：2026-10-08 19:19，用户对修订三提出的三条细则回复：

> 可以

| 编号 | 议题 | 决定 | 影响的批次与验收 |
| --- | --- | --- | --- |
| D6 | “从未协作”的判定 | 本地没有协作绑定，**并且**从来没有任何出站变更记录，才算从未协作；判定不了时按“协作过”处理 | 第 2C、3 批；T25、T37、T41 |
| D7 | JYB 整库替换模式的前提 | 只在本地库为空，或者本地所有项目都从未协作过（按 D6）时提供；仍需二次确认并先做整库快照 | 第 3 批；T37 |
| D8 | 一次性目录认领中无引用的无主行 | 进入“待归属”状态，不自动归属；由用户分配，并记审计日志 | 第 2 批；T32、T42 |

## 11. 验收清单

“单元”指 Vitest 加 fake-indexeddb；“E2E”指 Playwright（Chromium 必跑，持久化相关的用例再加跑 WebKit 和 Firefox）。

| # | 场景 | 断言 | 层级 | 成功标准 | 批次 |
| --- | --- | --- | --- | --- | --- |
| T1 | 依次导入 `Story.eaf` 和 `story.eaf` | 生成两条来源，ID 不同，显示名自动区分 | 单元 + E2E | S1 | 2 |
| T2 | 同一个 EAF（URN 相同）改名后再导入 | 匹配为“更新已有文档”并给出预览；displayName 不被改回 | 单元 | S1 S2 | 2 |
| T3 | 两段同名录音，加一份只带文件名的文稿 | 不自动关联；手动选择后，刷新仍指向同一个 ID | 单元 + E2E | S2 | 2 |
| T4 | mediaId 不存在，或者属于其他项目 | 拒绝，或标为未关联 | 单元 | S2 | 2 |
| T5 | 并发登记两份来源，同时编辑元数据 | 三处改动都在 | 单元 | S5 | 2 |
| T6 | 元数据写入时校验失败 | 项目行仍然存在 | 单元 | S5 | 2 |
| T7 | 本机有音频时应用恢复快照 | `audioBlob` 保留 | 单元 + E2E | S3 | 1 |
| T8a | upsert 导入带 `audioExportOmitted` 的 JSON/旧 JYM | 本机 `audioBlob` 保留 | 单元 | S3 | 1 |
| T8b | upsert 导入旧 JYT（没有标记） | 本机 `audioBlob` 保留 | 单元 | S3 | 1 |
| T8c | replace-all 导入上述两种包 | 同一 id 的本机字节保留，或者预览里写明会丢失的数量 | 单元 | S3 S5 | 1 |
| T8d | skip-existing 导入 | 已有行不变，字节保留（回归用例） | 单元 | S3 | 1 |
| T8e | 词典附件带 `blobExportOmitted`，分别走 upsert、replace-all、协作 restore | `lexeme_assets.blob` 保留 | 单元 | S3 | 1 |
| T8f | 协作 restore（先 prune 再写）时本机有音频 | 字节保留 | 单元 | S3 | 1 |
| T9 | 在工作台“导入标注”里选一个 .jym | 不发生整库替换 | E2E | S3 S5 | 1 |
| T10 | 两条没有字节的声学录音，导入其中一条的音频 | 另一条录音和它的句段都不变 | 单元 | S3 | 1 |
| T11 | 删除录音后重载 | 文本、时间码、来源关系都在；状态为 `acoustic + none + missing`；原名保留 | 单元 + E2E | S3 S2 | 2 |
| T12 | 删除项目（本地部分） | 主库重查没有残留；内置种子保留 | 单元 | S6 | 2 |
| T13 | 导出项目 A → 空库 → 恢复 | 没有项目 B 的数据；文本、层、目录、媒体 sha256 都正确；生成了新 projectId | 单元 + E2E | S4 | 3 |
| T14 | 包内哈希损坏、路径穿越、重复条目，或超过上限 | 拒绝导入，不写入任何数据，并列出清单 | 单元 | S4 S5 | 3 |
| T15 | 导出体积超过导入上限 | 导出前就给出提示 | 单元 | S5 | 3 |
| T16 | 导入旧 formatVersion 1 的 .jym | 走只读路径，必须先预览，本机字节保留 | 单元 | S4 S5 | 3 |
| T17 | 恢复快照超过 8 MiB | 界面显示“已跳过”，旧快照被清掉或标为过期 | 单元 | S5 | 4 |
| T18 | 快照失败时遇到 rewriting 迁移 | 升级被阻止，停在旧版本，提示导出 | 单元 + 隔离浏览器 | S5 | 4 |
| T19 | 迁移失败后用备份恢复 | 索引和主键与 Dexie 定义一致；已知良好的副本仍在 | 单元 | S5 | 4 |
| T20 | 第一次导入时请求 persist；配额不足 | 记录并显示结果；遇到 QuotaExceededError 时只提示，不删原件 | E2E | S5 | 4 |
| T21 | 有待发操作时删除项目；另一个客户端离线编辑后重新上线 | 待发操作被取消；项目不复活 | 单元（mock）+ 真实 Supabase | S6 | 2C |
| T22 | 再次导入 EAF | 先显示覆盖预览；取消后数据不变；中途失败时原内容完整 | 单元 + E2E | S1 S5 | 2 |
| T23 | 导出 JYT → 空库导入 | 包里没有媒体字节，manifest 为 `media: excluded`，媒体行带省略标记；标注和完整目录都在；媒体为缺音状态，Relink 之后时间码不变 | 单元 + E2E | S3 S4 | 3 |
| T24 | 导出 JYB（含音频和不含音频各一次）→ 空库 → 用逐项目模式恢复 | 所有项目完整；含音频版本的 sha256 一致；不含音频版本有明确提示；各项目之间没有串数据 | 单元 + E2E | S4 S5 | 3 |
| T25 | 恢复 JYM 时选择覆盖：(a) 从未协作的项目 (b) 协作过的项目 | (a) 需要二次确认，先生成覆盖前快照，快照失败则中止；(b) 不出现覆盖选项 | 单元 + E2E | S5 S6 | 3 |
| T26 | 从项目 B 导入说话人或词条到项目 A | A 得到新 ID 的副本，B 不变 | 单元 | S4 S6 | 3 |
| T27 | 快照失败时遇到 additive 迁移；另有一个没有声明类型的迁移 | 前者继续执行并显示警告；后者被阻止 | 单元 + 隔离浏览器 | S5 | 4 |
| T28 | 同一项目导入两份 EAF，第二份选择“作为新标注文档” | 两份文档并存，删除其中一份不影响另一份 | 单元 + E2E | S1 S2 | 5 |
| T29 | 导入旧版整库 .jyt | 给出提示和预览，不静默替换，本机字节保留 | 单元 | S3 S5 | 3 |
| T30 | 导入 JYT 之后，再给其中一条录音导入音频 | 其他录音不被合并 | 单元 | S3 | 1 |
| T31 | 已有 Dexie v53 库（原生版本 530）启动 | 识别为需要迁移，生成备份，且只保留一份；备份失败时界面可见 | 单元 + 隔离浏览器 | S5 | 1 |
| T32 | 两个项目同时首次读取目录；另有一条无引用的无主行 | 认领只发生一次，结果确定；有引用的按引用归属；无引用的进入“待归属”，两个项目的列表里都看不到；审计记录可查 | 单元 | S2 S6 | 2 |
| T33 | 清理任务执行到一半时关闭页面 | 重新启动后继续执行，直到完成；状态可见 | 单元 | S5 S6 | 2C |
| T34 | 对已归档或已删除的云端项目写入变更 | 服务端拒绝；客户端标为已取消 | 真实 Supabase（隔离项目） | S6 | 2C |
| T35 | “仅从本机移除”之后重新登录 | 云端项目仍在；需要用户确认后才重新拉取；本地没有自动复活 | E2E | S6 | 2C |
| T36 | 项目里有一个未被任何单元引用的词条，导出 JYM/JYT | 词条在包里 | 单元 | S4 | 3 |
| T37 | JYB 整库替换模式：(a) 本地为空 (b) 本地全部项目从未协作 (c) 本地有一个协作过的项目 | (a)(b) 二次确认并做快照后可以执行；(c) 不提供该模式 | 单元 + E2E | S5 S6 | 3 |
| T41 | “是否协作过”判定：(a) 无绑定、无出站记录 (b) 只有历史出站记录、绑定已解除 (c) 记录无法读取 | 只有 (a) 判为从未协作；(b)(c) 都判为协作过，覆盖选项不出现 | 单元 | S6 | 2C |
| T42 | 在“待归属”视图把一条无主词条分配给项目 A | 词条只出现在 A；分配写入审计日志；未分配的行不会被任何读操作自动认领 | 单元 + E2E | S2 | 2 |
| T38 | 两个字节完全相同的媒体文件 | manifest 里有两个条目，导入后仍是两个 MediaResource；包里不含 clientId | 单元 | S1 S4 | 3 |
| T39 | 升级区间 v40→v54，中间有一步是 rewriting | 整次升级按 rewriting 处理 | 单元 | S5 | 4 |
| T40 | 升级被阻止时执行恢复导出 | 原生 IDB 版本不变，没有触发升级；导出包含字节；可以通过 JYB 逐项目模式导入 | 单元 + 隔离浏览器 | S4 S5 | 4 |

**自动验证**
- 每批都跑 typecheck 和相关领域的 Vitest。
- UI 有改动时加跑 Chromium E2E。
- 文档跑 `check:docs-governance` 和 `check:plans-frontmatter`。
- CI 上的 `check:all` 必须通过。

**性能**：先用小、中、大三档真实规模的数据测量，测出可复现的预算之前，不承诺 GB 级的支持。

## 12. 推荐决策与待冻结参数

**已决定**：D1–D8（见 10.1）。

**技术推荐**
- 来源用 UUID，保留 legacyId。
- 匹配顺序：EAF URN → sha256 → 文件名；LIFT 只做词条级匹配。
- 三种入站字节语义。
- `timelineKind` 与字节位置、可用性分开。
- Relink 与重新导入分开。
- 项目包携带完整的项目目录。
- manifest 用文件条目数组。
- 默认恢复为新项目。
- 迁移按区间分级，rewriting 迁移必须先有恢复点。
- 恢复导出不经过 getDb。
- 一次性目录认领。
- 协作删除用墓碑、服务端拒绝写入、可重试的清理任务。
- 保留 Dexie 和现有目录结构。

**待冻结**（在相应批次完成基线后确定）
- JYB 默认是否包含音频。
- JYT 能否以“新标注文档”的方式导入到已有项目（依赖第 5 批）。
- 旧版整库包恢复时，是逐项目新建，还是允许合并。
- 备份保留的份数和空间预算。
- 归档包的支持上限和兼容版本窗口。
- 资料组的规模。
- 访问级别词表。

**最终交付**
- 领域关系与所有权文档。
- ADR（归档、迁移、导入与恢复、ADR-0044 修订、协作删除）。
- 代码实现和定向回归测试。
- 隔离浏览器下的恢复证据。
- 用户能看懂的导入、导出、删除说明。

## 13. 相对原稿的主要修改

### 修订二（相对原稿）
1. 按代码更正事实：projectFileOps 没有写事务，同类写法共 18 处；persist 的结果被丢弃；恢复快照被跳过后旧快照还在；删除项目有残留。
2. 新增 N1–N11 并分级。N2、N3、N4 定为 P0，组成第 1 批紧急止损。
3. N1 改变了原稿的前提（“导入即替换”）；SharedAsset 改为 ProjectCatalog。
4. 补充有调研依据的设计；重新划分批次 0–5，逐项对应验收用例。
5. 第 0 批已决定（D1–D5），新增 T22–T29。

### 修订三（吸收外部评审，核查见[核查结论](../audits/project-file-plan-rev2-review-verdict-2026-10-08.md)）
1. **入站字节改为三种语义**：携带、明示省略、未知。覆盖媒体和词典附件（`blobExportOmitted`）。更正修订二的两处错误：“JYT 只多删一个本来就不存在的字段”（实际上 JYT 会删掉省略标记），以及“任何策略都会覆盖字节”（skip-existing 不会）。T8 拆成 T8a–f。
2. **缺失与占位分开**：沿用 `timelineKind`，另加 `byteLocation` 和 `availability`；`importAudio` 只合并 `placeholder`；新增 T30。
3. **新发现 N12**：版本单位比较错误，导致升级前备份从来没有运行过。修正放进第 1 批，同时加保留上限和配额预检；新增 T31。
4. **迁移安全**：恢复导出走原生 IDB，不经过 getDb，避免“阻止升级—导出又触发升级”的死循环。按升级区间整体分级；唯一索引、主键变更、删表都算 rewriting。新增 T39、T40。
5. **目录认领**：从读路径上的隐式认领，改为一次性、可审计、在事务里执行的认领任务，并修订 ADR-0044 第 2 条；新增 T32。
6. **项目包携带完整的项目目录**，而不是只带被引用的行。更正修订二“现有过滤器会漏掉名单说话人”的说法。JYB 增加两种恢复模式；新增 T36、T37。
7. **新增第 2C 批“协作删除安全”**，排在第 3 批之前：持久化、可重试的清理任务；项目级墓碑；服务端拒绝写入；区分本机移除和云端删除；clientId 不随包复制。新增 T33–T35。
8. **第 3 批前先冻结 AnnotationDocument 最小契约**；manifest 改为 `files[]` 条目数组；LIFT guid 改为只做词条级匹配；新增 T38。
9. **细则 D6–D8 已确认（2026-10-08 19:19）**：“从未协作”的判定、JYB 整库替换前提、无引用无主行进入“待归属”；相应调整第 2、2C、3 批，新增 T41、T42，修改 T32、T37。
10. **措辞与证据**：Safari 风险的措辞收窄并注明来源；回滚改为写明前提条件；工作量统一标注为粗估；决定记录逐字引用用户原话。
