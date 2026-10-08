---
title: 项目、资料与持久化架构完整改进方案（修订二）
doc_type: execution-plan
status: proposed
owner: repo
last_reviewed: 2026-10-08
---

# 项目、资料与持久化架构改进方案（修订二）

> 第 0 批已决定（2026-10-08，用户拍板），决定记录见 10.1；后续批次已按决定调整。其余部分仍为待实施方案。

## 1. 目标与状态

解语是本地优先的田野语言资料研究工作台，要长期保存录音、说明标注来源、可靠协作，并与外部工具交换资料。本方案把项目组织、文件身份、领域写入、持久化、归档和代码治理当作同一条数据生命周期处理。

本文件为待实施方案，依据三份材料：[审查草稿](../audits/project-file-architecture-review-2026-10-08.md)（F1–F8）、2026-10-08 对 `origin/main@85ff9f82` 的代码调查，以及同类产品调研。没有修改生产数据库。当前代码事实和目标设计分开写。标“已复现”的问题是在 fake-indexeddb 单元环境下复现的，**不等于真实浏览器已经发生数据损坏**。每批实施都要记录验证证据，不能用任务勾选或文档检查代替真实数据验收。

成功标准：
- S1 同名资料不会误覆盖。
- S2 关联在改名和重载后保持稳定。
- S3 删除录音后时间轴保留；恢复或导入不会抹掉本机已有音频。
- S4 一个项目能带着必要依赖导出，并在空库中完整恢复。
- S5 失败或跳过不会误报为成功。
- S6 删除的项目不会被离线操作或同步复活。
- S7 代码边界能支撑以上行为。

范围外：更换 Dexie、微服务、monorepo、全仓目录搬迁、引入 CRDT、通用文件管理器、一次性做成完整档案馆平台。

## 2. 已确认现状与问题

### 2.1 原稿事实复核

| 原稿所述事实 | 复核结论（代码位置） | 主要缺口 |
| --- | --- | --- |
| 项目用 texts/textId 表示，录音在 media_items | 成立（`db/types.ts:76-97`）；媒体没有原名、哈希、大小字段，字节放在 `details.audioBlob` | 概念边界需要明确 |
| 来源存在 metadata.sourceFiles，内容在 layer_units/contents | 成立；`sourceFiles` 不在 `PROJECT_TEXT_METADATA_KEYS` 里（`types/projectTextMetadata.ts:6-20`），没有类型约束 | 来源和内容之间没有作用域关系（F5） |
| 来源 ID 由格式和小写文件名组成 | 成立（`utils/projectSourceFiles.ts:83-85`），已复现：`Story.eaf` 和 `story.eaf` 合并成一条；改名后再导入原文件，名字被改回去 | 同名不同内容被覆盖（F1） |
| 可以按文件名回退关联录音 | 成立（`projectSourceFiles.ts:121-140`），已复现：同名录音时**后一条胜出**；显式 mediaId 不校验是否存在 | 歧义被静默处理（F2） |
| 来源登记和改名读出项目后整行 put | 成立，已复现并发丢更新。**更正：`projectFileOps.ts` 的写操作没有任何事务**，唯一的事务是只读计数（`:59-65`）。同类写法共 18 处：10 处整行 put，8 处“先 remove 再 insert”（如 `speakerProjectMembership.ts:45-46`、`linguisticServiceTextTimelineOps.ts:104-105`） | 需要**新建**项目元数据的事务原语（F3） |
| JYM/JYT 调用整库 JSON 导出，没有 textId，不打包媒体 | 成立，已复现（`services/JymService.ts:466-497`）：包里只有 mimetype、manifest、snapshot。**补充：JYM 与 JYT 实际等价**，JYT 只多删一个本来就不存在的 `audioDataUrl`（`:446-472`）；界面文案把它们称为“全量备份”（`zh-CN.ts:3035`） | 产品契约不成立，命名误导（F4） |
| JSON 省略媒体/词典附件 Blob；快照只接受当前版本 | 成立（`db/io.ts:27-28,59-79,472-476`；JYM 只接受 `formatVersion=1`，`JymService.ts:513`）；导出没有限额，导入限额是 32 MiB JSON / 80 MB 包（`io.ts:29`、`JymService.ts:115-122`） | 可能导出读不回来的包；没有长期兼容承诺 |
| 恢复快照先整库导出再筛选，超过 8 MiB 跳过 | 成立（`io.ts:108-128`、`SnapshotService.ts:164-170`），跳过时只打 debug 日志；**旧快照会留下**，并且覆盖所有项目 | 状态不可见，恢复点可能已过期（F6/F7） |
| 迁移前备份失败后仍继续升级 | 成立（`db/engine.ts:1627-1633`）；冷却期内返回 `skipped`，连警告都没有（`preMigrationBackup.ts:166`）；备份含全部 Blob，没有保留上限；恢复时不重建索引（`:354-370`） | 需要按风险分级（F6） |
| 启动时请求 persist | 成立，**但结果被丢弃**（`main.tsx:45`）；全仓没有 `storage.estimate()` | 违背“伴随用户手势、在保存时请求”的建议 |
| 多个存储库已有不同程度的清理 | 成立：声学缓存、行为库、语音会话有上限；迁移前备份库没有 | 缺少统一清单 |
| 架构地图同页 v34/v53/v54 矛盾 | 成立（`仓库现状与代码地图.md:321,322,329,531,686,688`）；另外 `migration-safety-ARCH-5.md:27` 说“不做自动备份”，与代码不符 | 文档不能作为事实依据（F8） |

### 2.2 原稿未涉及的问题

严重度：P0 = 正常操作就可能造成用户数据丢失；P1 = 数据完整性或一致性；P2 = 可靠性与可见性；P3 = 体验或文档。

