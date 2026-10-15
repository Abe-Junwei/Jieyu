---
title: 项目、文稿与音频删除策略：现状审查与改进方案
doc_type: execution-plan
status: proposed
owner: repo
last_reviewed: 2026-10-15
source_of_truth: execution-plan
depends_on:
  - ../../adr/0046-desktop-sqlite-project-folder.md
  - ../../adr/0048-storage-port.md
---

# 项目、文稿与音频删除策略：现状审查与改进方案

本页是**待采纳的执行方案，不是已实施行为或已接受的产品决策**。纳入正式 SDD/ADR 后删掉本页，以免形成第二套规则。解语已接受的桌面存储形状是每项目 `project.sqlite + media/`，浏览器实现仍为 Dexie；见 [ADR-0046](../../adr/0046-desktop-sqlite-project-folder.md)。以下建议不假设 SQLite 版已落地。

## 一手资料中的成熟模式

| 观察 | 一手证据 | 对解语的启示（推论，非来源原话） |
| --- | --- | --- |
| Google Drive 区分“移到垃圾箱”和“永久删除”；垃圾箱通常保留 30 天，恢复期间仍占空间。非所有者的“移除”也不等于删除他人的文件。 | [Google Drive：删除文件](https://support.google.com/drive/answer/2375102?hl=en) | 不能让一个含糊的“删除音频”同时表示从看板消失、清除字节、解除关联和永久销毁。删除范围、恢复期限与空间占用要明示。 |
| Dropbox 删除后从正常文件夹消失，但保留可恢复窗口；窗口随套餐变化。 | [Dropbox：删除文件会怎样](https://help.dropbox.com/delete-restore/deleted-files) | “默认可恢复”是常见做法，但 **30 天不是本地应用的行业强制值**；解语应按空间预算和备份能力单独定期。 |
| Notion 把页面送入 Trash，可搜索、恢复或永久删除；Trash 中页面不能编辑。页面历史和 Trash 是不同恢复机制。 | [Notion：删除和恢复内容](https://www.notion.com/help/duplicate-delete-and-restore-content) | 文稿/项目软删除需要正常列表过滤、恢复入口、只读或不可进入状态；快照不应冒充可逐条恢复的垃圾箱。 |
| Zotero 区分**库内受管理的存储副本**与**外部链接文件**：删除附件条目会管理受管副本，链接文件的原件不随条目删除；缺失文件可定位/重新关联。 | [Zotero：附件文件](https://www.zotero.org/support/attaching_files)、[Zotero：找不到存储文件](https://www.zotero.org/support/kb/missing_stored_file) | 对解语尤为贴近：录音条目、项目内媒体副本、外部原始文件、文稿链接是不同对象。绝不能因为删除项目内副本而删除导入前的原件。缺字节仍有研究资料价值的条目可保留，但必须标“音频缺失/可重新关联”，不能伪装成可播放 WAV。 |
| Zotero 项目条目进入 Trash 后可恢复，默认 30 天可调；永久删除另设动作。 | [Zotero：Collections and Tags／Trash](https://www.zotero.org/support/collections_and_tags) | 本地研究软件也采用“移到垃圾箱 → 恢复／永久删除”两级语义；项目和文稿宜优先复用同一用户心智。 |
| Zotero 明确区分“从当前 collection 移除条目”和“把条目移到整个库的 Trash”；删除 collection 默认也不会删库内条目。 | [Zotero：Collections and Tags／Deleting Collections、Removing Items](https://www.zotero.org/support/collections_and_tags) | “解除录音与某文稿的关联”“从项目移除录音”“销毁录音条目”应是不同业务动作，不能因当前视图移除就推导底层对象已删除。 |
| SQLite 外键可选 `RESTRICT`、`SET NULL`、`CASCADE` 等动作，**外键检查必须对每个连接显式启用**，不应假设默认值。 | [SQLite：Foreign Key Support](https://www.sqlite.org/foreignkeys.html) | 文稿、媒体、来源文件、句段等引用应逐关系决定：阻止删除、解除关联，还是级联。不能用“全表级联”取代产品决策；迁移与打开数据库时应验证 `PRAGMA foreign_keys`。 |
| Dexie 事务只覆盖声明的数据库表；事务回调中等待其他异步 API 可能导致自动提交或失活。SQLite 原子提交的保证针对数据库事务，不会自动涵盖项目目录里的任意媒体文件。 | [Dexie：Transactions](https://dexie.org/docs/Dexie/Dexie.transaction%28%29)、[SQLite：Atomic Commit](https://www.sqlite.org/atomiccommit.html) | `DB 记录 + media/ 文件` 不能当作一次天然原子删除。先在业务层决定保留／暂存／清理阶段，再做可重试、幂等的文件整理与启动恢复；不要把文件系统操作塞进 Dexie 事务里。 |
| Electron `shell.trashItem(path)` 可把文件送到系统垃圾箱，异步完成且可能失败；它只是文件系统动作。 | [Electron：shell.trashItem](https://www.electronjs.org/docs/latest/api/shell/) | 可作为“将整个项目文件夹移到系统垃圾箱”的候选，但它**不会**同步更新 SQLite 引用或替代应用内逐条恢复设计；需评估跨平台、路径失效和失败恢复。 |
| 有效的删除确认应点明对象与影响范围；即使有确认，仍应尽量提供 Undo／恢复。 | [Nielsen Norman Group：Confirmation Dialogs Can Prevent User Errors](https://www.nngroup.com/articles/confirmation-dialog/) | 危险操作文案写明“哪一份文稿／哪条录音、相关句段和标注如何处理、字节是否会消失、是否可恢复”；不能只有“确定删除？”或把“删除音频文件”误写成“删除录音”。 |

## 候选语义矩阵（供产品评审）

| 对象与用户动作 | 建议默认效果 | 必须单列的另一种动作 |
| --- | --- | --- |
| 项目：移到垃圾箱 | 从项目列表消失，项目数据与受管媒体仍一起可恢复；恢复保留原 ID 和内部引用。 | 永久删除项目及其受管文件；先显示文稿、录音、受管字节体积等影响范围。 |
| 文稿：移到垃圾箱 | 从正常文稿列表/默认文稿选择中排除；关联录音不随之被删除，引用恢复后可重接。 | 永久删除文稿及其专属标注/句段；共享或录音级数据是否保留须按关系逐项定。 |
| 录音：从项目移除条目 | 从正常录音看板消失；受管字节、文稿关联、句段/时间轴先作为可恢复整体处理。 | “仅移除音频文件，保留时间轴/标注”作为明确的高级动作：条目仍在，但显示缺失状态和重新关联入口。 |
| 外部原始文件 | 解语默认不删除用户磁盘上的导入前原件。 | 若将来支持外部链接，删除链接条目也不触碰原件，参照 Zotero 语义。 |

上表是**建议**而非已拍板规则。“文稿删除后共享标注归属”“录音与多文稿关联是解除、阻止还是级联”“项目/文稿/录音是否共用一个保留期”“是否采用系统垃圾箱或应用内垃圾箱”，都必须先由代码中的关系图与用户需求确定。不能仅凭同名、空句段或媒体缺字节自动去重或销毁条目。

## 实施门槛与反模式

1. 先盘点 `项目 → 文稿 → 录音/媒体副本 → 来源文件 → 句段/标注 → 导出/快照` 的**真实引用图**，逐动作写“保留、解绑、转移、级联、阻止”矩阵；以 ID 判定引用，不以文件名判定重复。事务入口只暴露业务操作，符合 [ADR-0048](../../adr/0048-storage-port.md)。
2. 优先给当前缺字节条目加状态显露和明确动作命名，再引入垃圾箱；不要把“视觉上不显示”当作删除成功，也不要在加载失败时自动清理元数据。
3. 软删除和恢复应在同一业务边界维护索引、默认文稿/默认录音、关联与计数；执行后**重新加载并按 ID 读回**。永久清理由单独、幂等、可恢复失败的流程处理，尤其要测“DB 提交成功、文件移动失败／反之”和崩溃重启。
4. 快照、垃圾箱与撤销各有边界：快照用于灾难恢复，垃圾箱用于找回具体对象，短时 Undo 用于即时误操作。不能让快照回滚覆写删除后新写入的其他内容；恢复要验证引用与媒体字节。
5. 必测：同名录音多 ID、一个录音关联多文稿、只剩一份默认文稿、缺字节录音、删除后刷新失败、重复点击、文件清理中断、恢复后原 ID/链接/可播放性。不能把“写入成功但视图过期”提示为“删除失败”。

**倾向**：复用成熟的“两级删除 + 可恢复 + 明确永久销毁”交互；适配 Zotero 的“条目/受管字节/外部原件”边界；数据库内用外键和单操作事务，跨 `project.sqlite` 与 `media/` 的文件处理在业务操作中做阶段化恢复。暂不新增依赖；首先补产品语义和当前行为/数据证据，再决定迁移和保留期。

## 当前代码审查（2026-10-15）

此处的“文稿”至少有两种身份：`annotation_documents` 是可编辑标注文稿；`source_records` 是导入的 EAF/TextGrid 等原件登记。两者不能共用同一删除含义。以下为源码行为，不是实际用户库中六条同名录音的字节诊断。

| 对象 | 现有入口与实际持久化行为 | 恢复/可见性与缺口 |
| --- | --- | --- |
| 项目 | `HomePage.deleteProject`、工作台 `handleConfirmProjectDelete` → `runProjectRemovalWithPrompts` → `removeProjectFromDevice`。从未协作过的项目走本机删除；协作过或无法判断的项目只从本机移除。`projectLocalCleanupJobs` 先存任务，依次清协作客户端状态、项目记忆和轨道 UI 状态，最后在一个主库事务中 `purgeProjectRows`；启动时可续跑。 | 本机永久删除前**没有**项目删除前快照/可恢复垃圾箱；项目确认文案写“不可撤销”。多存储步骤可重试，但不构成整体事务。`HomePage` 的 `void deleteProject(...)` 没有页面级 catch，失败提示与重试状态不清晰。协作云端删除是独立入口，不等同于本机移除。 |
| 标注文稿 | `useAnnotationDocumentMenu` → `deleteAnnotationDocument`；禁止删除最后一份。先保存并读回一份项目级快照，失败则不删；随后在一次 Dexie 事务里删除该文稿所属层、标注和单元图，保留 `source_records` 与录音，重选默认文稿。 | 恢复入口是**整项目快照恢复**，不是“只找回这一份文稿”；删除后对其他文稿/项目内容的编辑也可能在恢复时被覆盖。快照只保留最近 3 份，且不含媒体字节；本地字节不存在时恢复会被阻止。菜单在提交成功后刷新失败仍可能提示“文稿操作失败”。 |
| 来源文稿 | `ProjectFileBrowser` 对来源记录提供改名、关联/解除关联及进入标注；`sourceRecordService` 没有用户可用的删除来源记录业务操作。`source_records.storedBytes` 当前写为 `false`。 | 删除标注文稿不会删除来源登记。项目看板上的 EAF 不是标注文稿；即使清理录音，来源记录也应按独立身份保留或显式解绑。 |
| 录音字节 | 工作台“删除当前媒体” → `deleteAudioPreserveTimeline`，只去除 `audioBlob`/URL，保留 `media_items` ID、文件名、时长、句段时间、来源关系和逻辑轴，并写 `acoustic + none + missing`。 | 这是有意的“删字节/可重新挂接”，**不是删除录音条目**。成功文案却称“媒体已删除”；缺字节条目在项目看板仍显示 WAV 和时长。 |
| 录音条目 | 项目看板按每个 `mediaId` 各画一张卡；无移除条目入口。`ProjectFileBrowser` 和首页进度没有把 `availability` 映射到卡片。导入明确 `Add` 可产生同名不同 ID；默认同名导入尝试复用。 | 六张同名卡只证明六条记录，不证明六份可播放字节或六次重复导入。`句子 0` 也不等于没有音频。不能凭文件名/时长自动合并或清理。 |

代码锚点：[`HomePage.tsx`](../../../src/pages/HomePage.tsx)、[`projectRemoval.ts`](../../../src/services/projectRemoval.ts)、[`projectLocalCleanupJobs.ts`](../../../src/services/projectLocalCleanupJobs.ts)、[`projectLocalPurge.ts`](../../../src/db/projectLocalPurge.ts)、[`annotationDocumentService.ts`](../../../src/services/annotationDocumentService.ts)、[`overwriteSnapshotRestoreService.ts`](../../../src/services/overwriteSnapshotRestoreService.ts)、[`sourceRecordService.ts`](../../../src/services/sourceRecordService.ts)、[`LinguisticService.cleanup.ts`](../../../src/services/LinguisticService.cleanup.ts)、[`ProjectFileBrowser.tsx`](../../../src/components/project/ProjectFileBrowser.tsx)。

## 建议的业务动作与引用规则

“删除”在界面上不要裸用；每个动作都写明对象、范围、是否留在列表、字节与标注是否保留、恢复入口。默认不触碰导入前的用户原始文件。推荐规则如下，仍须产品确认：

| 用户动作 | 推荐写入语义 | 必须保留/阻止的关系 |
| --- | --- | --- |
| 删除项目 | 桌面版优先把完整项目文件夹作为一个单元移到系统垃圾箱；在应用列表隐藏，失败则仍保持可打开，不标成功。 | `project.sqlite + media/` 同进同出；协作项目继续区分“仅从本机移除”和“云端所有者永久删除”。浏览器构建当前不能假装有系统垃圾箱。 |
| 删除标注文稿 | 默认可恢复；只处理该文稿的层/单元/标注，保留录音、来源登记和其他文稿。最后一份仍不可删。 | 默认文稿重新选定须与写入同一次提交；不能靠整项目回滚冒充逐文稿恢复。 |
| 移除来源文稿登记 | 独立于删除标注文稿；先预览 `annotation_documents.sourceIds`、显式录音关联和来源证明，再做可恢复移除或阻止。 | 不删除导入前原件；不静默抹掉文稿来源链。 |
| 移除录音条目 | 与“删除录音字节”分开。无句段/锚点等有效引用时可按 ID 移除；有内容时先阻止，后续另做显式迁移/合并流程。若有 EAF 关联，预览并在同一次提交中解绑，EAF 继续留在项目。 | `sentenceCount === 0` 不是安全删除条件；应在持久化层查 `layer_units`、锚点及其他引用。可播放字节在未有可恢复副本前不得被“空条目清理”顺手销毁。 |
| 只删除录音字节 | 保留现有 ADR-0004 语义，但 UI 改称“移除本机音频文件，保留时间轴”，之后状态明确显示“音频缺失·重新挂接”。 | 保留 ID、时长、句段、转写、文稿关联；不能再显示“媒体已删除”却仍有卡片。 |

同名、同长度甚至同哈希都只用于提示/去重预览，不自动把不同 `mediaId` 的句段与文稿合并。草拟的存储接口应是业务操作（如 `removeEmptyRecording`），由适配实现完成归属、引用检查、一次 DB 事务和写后按 ID 读回；页面不传表名、不写多表回调，遵守 ADR-0048。

## 分期落地与验收门槛

1. **P0：止住当前看板误导。** 在首页进度/项目文件视图传递 `availability` 和可播放状态，把缺字节与“有音频但 0 句段”明确分开；提供重新挂接入口。把现有删字节动作及成功文案改准。加一个按 ID 的“移除空录音条目”流程：先在数据层确认没有句段、锚点或其他有效引用；若来源文稿关联则在确认中说明并同事务解绑、保留来源；有可播放字节时不走无备份硬删。删除后重新加载，按 ID 验证所选卡片消失、同名其他 ID 不变。先取得截图项目的实际 `mediaId/availability/byteLocation/Blob/引用数` 只读诊断，再决定是否对其做清理，**不运行同名自动删除脚本**。落位：`homeTranscriptionRecordProgress`、`projectSourceFiles`、`ProjectFileBrowser`、i18n、ADR-0048 存储操作及合同测试；交互 E2E 覆盖。

   2026-10-15：看板状态、重新挂接、删字节文案，以及按 ID 移除空录音已写进代码。本机 Chrome 的库读不到，那六条录音没有删。回收站、保留期和 SQLite 外键仍未做。本页仍是待采纳方案。
2. **P1：统一恢复语义。** 项目删除默认可恢复：桌面版评估 Electron `shell.trashItem` 移动完整项目文件夹的成功/失败语义，并验证 SQLite 连接关闭、WAL/SHM 与媒体目录一同处理；若产品要求应用内“最近删除”，再设计它的索引与保留期，不额外做第二套隐藏状态。标注文稿先把当前快照按钮/提示明确为“恢复当时整个项目，会覆盖之后编辑”，再设计逐文稿恢复，不以现有全项目快照充当逐项垃圾箱。来源文稿加入可恢复移除及引用预览。
3. **P2：桌面持久化接口收口。** 为每个动作定义一个业务操作，Dexie/SQLite 两套适配实现走相同合同测试。SQLite 逐关系定 `RESTRICT/SET NULL/CASCADE` 并在每个连接检查 `PRAGMA foreign_keys=ON`；DB 与 `media/` 跨资源删除采用有状态、幂等的暂存/清理流程，崩溃后可继续，不在一个 SQL 事务中 `unlink` 文件。项目目录级垃圾箱流程与录音文件级清理流程分开验收。
4. **P3：永久删除与空间回收。** 在恢复窗口/备份策略、协作传播规则明确后，另设“永久删除”；按类型列出受影响项目、文稿、录音数与受管字节。空间回收只清理已过保留期且无引用的受管文件，不碰外部原件。期限不照搬别的产品的 30 天，需按试用版空间预算拍板。

贯穿各期的用例：同名六条录音各有不同 ID；缺字节与可播放但 0 句段分别展示；仅删除选中 ID；EAF 留存并正确解绑/恢复；多文稿共享录音；最后一份文稿删除被拒；写入成功后刷新失败显示“已提交，视图待刷新”；删除确认期间引用变化则事务阻止；重复点击/重启续跑；桌面 `DB 已提交但文件未移动` 与 `文件已暂存但 DB 未提交`；恢复后 ID、链接、时间码、可播放性读回一致。项目、文稿、音频三类动作都以**业务结果读回**验收，不以按钮消失或 mock 调用次数验收。

2026-10-15 追问已定：本机删除进系统垃圾箱，不另设 30 天保留期。云端项目怎么删、浏览器在项目文件夹落地前怎么隐藏，后面再定。下文「落地方案」取代更早的「三条命令、语段留在标注文稿」写法。

## 生命周期闭环（2026-10-15）

上一节的回收站解决的是「删了能不能找回来」。用户要移除一条音频、一份文稿，或看板上的这一对时，缺的是对象本身没有走到头。看板卡片是视图，不是一条会话记录。

| 产品 | 一对是什么 | 走到头的命令 | 一手来源 |
| --- | --- | --- | --- |
| ELAN | 一个 `.eaf` 加若干媒体文件。标注只写在 `.eaf` 里，不写进媒体。 | Linked Media Files 里的 Remove 改的是 `.eaf` 的链接列表；Update 在文件搬家后重指位置。磁盘上的媒体文件不由这个对话框接管。 | [ELAN：Media Files and Annotation Files](https://www.mpi.nl/corpus/html/elan/ch01.html)、[ELAN：Changing the linked media files](https://www.mpi.nl/corpus/html/elan/ch01s02s14.html) |
| SayMore | 一次会话：一条源录音，加上它的转写、译文和元数据，放在以会话 Id 命名的一个文件夹里。`.annotations.eaf` 从属于那条音频。 | Delete File 删该文件和它的 `.meta`。Delete this Session 是另一条命令。删 `.annotations.eaf` 会连带删从属文件：`.oralAnnotations.wav`、切分、书面转写和翻译。 | [SayMore：Session](https://documentation.help/SayMore/Session.htm)、[SayMore：Delete a file](https://documentation.help/SayMore/Delete_a_file.htm)、[SayMore：Delete a session](https://documentation.help/SayMore/Delete_a_session.htm)、[SayMore：Delete annotations](https://documentation.help/SayMore/Delete_annotations.htm) |
| Lightroom Classic | 目录里的一条照片，和磁盘上的原件，是两个对象。集合只是成员关系。 | 在文件夹里删除时，确认框给 Remove（离开目录，原件留在磁盘）和 Delete From Disk（离开目录，原件进系统垃圾箱）。在集合里按删除只移出该集合。 | [Adobe：Remove photos from catalogs](https://helpx.adobe.com/lightroom-classic/help/photos.html) |
| Premiere Pro | 项目里的片段引用，和磁盘上的源文件。 | 在项目面板里删除，文件留在硬盘。Make Offline 再分两种：Media Files Remain On Disk（可重新链接）和 Media Files Are Deleted（源文件从磁盘擦掉）。 | [Adobe Premiere 手册：Remove assets from a project](https://www.manualsdir.com/manuals/753887/adobe-premiere-pro-cc-v7xx.html?page=195)、[Adobe：Working with offline clips](https://helpx.adobe.com/uk/premiere-pro/using/offline-clips.html) |
| DaVinci Resolve | 媒体池里的片段，和存储设备上的文件。 | 从媒体池 Remove，文件留在存储设备上。 | [DaVinci Resolve 18 手册：Removing Media](https://www.steakunderwater.com/VFXPedia/__man/Resolve18-6/DaVinciResolve18_Manual_files/part629.htm) |
| Final Cut Pro | 资源库里的片段或项目，以及源媒体。 | File > Move to Trash 把源媒体送进垃圾箱；同一资源库里还有别的项目在用的媒体留在库中。生成的渲染文件另有 Delete Generated Files，不删原媒体。 | [Apple：Delete items from libraries](https://support.apple.com/guide/final-cut-pro/delete-items-from-libraries-ver30ccc048/mac)、[Apple：Manage render files](https://support.apple.com/guide/final-cut-pro/manage-render-files-ver68a8c250/mac) |

对解语的推论（不是上表来源的原话）：

- 看板上一张「音频 + 文稿」卡片应对齐 SayMore 的会话，而不是 ELAN 那种「两个磁盘文件、应用只保管链接」。ELAN 能闭环，是因为 Finder 才是文件的终点；解语把字节放进库、来源登记又不存原件（`source_records.storedBytes` 现为 `false`），不能把终点推给系统文件夹。
- 三条命令要分开，确认框写明对象，对齐 Lightroom 的 Remove / Delete From Disk：解除关联（两边都留）、只去掉录音或只去掉这份来源登记、这一对一起去掉。导入前的用户原件始终不碰。
- 语段必须有家长。ELAN 把标注留在 `.eaf`。SayMore 在删 `.eaf` 时写明从属文件一起走。把 `layer_units` 改挂到 `__unknown_media__` 是没有家长的中间态，生命周期在这里断开。当前 `removeEmptyRecording` 就是这种断开；上文 P0「有句段则阻止」也没有给出用户能走完的下一步。
- 回收站仍然要做，但它接在这三条命令之后。对象还没定，垃圾箱里没有可恢复的那一对。

上面四条是追问之前的推论。追问之后以「落地方案」为准：卡片是文件夹里的一个文件，语段跟着文稿走，本机删除进系统垃圾箱。

## 落地方案（2026-10-15）

本页仍是待采纳方案。采纳后再写 ADR：它改掉「语段的家长是标注文稿、来源登记不存字节、最后一份文稿不能删」。在那之前不改浏览器里的删除代码，也不把现在的 `removeEmptyRecording` 再往 `__unknown_media__` 上叠功能。

已定规则：卡片是项目文件夹里的一个文件，种类是录音、文稿或声文稿。声文稿是一个文件，最多一条音频，可以有多份文稿，文件名用录音名，文稿原名写在文件里。语段住在文稿里，文件或那一份文稿删除时一起走。导入是复制，项目外的原件不动。隐藏把文件移到项目内的「已隐藏」。删除把本机文件或整个项目文件夹送进系统垃圾箱。协作只动本机。同名唯一一对自动合成；同名多条或不同名由用户指定。撞名时询问再加一张或替换；再加一张用新文件名。内容相同但名字不同时询问取消或仍加一张。文件夹落地前的浏览器不实现这套。

### 顺序

1. **文件夹成为卡片清单。** 桌面项目文件夹落地时，看板只列出文件夹里的文件（「已隐藏」除外）。导入只复制，不移动原件。一个路径一张卡片。删除调用系统垃圾箱；失败则文件还在、卡片还在。隐藏是移进「已隐藏」，移回原处。空项目可以没有卡片。验收：复制后原件还在；删除后文件夹和看板一起少这个文件，垃圾箱里能找到；隐藏后主列表没有、文件夹的「已隐藏」里有。

2. **声文稿成为一个文件。** 在第 1 步的文件上做配对、拆开和还原。库里的语段可以留下，家长改成这个文件的 id；用户动作仍是对文件的一次操作。拆出去或删除时，垃圾箱条目记住原来的文件 id，因为进垃圾箱的音频会改名。验收：唯一同名一对合成后只剩录音名那一个文件；去掉一份文稿后声文稿还在、那份语段不在；从垃圾箱还原后回到原文件；再加一条音频进不去。

3. **导入、改名、重名用同一套询问。** 撞名问再加一张或替换。再加一张改成不冲突的文件名。内容相同、名字不同时问取消或仍加一张。名字和内容都相同只问一次，并写明内容相同。文稿卡片还占着录音名时，再导入该音频直接回到文件里并变回声文稿。改名撞车和导入相同；改名凑成唯一一对就合成。验收用临时项目文件夹，不碰用户现有库。

4. **删除项目。** 整个本机项目文件夹进系统垃圾箱，包括「已隐藏」。协作项目只做这一步，不发云端删除。云端怎么删后面再定。

浏览器在第 1 步之前保持现在的直接删除，不增加「已隐藏」。现有看板按钮可以留着，但不把它当成这套规则已经落地。

### 落位

文件复制、改名、移入「已隐藏」、送进系统垃圾箱放在桌面项目文件夹的服务里，一次用户动作一个入口。库内语段的增删走存储端口的一个业务方法，和文件移动分开提交：先记可重试的文件任务，再改库，崩溃后按任务续跑。页面只发起命令和刷新。不新增会话表。

### 验收口径

每个命令按文件路径和语段 id 读回。写成功但看板没刷新时，文案是已提交。不按文件名、时长或句数批量删除。不读取、不上传用户语料来做这项验收。