| ID | 严重度 | 当前事实 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| N1 | P1（契约） | 导入任何标注文件，都会先删光**整个项目**的单元图，而且删除在提交事务之外；`sourceFiles` 却保留历史条目，“多文稿”是假象 | `useImportExport.importHandlers.ts:303-317,756`；现有测试明确断言这种替换行为（`useImportExport.import.test.tsx:1922-1975`） | 代码与测试确认 |
| N2 | P0 | 应用恢复快照、导入 JYM/JYT 或 JSON（任何策略）、协作 restore，都会用不含 `audioBlob` 的行整条覆盖本机 `media_items`，本机音频丢失 | `io.ts:59-70,655-660`；`useTranscriptionRecoveryActions.ts:83`；`projectScopedSnapshot.ts:324,410` | 已复现 |
| N3 | P0 | 工作台“导入标注”接受 .jym/.jyt，并且**不预览就用 replace-all 替换整个数据库**（所有项目），叠加 N2 后音频全部丢失 | `WorkbenchFilePane.tsx:207-214` → `importHandlers.ts:136-147` → `io.ts:644-646` | 代码确认 |
| N4 | P0（叠加 N2） | 没有字节的媒体行会被 `importAudio` 当作占位：导入一个文件时，其他录音的句段被并到同一条媒体上，其他媒体行被删除；`add` 模式也会这样 | `linguisticServiceMediaImport.ts:40-56,126-176` | 已复现（m1/m2 只剩 m1） |
| N5 | P1 | 8 处元数据写入用“先 remove 再 insert”且没有事务；`insert` 先校验（`adapter.ts:94-99`），校验失败或中途中断时项目行已被删除 | 见 2.1 F3 行 | 静态推断 |
| N6 | P1 | 删除项目后残留 `layer_links`、`project_ai_memories`、`user_notes(text)`、`ai_session_memories`、协作待发变更、`jieyu-project-memory` | `LinguisticService.cleanup.ts:111-221`、`dexieTranscriptionGraphStores.ts:187-230` | 前三项已复现 |
| N7 | P1 | 协作 clientId 每次挂载时重新生成；协议没有项目级墓碑；删除项目不取消待发队列 | `useTranscriptionCollaborationBridge.ts:122-127,160`；`syncTypes.ts:13-35`；`CollaborationOutboundQueue.ts`（删除路径不触达） | 代码确认 |
| N8 | P2 | 恢复快照超过上限时静默跳过，旧快照仍可能被当作恢复点；应用恢复时 upsert 所有项目的核心图 | `SnapshotService.ts:164-178`、`useTranscriptionRecoveryActions.ts:41-83` | 代码确认 |
| N9 | P2 | 删除录音会把 filename 改成占位名；文件列表隐藏占位行，关联文稿变成孤立卡片 | `cleanup.ts:289`、`projectFileOps.ts:32` | 代码确认 |
| N10 | P2 | 目录（词条、说话人、正字法等）已按 ADR-0044 归项目所有；没有归属的旧记录会被**第一个读取它的项目**认领，过程不在事务里、要扫全表 | `services/projectCatalogScope.ts:11-48` | 代码确认 |
| N11 | P3 | 合成文稿 id 在两处分别构造；合成文稿改名会生成 `src-file-<名>`，可能和已有来源撞 id | `projectFileOps.ts:70`、`ProjectFileBrowser.tsx:416,441-447` | 代码确认 |

## 3. 成熟方案依据与取舍

| 来源 | 借鉴内容 | 采用边界 |
| --- | --- | --- |
| [ELAR/lameta](https://blogs.soas.ac.uk/elar/2020/04/30/introducing-lameta/)、[SayMore](https://software.sil.org/saymore/features/)、[EXMARaLDA](https://www.exmaralda.org/pdf/Understanding_the_basics_of_exmaralda_EN.pdf)、[PARADISEC](https://www.paradisec.org.au/deposit/catalog-structure/) | 资料组等于一次采录事件；人物独立建档、跨组复用 | 资料组可选；**不采用**它们“文件名即身份”的做法（lameta 改名级联 bug LAM-112） |
| [ELAN EAF 3.0](https://www.mpi.nl/tools/elan/EAF_Annotation_Format_3.0_and_ELAN.pdf)、[LIFT 技术说明](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf) | EAF 头部的 URN（UUID）、LIFT 的 guid 是外部稳定 ID；EAF 用 `EXTRACTED_FROM` 记派生 | 重新导入时优先按外部 ID 匹配；导出时保留或写入 URN |
| [Lightroom 缺失照片](https://www.lightroomqueen.com/lightroom-photos-missing-fix/)、[ELAN 关联文件](https://www.mpi.nl/tools/elan/docs/manual/Sec_Changing_the_links_to_media_files.html)、[Zotero 附件](https://www.zotero.org/support/attaching_files) | 用 Relink 修复缺失，保持同一记录；受管文件与外链文件分开 | 分开“修复缺失”和“导入新文件”两个入口 |
| [FLEx 恢复](https://downloads.languagetechnology.org/fieldworks/Documentation/en/User_Interface/Menus/File/Backup_and_Restore/Restore_a_project.htm)、[Logseq 导出](https://github.com/logseq/docs/blob/master/db-version.md) | 协作过的项目只能恢复成新项目；每种出口注明保真度；定期轮换备份到用户选的文件夹 | 恢复默认生成新项目；出口诚实标注 |
| [OCFL 1.1](https://ocfl.io/1.1/spec/)、[BagIt](https://datatracker.ietf.org/doc/html/rfc8493)、[LDaC RO-Crate](https://github.com/Language-Research-Technology/ldac-profile/blob/master/profile/profile.md) | 用 ID 作内容路径、逻辑名只作元数据、sha256 清单、路径安全规则；文件角色分原始/派生/标注 | 采纳 manifest 原则；没有做合规验证就不声称兼容 OCFL/RO-Crate |
| [Zotero 数据目录](https://www.zotero.org/support/zotero_data)、[audacity-project-tools](https://github.com/audacity/audacity-project-tools)、[ELAN 备份](https://www.mpi.nl/tools/elan/docs/manual/Sec_Creating_automatic_backups.html) | 升级前留副本；恢复工具只写副本；保护最近一个已知良好的副本 | 破坏性迁移必须先有恢复点 |
| [Joplin BaseItem](https://github.com/laurent22/joplin/blob/dev/packages/lib/models/BaseItem.ts)、[Lexbox #2367](https://github.com/sillsdev/languageforge-lexbox/pull/2367)、[Harmony](https://github.com/sillsdev/harmony) | 墓碑过早清理会导致复活；冲突时删除优先（delete-wins）；每台设备一个稳定 ClientId | 墓碑长期保留；删除项目时取消待发操作 |
| [web.dev 持久存储](https://web.dev/articles/persistent-storage)、[WebKit 存储策略](https://webkit.org/blog/14403/updates-to-storage-policy/)、[WebKit ITP](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)、[MDN 配额](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)、[FSA 持久权限](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api) | 只在保存关键数据时伴随手势请求 persist；Safari 7 天无交互会清除存储；分库不能隔离配额；Chromium 可以持久授权一个备份文件夹 | 站点外备份是第一道防线 |
| [Dexie 设计说明](https://dexie.org/docs/Tutorial/Design) | 事务里等待非 IDB 的异步调用会提前自动提交；已发布的 upgrader 必须冻结 | 先在事务外算哈希，再进事务写入 |

结论：沿用成熟的数据语义，复用 Dexie、fflate 和已有领域模块；第 1、2 批不新增依赖。是否需要流式归档库，等第 3 批实测后另行比较（维护状况、体积、许可、浏览器兼容、取消与错误恢复）。同步压缩只能在**测量过的**体量内使用。

## 4. 目标领域模型

### 4.1 概念与关系

| 对象 | 身份与责任 | 推荐关系 | 和现状的差距 |
| --- | --- | --- | --- |
| Project 项目 | 研究范围、元信息、默认访问级别；沿用 textId | 拥有资料组、项目目录和项目独占数据 | — |
| MaterialGroup 资料组 | 一次采录事件（源录音、派生媒体、全部标注） | 包含零到多份媒体和标注文档；允许纯文字 | 不存在；放到第 5 批，并且以真实场景为前提 |
| MediaResource 媒体 | 独立 ID；原名、显示名、格式、大小、sha256、时长/采样信息；状态 `available / missing / placeholder / external`；角色 `primary / derived` | 派生关系用 `derivedFrom`；占位行可以作为时间轴宿主 | 只有 filename 和 details；状态靠启发式推断，而且推断不一致（N4） |
| AnnotationDocument 标注文档 | 独立 ID、语言/层范围、关联时间轴和来源；角色 `annotation` | 内容仍放在现有单元图里，不复制正文 | **现在每个项目只能有一份内容**（N1）；已决定最终支持一个项目多份标注文档（D4），第 5 批引入 |
| SourceRecord 导入来源 | UUID 主键加 `legacyId`；`originalName`、`displayName`、`format`、`byteSize`、`sha256`、`externalDocId`、`importedAt`、`importBatchId`、`storedBytes: managed / none` | 由导入活动把来源、文档和产出的层/单元连起来 | 现在只有 id/name/format/mediaId?/linkedMediaFilename? |
| ProjectCatalog 项目目录（原稿 SharedAsset） | 说话人、词条、正字法、语言记录、标签等，**按 ADR-0044 归项目所有**；内置语言代码和正字法种子是只读模板 | 通过稳定 ID 引用；项目包按依赖闭包携带；跨项目复用靠“导出时复制”或“从其他项目导入”（复制并重映射 ID） | 已决定维持 ADR-0044（D3）；原稿“共享对象保留”作废；共享目录只在出现真实需求后另立 ADR |

这是逻辑模型，不要求新建六张表。资料组和标注文档要等独立查询、作用域和生命周期的验收定下来后才落表；texts 暂不改名；用户看到的文案可以和内部类型名不同。

### 4.2 身份、匹配与写入规则

1. **来源身份**：新来源用随机 UUID；旧的 `src-${format}-${name}` 保留为 `legacyId`，保证旧引用可读。`name` 的读取兼容保留，新写入改用 `originalName/displayName`。
2. **重新导入时按顺序匹配**：
   - 外部文档 ID（EAF 的 `PROPERTY[@NAME="URN"]`、LIFT 的 guid）相同：提示“更新已有文档”，并预览影响范围。
   - sha256 相同：提示“内容完全相同（可能是重复）”。
   - **只有文件名相同：一律当作新来源**，显示名自动加序号区分，例如 `story.eaf (2)`。
   - FlexText 是否带 guid 尚未核实。
3. **哈希在 Dexie 事务之外先算好**（WebCrypto 会让事务提前提交），再在事务里登记，最后读回校验。
4. **关联媒体**：mediaId 必须校验存在并且属于本项目；占位媒体是合法宿主。只有文件名时，唯一候选才提示匹配，多个候选进入“未关联”状态，不允许静默选一个。
5. **写入边界**：新增 `patchProjectMetadata(textId, fn)` 这类事务原语（`rw` 覆盖 `texts` 以及该操作涉及的表），替换 2.1 F3 行列出的 18 处写法；禁止对 texts 先 remove 再 insert。项目不存在时返回明确结果。
6. **导入主体和来源登记放在同一个提交里**：现有提交事务已经包含 texts（`dexieTranscriptionGraphStores.ts:37-59`），来源登记可以挪进去；N1 里清理旧单元的那一步也要并入，或者改成可恢复的暂存。
7. **修复缺失（Relink）和重新导入分开**：Relink 保持 MediaResource ID，按 sha256 → 时长加名称校验；哈希不同但时长一致时，让用户选“作为派生”或“替换”。不能用重新导入来修复缺失。
8. 无法恢复的历史来源标记为 `unknown`，不编造原件或出处。

### 4.3 元信息与访问

项目：标题、研究说明、语言与工作语言、负责人/贡献者、默认访问级别。资料组：采录时间、地点（精确值，另设公开精度）、体裁、参与者及当次角色（当时年龄、角色记在组上，不记在人物上）、说明。媒体、标注文档：见 4.1。

访问级别分三层，项目 → 资料组 → 文件，下层可以继承或覆盖。候选词表为 `open / registered / restricted / community-protocol`，加 `embargoUntil`；需要时再加 `protocols[]`，共享规则 `all|any` 默认 all。现有 `accessRights` 三值字段（`types.ts:82,95`）作为过渡。必填项只有稳定 ID 和有效归属；真实业务字段进入 typed schema 和校验。同意书、敏感身份和公开描述分开保存、分开导出，不把“可归档”当成“可公开”。

## 5. 操作与界面契约

| 操作 | 当前行为（代码事实） | 目标行为 |
| --- | --- | --- |
| 首次导入 | 主体在一个事务里提交，来源登记在事务外（`importHandlers.ts:756,1311`） | 内容和来源在同一提交里；声明成功范围，保留失败恢复信息 |
| 再次导入 | 替换整个项目的单元图（N1）；同名来源被合并（F1） | 第 2 批：按 4.2-2 匹配，替换前必须显示覆盖预览（受影响的层/单元数量），清理与写入同一提交；第 5 批：可选择“作为新的标注文档加入”（D4） |
| 改名 | 只改显示名，id 不变；再导入原文件会把名字改回去 | 只改 displayName，原名和 ID 不变，重新导入不影响显示名 |
| 挂接/替换媒体 | 只能用 `importAudio(replace)`，不检查时长或时间轴是否兼容 | Relink 保持身份，或明确创建派生资源；时长不一致要预览，不自动缩放标注 |
| 移除关联 | 没有入口 | 不删原件和编辑内容 |
| 删除录音字节 | `deleteAudioPreserveTimeline` 保留时间轴，但原文件名被覆盖，文件列表把它隐藏了（N9） | 保留原名，状态标为 `missing`，文稿仍然挂在它下面 |
| 删除标注文档 | 没有这个实体 | 只在有明确独占范围时删除内容；共享的层/单元单独处理 |
| 删除项目 | 一个事务清理大部分表，但有残留（N6），不碰同步队列 | 清理全部独占数据（含跨库）；写项目墓碑；取消待发操作并在界面显示 |
| 导出 JYM | 整库、无媒体（F4） | 单项目可编辑包，默认含受管媒体；不含时 manifest 写 `media: excluded`，文件名或界面同时标明（D1） |
| 导出 JYT | 与 JYM 等价 | 单项目、**不含媒体**的轻量标注/数据包（类似 EAF）；界面和 manifest 标明“不含音频”（D1） |
| 导出 JYB（新） | 不存在；“全量备份”文案指向 JYM/JYT | 整库备份；界面和 manifest 明确写出是否含音频（D1） |
| 导入 .jym/.jyt | ProjectHub 有预览和策略选择；工作台入口直接整库 replace-all（N3） | 只走项目包导入流程，默认恢复成新项目；旧版整库 .jym/.jyt 识别后显示“旧版整库包”提示和预览，不静默替换（D1） |
| 覆盖当前项目 | 不存在（只有整库 replace-all） | 仅限从未协作的本地项目：显式选择 → 二次确认 → 自动生成覆盖前快照 → 写入；协作过的项目不提供此选项（D5） |
| 从其他项目导入目录 | 不存在 | 复制所选目录行到当前项目并重映射 ID，不建立跨项目引用（D3） |
| AI/批处理 | — | 记录输入来源、工具版本、输出和审核状态；采纳走现有写入门 |

保留现有左侧面板切换、折叠侧栏和工作区骨架。关联文稿继续显示在录音题名下，没有录音的文稿保持可访问。新增文案走 dictKeys/字典，颜色走语义 token。

## 6. 持久化与代码组织

### 6.1 存储分类

| 数据 | 现状 | 保存/失败策略 | 备份与清理 |
| --- | --- | --- | --- |
| 项目、内容、关系 | 主库 `jieyudb_v2` v54；部分写入没有事务 | 事务、边界校验、写后读回；失败不得报成功 | 进项目包和整库备份 |
| 原始媒体与附件 | 放在 `details.audioBlob`、`lexeme_assets.blob`；所有 JSON 出口都去掉了 | 受管 Blob；状态显式；**导入或恢复时，凡标了 `audioExportOmitted` 的行都要保留本机已有字节** | JYM 默认包含受管字节；JYT 一律不含；JYB 明示是否含；不含媒体的包标明 `media: excluded` |
| 派生数据（波形、向量、声学、读模型） | 声学缓存有上限 | 可以重建 | 默认不进项目包；只清理确认可重建的内容 |
| 协作出站队列 | 默认失败不丢弃；持久化到 localStorage，超配额时退到 IDB 镜像（`CollaborationClientStateStore.ts:141-176`） | 显示 pending/failed/cancelled | 删除项目时转成 `cancelled_by_delete` |
| 恢复/迁移快照 | 恢复快照只有 1 份且覆盖所有项目；迁移备份没有上限 | 显式 success/skipped/failed 和最近有效时间 | 按数量、空间、版本保留，保护最近一个已知良好的副本 |
| UI 偏好、会话 | localStorage/sessionStorage | 沿用 | 不进项目包 |
| 行为日志、AI 历史 | 有部分上限 | 明确保留期限，以及是否算研究证据 | 默认不随对外项目包导出 |

### 6.2 存储耐久性

1. **persist 时机**：改为在第一次导入资料、或用户点击保存/导出时伴随手势请求；记录 `persisted()` 的结果；被拒绝后不频繁重试，也不阻断启动。
2. **存储诊断**：显示 `estimate()` 的用量和配额、persist 结果、浏览器类型和风险提示（Safari 非主屏模式下 7 天无交互会被清除；Firefox 未 persist 时同站点组上限 10 GiB）。统一处理 `QuotaExceededError`：提示清理可重建的缓存或导出，**不自动删除原件**。
3. **站点外备份**：Chromium 上用 File System Access 持久权限让用户选一个备份文件夹，定期轮换写入（份数在第 4 批定）；Safari/Firefox 退回“提醒下载备份”，提醒频率按未备份的编辑量决定。提醒文案只能把真正含媒体的出口称作“完整备份”；“全量备份”文案改指 JYB，并注明是否含音频。
4. **origin 固定**：域名、端口、协议都不改；将来如果做桌面封装，要先准备“旧 origin 导出 → 新 origin 导入”的路径。

### 6.3 代码边界

UI/controller 负责交互；service 负责完整的领域操作；db 负责事务、schema、迁移和校验；worker 承担测量后确认需要移出的重计算。现状：`pages/components` 有 51 个文件直接 import db、28 个直接 import services；删除项目有两条入口（`HomePage.tsx:149-152` 与 app 层）。按领域改动逐步收拢，第一步是让 projectFileOps 和元数据写入走 app/service。目录表清单至少有 4 份需要手工同步（`cleanup.ts:185-203`、`projectScopedSnapshot.ts:27-45`、`projectCatalogScope.ts:15-31`、`io.ts:150-259`），应收成一处。不修改已发布的迁移，不为降低行数而拆文件。

## 7. 项目包、整库备份与互操作

**出口分开命名，各自写明保真度**（D1）：
- **JYM 项目包**：单项目、可编辑、能在空库中恢复，默认包含受管媒体；用户选择不含媒体时，manifest 写 `media: excluded`，界面同时标明。
- **JYT 轻量项目包**：单项目、**不含媒体**，定位类似 EAF：携带标注、层、来源记录、项目目录依赖等数据；界面、文件说明和 manifest 都写“不含音频”。导入后，媒体按 `placeholder/missing` 状态保留时间轴，通过 Relink 补回。
- **JYB 整库备份（新扩展名）**：所有项目，用于灾备，不用来分享；取代被错标的“全量备份”；界面和 manifest 必须写明是否含音频。
- **交换格式**：EAF/TextGrid/TRS/FLEx/Toolbox/LIFT，附带“未能表示的字段”报告（已有 loss report 基础）。

JYM、JYT 共用同一 manifest 结构，用 `kind: project` 和 `media: included|excluded` 区分；JYB 用 `kind: library`，`projects[]` 中每项带自己的依赖和媒体状态。

**manifest（参照 OCFL inventory）**：
- 字段：`id`（projectId，不变）、`formatVersion`、`appVersion`、`created`、`digestAlgorithm: sha256`、`manifest {sha256 → contentPath}`、`state {sha256 → logicalPath}`、`media[]`（状态、角色、`derivedFrom`）、`dependencies[]`（项目目录、词典链接目标、正字法）、`excluded[]`（含过滤规则和计数）、`restoredFrom?`。
- contentPath 用 ID，原名只作元数据。
- 路径校验：不允许 `.`、`..`、空段、首尾 `/`、前缀冲突；大小写敏感；拒绝重复条目。
- 可以用 `data/ media/ sources/ metadata/ interchange/` 作为包内目录，这些目录不要求对应运行时目录。原始导入文件没有保存时要如实标记。

**依赖闭包**：项目内容加上它引用的项目目录行（ADR-0044）。协作快照的过滤器（`projectScopedSnapshot.ts:91-208`）可以复用其中的图遍历思路，但它会漏掉没被单元引用的名单说话人和全局词条链接目标，**不能直接当作项目包的范围**。其他项目的私有内容、凭据、协作身份令牌一律排除。

**入站流程**：先校验清单、版本、路径、大小/数量上限、哈希和引用，再开始写。JYM/JYT 默认**作为新项目恢复**（新 projectId，完整重映射引用，记录 `restoredFrom`）。“覆盖当前项目”只对从未协作的本地项目提供：显式选择 → 二次确认 → 自动生成覆盖前快照（快照失败则不覆盖）→ 写入；协作过的项目没有这个选项（D5）。“从未协作”以本地是否存在协作绑定或任何出站变更记录判定，判定不确定时按“协作过”处理。JYB 恢复必须先预览各项目，默认逐项目恢复为新项目，不提供静默整库替换。逐项校验哈希；**失败项和跳过项都列清单**，不能出现半导入的项目。小包可以用单事务；大包要先暂存，再一次性最终提交；支持取消，取消后只清理本次暂存。

**兼容**：旧 JYM/JYT（formatVersion 1、整库、无媒体）保留只读导入路径，识别后明确提示“旧版整库包，不含音频，包含多个项目”，必须走预览和策略选择，不能 replace-all 静默覆盖；按 6.1 规则保留本机已有音频。新包使用新的 formatVersion；遇到未知的新版本，拒绝写入并给出升级说明。导出和导入的容量上限要对称，导出前就检查。fflate 同步压缩的可用上限要实测；超出时改为“包加外置媒体文件夹”或分卷导出。

## 8. 迁移与恢复策略

- 继续使用 `jieyudb_v2`，不再以改库名作为数据迁移手段。schema 版本在实施时基于最新版本递增，不在这里预占。
- **迁移分级（D2）**：只加表或加索引的加法迁移，快照失败时可以继续，但必须显示可见警告（说明本次没有升级前备份，并提供导出 JYB）。会改写或删除数据的迁移，**只有在升级前快照成功后才执行**；快照失败（包括冷却期）就阻止升级，应用停在旧版本，界面给出“导出 JYB 整库备份”和“重试”。每个迁移版本在代码中显式声明 `additive | rewriting`，未声明按 rewriting 处理。这需要先修改 ADR-0008 的“绿场”前提。
- 迁移代码不写快照；**保留最近一个已知良好的快照**，轮换时不覆盖它；迁移备份库要有保留上限。恢复必须重建 Dexie 定义的索引和主键，并通过回放测试。
- 数据版本高于代码版本时，提示“由新版本创建”，不尝试降级写入。
- 恢复快照按当前项目和所需集合读取，不再整库导出；超过上限时**清掉旧快照或标为过期**，并在界面显示；应用恢复时不能覆盖媒体字节。`beforeunload` 写入只作补充。
- 已发布的 upgrader 冻结；upgrade 函数里不调用 WebCrypto 或 fetch。
- 回退不能只回退前端代码：schema 已经变化时，用验证过的迁移前数据加兼容的应用版本。
- 大体量备份、空间不足、多标签页占用、强制关闭、失败恢复，都要在隔离的浏览器配置里演练。

## 9. 协作与删除

- 删除项目、标注文档、来源时写**墓碑** `{entityType, id, deletedAt, deletedBy, clientId}`，长期保留，至少保留到所有已知客户端确认，更稳妥的做法是永久保留。
- apply 层对已有墓碑的实体执行 **delete-wins**：丢弃后续写入并记日志，不崩溃，也不复活。协议里目前没有项目级删除操作，需要补上（`syncTypes.ts:24-33`）。
- 删除项目时，把这个项目的待发操作标为 `cancelled_by_delete` 并在界面显示，不静默丢弃。
- clientId 改为每个安装实例生成一次并存进库里（现在每次挂载都重新生成，见 N7）。
- 同步顺序：父对象确认存在之后才发子对象。
- 协作 restore 也要遵守 6.1 的媒体字节保留规则（现在会先 prune 再 upsert，`projectScopedSnapshot.ts:324,410`）。

## 10. 实施批次

| 批次 | 覆盖问题 | 改动范围 | 验收（见第 11 节编号） | 回滚 | 粗估 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| **0 决策（已决定）** | JYM/JYT/JYB 契约、迁移失败策略、ADR-0044 与共享资产、再次导入语义、恢复默认值 | 决定见 10.1；待办只剩把 D1–D5 落成 ADR（归档、迁移、导入/恢复），不改代码 | 三份 ADR 合入 | — | 0.5 天 | 无 |
| **1 紧急止损** | N2、N3、N4 | `db/io.ts` 导入时合并本机 Blob；`projectScopedSnapshot` 的 prune 保留字节；`WorkbenchFilePane` 的 accept 去掉 .jym/.jyt，或改走 ProjectHub 预览；`importAudio` 的占位判断改用 `resolveMediaItemTimelineKind`，`audioExportOmitted` 行不算占位 | T7、T8、T9、T10 | 单独提交，可以直接 revert；不改 schema | 1–2 天 | 不依赖第 0 批 |
| **2 数据完整性** | F1、F2、F3、N5、N6、N9、N11、N1 中“删除在事务外”那部分 | `projectSourceFiles`、`projectFileOps`、新增元数据事务原语、18 处写入点、导入提交合并、`deleteProjectCascade` 补全、删除录音保留原名；schema 只做加法（新字段可缺省，旧 id 保留） | T1–T6、T11、T12、T22 | 新字段可以忽略；旧 id 一直保留，前端回退后仍可读 | 3–5 天 | 第 1 批；按 D4 只修事务并加覆盖预览，不做多文稿 |
| **3 可携带** | F4、F7、N8 的范围部分、N10 的依赖闭包 | 按 D1：JYM（含媒体）、JYT（不含媒体）共用 manifest 与依赖闭包；新增 JYB 整库备份（含/不含音频明示）；恢复成新项目；按 D5 实现覆盖确认路径与覆盖前快照；失败/跳过清单；旧版整库 .jym/.jyt 只读路径；“全量备份”文案改指 JYB；按 D3 实现“从其他项目导入”；容量实测 | T13–T16、T23–T26、T29 | 新格式有自己的版本号；旧包路径保留 | 2–3.5 周（取决于实测） | D1、D3、D5；第 2 批 |
| **4 耐久性** | F6、N7 的存储部分、N8、persist、诊断、迁移安全 | `main.tsx` 的 persist 时机、诊断面板、`SnapshotService` 按项目读取和过期处理、`preMigrationBackup` 的保留与索引、`engine.ts` 阻止破坏性迁移、FSA 备份文件夹或下载提醒 | T17–T20、T27 | 各项都可以单独关闭（不涉及 schema） | 1–1.5 周 | D2；迁移备份失败时的导出入口用 JYB（与第 3 批协调，未就绪前先用现有 JSON 导出并如实标注不含音频）；可在第 2 批之后并行 |
| **5 模型演进** | F5、N1 的多文稿部分（D4 已确定要做）、资料组、访问级别、协作墓碑（N7 的协议部分） | AnnotationDocument 与“作为新标注文档导入”、MaterialGroup、文件角色、访问继承、墓碑与 delete-wins、稳定 clientId；共享目录不在范围内（D3） | 多文稿至少包括 T28；其余等真实场景出现后再定（至少包括 T21） | 用默认关闭的 flag 隔离；schema 变更走 ADR | 不估（多文稿已定，资料组/访问仍以真实场景为前提） | D4；第 2、3 批 |
| **文档（随批进行）** | F8、ARCH-5、注释、文案 | 代码地图第 310/321/322/329/633/686/688 行；`migration-safety-ARCH-5.md:27`；`projectTextMetadata.ts:53`；“全量备份”文案（第 1 批先改为如实说明“不含音频、整库”，第 3 批改指 JYB）；ADR-0008 绿场前提 | `check:docs-governance`、`check:current-state-freshness` | revert | 0.5 天 | 第 1 批之后马上可以做 |

依赖关系：0（已决定）→ 3、4、5；1 → 2 → 3；4 在第 2 批之后可以独立推进，破坏性迁移之前必须先完成第 4 批的迁移安全。任何单项安全修复都不以其他批次完成为前提。每批实施前建立 SDD 三件套；涉及 schema、协议或不可逆决定时同步写 ADR。高风险的新能力遵守“默认关闭 flag + 自用一周”规则；数据正确性修复不保留旧的错误分支。

### 10.1 第 0 批决定记录

日期：2026-10-08；决定人：用户（Bai Junwei）。以下为已决定事项，实施时落成 ADR，不再作为待议问题。

| 编号 | 议题 | 决定 | 影响的批次与验收 |
| --- | --- | --- | --- |
| D1 | JYM/JYT/JYB 契约 | JYM = 单项目可编辑包，默认含受管媒体，不含时 manifest 明示；JYT = 单项目、不含媒体的轻量标注/数据包（类似 EAF），明确标“不含音频”；旧版整库 .jyt（及 .jym）继续可读，带明确提示和预览；JYB = 新的整库备份扩展名，取代错标的“全量备份”，界面必须写明是否含音频 | 第 3 批；文档批；T16、T23、T24、T25 |
| D2 | 迁移前快照失败 | 改写或删除数据的迁移：快照失败就阻止，停在旧版本并提供导出；只加表/索引的迁移：可继续，但显示可见警告 | 第 4 批；T18、T27 |
| D3 | 目录归属 | 维持 ADR-0044 项目所有；跨项目复用靠导出时复制或“从其他项目导入”；共享目录只在出现真实需求时再议 | 4.1；第 3 批；T26 |
| D4 | 再次导入语义 | 最终支持一个项目多份标注文档；第 2 批只修事务并加覆盖预览，多文稿放到第 5 批 | 第 2、5 批；T22、T28 |
| D5 | 恢复默认值 | 项目包默认恢复成新项目；从未协作的本地项目可显式选择“覆盖当前项目”，需二次确认并自动生成覆盖前快照；协作过的项目不提供覆盖 | 第 3 批；T13、T25 |

## 11. 验收清单

“单元”指 Vitest 加 fake-indexeddb；“E2E”指 Playwright（Chromium 必跑；持久化敏感路径加跑 WebKit/Firefox）。真实浏览器验收用隔离的测试配置，不碰用户库。

| # | 场景 | 断言 | 层级 | 成功标准 | 批次 |
| --- | --- | --- | --- | --- | --- |
| T1 | 先后导入 `Story.eaf` 和 `story.eaf`（内容不同） | 两条来源、ID 不同，显示名自动加序号；原内容没有被无提示替换 | 单元 + E2E | S1 | 2 |
| T2 | 同一 EAF（URN 相同）改名后再导入 | 匹配为“更新已有文档”并给出预览；displayName 不被改回 | 单元 | S1 S2 | 2 |
| T3 | 两段同名录音加一份只带文件名的文稿 | 不自动关联，状态为“未关联”；手动选择后刷新仍指向同一 ID | 单元 + E2E | S2 | 2 |
| T4 | 来源指向不存在或属于其他项目的 mediaId | 拒绝或标为未关联 | 单元 | S2 | 2 |
| T5 | 并发登记两份来源，同时编辑项目元数据 | 三项改动重查都在 | 单元 | S5 | 2 |
| T6 | 元数据写入时校验失败 | 项目行仍然存在，返回明确错误 | 单元 | S5 | 2 |
| T7 | 本机有音频时应用恢复快照 | `audioBlob` 保留，句段恢复 | 单元 + E2E | S3 | 1 |
| T8 | 本机有音频时导入整库 JSON 或旧 JYM（upsert/skip/replace-all） | 字节保留，或在预览里明确提示会丢失 | 单元 | S3 S5 | 1 |
| T9 | 在工作台“导入标注”里选 .jym | 不发生整库替换；被拒绝或转入预览流程 | E2E | S3 S5 | 1 |
| T10 | 两条无字节的录音，导入其中一条的音频 | 其他录音和它们的句段不变 | 单元 | S3 | 1 |
| T11 | 删除录音后重载 | 文本、时间码、来源关系都在；状态为缺音；原名保留；重新挂接后时间码不重置 | 单元 + E2E | S3 S2 | 2 |
| T12 | 删除项目 | 当前库加跨库重查都没有残留（含 layer_links、AI 记忆、文本笔记、恢复快照、项目记忆库）；内置种子保留 | 单元 | S6 | 2 |
| T13 | 导出项目 A → 空库 → 恢复 | 解包后没有项目 B 的数据；文本、层、目录引用、媒体 sha256 都正确，可以播放；生成新 projectId 并记录 `restoredFrom` | 单元 + E2E | S4 | 3 |
| T14 | 包里有损坏哈希、路径穿越、重复条目，或超过上限 | 拒绝，不写入任何数据；失败和跳过项列成清单 | 单元 | S4 S5 | 3 |
| T15 | 导出体积超过导入上限 | 导出前就提示，或改用分卷/外置媒体，不生成读不回来的包 | 单元 | S5 | 3 |
| T16 | 导入旧 formatVersion 1 的 .jym | 走只读兼容路径，标为“旧版整库包”，必须先预览；本机音频保留 | 单元 | S4 S5 | 3 |
| T17 | 恢复快照超过 8 MiB | 界面状态显示“已跳过”；旧快照被清掉或标为过期 | 单元 | S5 | 4 |
| T18 | 升级前快照失败（包括冷却期）时遇到改写/删除数据的迁移 | 迁移被阻止，应用停在旧版本，原库可以打开，提示导出 JYB | 单元 + 隔离浏览器 | S5 | 4 |
| T19 | 迁移失败后用备份恢复 | 索引和主键与 Dexie 定义一致，回放测试通过；最近一个已知良好的快照仍在 | 单元 | S5 | 4 |
| T20 | 第一次导入时请求 persist，配额不足 | persist 结果被记录并显示；遇到 `QuotaExceededError` 时给出提示，不删原件 | E2E | S5 | 4 |
| T21 | 有待发同步操作时删除项目；另一个客户端离线编辑同一项目后上线 | 待发操作标为“已取消”；项目不复活（delete-wins） | 单元（mock 协议）+ 真实 Supabase 分开记录 | S6 | 5 |
| T22 | 对已有内容的项目再次导入 EAF | 写入前显示覆盖预览（将替换的层/单元数）；取消后数据不变；确认后清理与写入在同一提交，中途失败时原内容完整 | 单元 + E2E | S1 S5 | 2 |
| T23 | 导出 JYT 后在空库导入 | 包内没有任何媒体字节，manifest 为 `media: excluded`，界面标“不含音频”；标注、层、来源、目录依赖完整；媒体为缺音状态，Relink 后时间码不变 | 单元 + E2E | S3 S4 | 3 |
| T24 | 导出 JYB（含音频、不含音频各一次）→ 空库 → 恢复 | 预览列出全部项目；恢复后各项目内容和目录完整；含音频版 sha256 一致可播放，不含音频版界面明确提示；不同项目之间没有串数据 | 单元 + E2E | S4 S5 | 3 |
| T25 | 恢复 JYM 时选“覆盖当前项目”：(a) 从未协作的本地项目 (b) 协作过的项目 | (a) 需二次确认，覆盖前快照先生成且可恢复，快照失败则中止；(b) 不出现覆盖选项 | 单元 + E2E | S5 S6 | 3 |
| T26 | 从项目 B 导入说话人/词条到项目 A | A 得到新 ID 的副本，B 不变；删除 B 后 A 的副本仍在 | 单元 | S4 S6 | 3 |
| T27 | 升级前快照失败时遇到只加表/索引的迁移 | 迁移继续完成，界面出现可见警告和导出 JYB 入口；未声明类型的迁移按 rewriting 处理并被阻止 | 单元 + 隔离浏览器 | S5 | 4 |
| T28 | 同一项目导入两份不同的 EAF，选择“作为新标注文档” | 两份文档并存，各自的层/单元与来源独立；删除其一不影响另一份 | 单元 + E2E | S1 S2 | 5 |
| T29 | 导入旧版整库 .jyt | 显示“旧版整库包，不含音频，包含多个项目”提示和预览；不静默替换；本机音频保留 | 单元 | S3 S5 | 3 |

自动验证：每批都跑 typecheck 和所触及领域的 Vitest；UI 或装配改动加 Chromium E2E；结构改动跑 `check:architecture-guard`；文档跑 `check:docs-governance` 和 `check:plans-frontmatter`。性能先用小、中、大三档真实代表数据测：单项目读取、全库体量的影响、归档峰值内存、压缩和哈希耗时、取消响应；测出可复现的预算之前，不承诺具体 GB 级支持或固定工期。

## 12. 推荐决策与待冻结参数

已决定（D1–D5）：JYM 含媒体的单项目包、JYT 不含媒体的轻量包、JYB 整库备份；迁移分级与快照失败阻止；维持 ADR-0044，跨项目靠复制；多文稿在第 5 批；默认恢复成新项目，覆盖仅限从未协作项目。

推荐（技术层面，随批次落实）：来源用 UUID 加 legacyId；外部 ID → 哈希 → 文件名的匹配顺序；保留删音留轴；原件、派生、标注分离；Relink 和重新导入分开；项目包包含必要依赖和媒体，默认恢复成新项目；破坏性迁移必须先有恢复点；墓碑长期保留并采用 delete-wins；保留 Dexie 和现有目录；先止损，再保证正确性，最后扩展组织模型。

在对应批次的基线完成后再冻结：资料组的实际规模、跨媒体文档的作用域、原始文稿默认保留方式和容量、归档支持上限和兼容版本窗口、备份份数和保留预算、访问级别词表；JYB 默认是否含音频；JYT 能否“导入到现有项目”作为新标注文档（依赖第 5 批）；旧版整库包恢复时按项目逐个新建还是允许合并。这些都不阻碍第 1、2 批，也不应该用未经验证的默认值固化成永久协议。

最终交付：领域关系与所有权文档、迁移和归档 ADR、实现和定向回归测试、隔离浏览器下的恢复证据、用户能看懂的导入/导出/删除说明。做到这些才算改进完成。

## 13. 相对原稿的主要修改

1. **更正事实**：projectFileOps 没有写事务，要新建边界，而且同类写法共 18 处；JYM≡JYT，都是整库、无媒体；persist 结果被丢弃；恢复快照跳过后旧快照还在；删除项目有残留，也不处理同步队列。每条都附了代码位置。
2. **新增问题 N1–N11 并分级**：其中 N2（恢复/导入抹掉本机音频）、N3（工作台整库替换）、N4（缺音占位连锁合并）定为 P0，单独成为第 1 批紧急止损。
3. **N1 改变了原稿的前提**：现在每次导入都会替换整个项目，“多文稿”和“再次导入区分更新”还不存在；已决定第 2 批只修事务和覆盖预览，多文稿放第 5 批（D4）。
4. **SharedAsset 改为 ProjectCatalog**，与 ADR-0044 的项目归属对齐；跨项目复用改为复制（D3）。
5. **补充调研支撑的设计**：UUID 加 legacyId；外部 ID → sha256 → 文件名的匹配顺序，只有文件名相同就当新来源；哈希在事务外算；Relink 与重新导入分离；OCFL 风格的 manifest；默认恢复成新项目；失败/跳过清单；迁移分级并保留已知良好副本；墓碑与 delete-wins；稳定 clientId；persist 在用户手势时请求；Safari 7 天规则；FSA 备份文件夹；资料组等于采录事件；文件角色和访问级别三层继承。
6. **批次重排为 0–5 加文档**，每批写明覆盖问题、范围、验收、回滚、粗估和依赖；验收矩阵细化为 T1–T21，并对应到成功标准 S1–S7。
7. **删掉原稿的 P0–P6 批次表**，其内容并入新批次；原稿第 8、10、11 节合并进第 8、11、12 节。
8. **第 0 批已决定（2026-10-08）**：新增 10.1 决定记录 D1–D5，删除原来的 Q1–Q5 待议问题。出口改为 JYM（单项目含媒体）/ JYT（单项目不含媒体，类似 EAF）/ JYB（新整库备份，明示是否含音频）；迁移分级加入“加法迁移继续但警告”；新增覆盖当前项目的二次确认与覆盖前快照路径、从其他项目导入；第 2–5 批、操作表、6.1、第 7、8 节随之调整；新增验收 T22–T29。
