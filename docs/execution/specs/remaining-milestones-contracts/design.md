---
title: remaining-milestones-contracts design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-10-26
source_of_truth: remaining-milestones-contracts-spec
depends_on:
  - ./requirements.md
  - ../../../adr/0091-field-revisions-diagnostic-delivery-and-later-milestones.md
---

# Design — 字段映射、诊断库与文件原语

## 1. 成熟方案扫描 / Research

- 仓库已有 better-sqlite3 同步事务、`src/db/sqliteStoragePort.ts` 的 userData 连接，以及 `src/db/projectFiles/fileOps.ts` 的纯文件状态机。文件状态机写明不调用系统垃圾箱。
- [SQLite Backup API](https://www.sqlite.org/backup.html) 只给数据库一致快照，不包含库外音频和附件。
- [SQLite ATTACH](https://www.sqlite.org/lang_attach.html) 在限定条件下可以跨库提交。当前项目库和 userData 是两个独立连接，不能据此声称已经原子。决定：**不采用** ATTACH。
- [Electron shell.trashItem](https://www.electronjs.org/docs/latest/api/shell#shelltrashitempath) 返回完成后的 Promise，不返回垃圾箱句柄。决定：**复用** 这个 API，失败和未知按 ADR-0091 的阶段处理。
- 反模式：用 `audit_logs` 的覆盖写入当去重；用整行旧快照当字段合并；用一次目录改名当作三平台原子替换。
- [ELAN 评论](https://www.mpi.nl/corpus/html/elan/ch01s08.html) 与标注值分开，评论可以引用时间片和层。父标注引用是 [EAF](https://www.mpi.nl/tools/elan/EAF_Annotation_Format_3.0_and_ELAN.pdf) 里的另一种机制。决定：**适配**「评论不写进正文」。译文正文留在 `unit_texts`，评论指向那一行。
- [FLEx LIFT 技术说明第 6 节](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf) 把 sense id 定义为项目内唯一。本库不采用这个全局性。决定：**适配** 词条上的多语 note，义项备注按 `(lexeme_id, sense_id)` 留在该词条的 `jieyu_json.anchoredNotes`。
- 仓库里 `lexemes.kind` 和 `token_lexeme_links` 已经用 CHECK 把互斥形状定死。决定：**复用** 排他列，不新增依赖，不用一个 `target_id` 兼代九类。没有外键，目标消失后备注行还在，附着状态另行标成 detached。

## 2. 备注：旧字段与构造点

旧行是 `UserNoteDocType`：`id`、`textId`、`targetType`、`targetId`、`targetIndex?`、`parentTargetId?`、多语 `content`、可选 `category`、可选 `provenance`、`createdAt`、`updatedAt`。`targetIndex` 只在一次交换解析时使用，解析后保存稳定身份。

旧库的 `JieyuNote` 是 `{ owner, ref, text }`，没有稳定备注 id。新表不沿用那个形状。下表只说明以后导入时怎么对照，不决定 `notes` 的列。

| 旧目标 | 生产构造点 | 新锚点 | 归属 |
| --- | --- | --- | --- |
| unit | `useNoteHandlers`、导入、Flex、EAF、`saveAnnotationUnitMeta` | `unit` | 由层核对文稿 |
| token | `useNoteHandlers`、`useNotes`、导入词图、自动 gloss | `token` 投影行 id | 创建时核对语段 |
| morpheme | `useNoteHandlers`、`useNotes`、导入词图 | `morpheme` 投影行 id，并保存 `token_id` | 恢复时与投影上的父词一致 |
| tier_annotation | `useNoteHandlers` 的 `unitId::layerId` 与 `::@waveform` | `unit` 加 `view` | 不是单独的对象种类 |
| text | 导入标题备注、Flex 文稿头 | `project` 或 `manuscript` | 文稿头注必须由导入合同显式指定文稿 |
| translation | 本轮没有生产构造点。解析在 `noteTextId.ts`，夹具在测试 | `unit_text` | 评论不写入译文正文行 |
| annotation | 本轮没有生产构造点。解析和清除测试覆盖它 | 有对应正文行或图节点才映射 | 没有显式映射就拒绝，不持久化 |
| lexeme | 本轮没有 `user_notes` 生产构造点 | `(lexeme_id, noteId)` | 只进 `jieyu_json` |
| sense | 本轮没有生产构造点。`saveUserNote` 的义项用例只在测试 | `(lexeme_id, sense_id, noteId)` | 先核对属于该词条 |

另有新库已决定的 layer 备注，旧枚举里没有这个类型。包和 JSON 导入仍可能带上没有按钮的四类，恢复时按上表核对，对不上就拒绝，不丢成空备注。

旁注锚点是 `project`、`manuscript`、`layer`、`unit`、`unit_text`、`token`、`morpheme`、`analysis_node`。`view` 只属于语段，可为空、`timeline` 或 `waveform`，同一处可以有多条。词和词素用投影行 id。图节点身份是 `(unit_id, node_id)`。目标被物理删除时，同一事务把相关旁注标为 `detached`，正文和分类不动。文稿最终清除才按 `manuscript_id` 删行。已有行恢复只改锚点和附着，不补回缺失行。词条和义项备注仍只在 `jieyu_json.anchoredNotes`。版本以 `src/db/desktop/schema.ts` 为准。旧文件只拒绝。规则在 [ADR-0092](../../../adr/0092-desktop-note-anchors.md)。文件夹页的语段、时间轴和波形备注仍是三条语段旁注。桌面标注页的语段备注已走同次运行打开的项目会话，可创建、改正文和分类、删除；还没有词的语段可按空白切成词，带 `-` 或 `=` 的词可再切成词素，词的 gloss 和词类可改写，词和词素可按精确词头链到已有词条的义项，也可按词头和一个义项译文新建词条并在同一事务链上；同词头已存在则拒绝。

## 3. 其他域：旧字段与今天的新表

这些行是实施前的对照，不是新的 DDL。不明字段拒绝。空缺和显式清空分开。自定义字段继续走已有定义，不把下面的列收成一个未命名对象。

| 域 | 旧字段（`src/db/types.ts`） | 今天的新表 | 落地 |
| --- | --- | --- | --- |
| 说话人 | `name`、`pseudonym`、`gender`、`birthYear`、`languageIds`、`dialect`、`accent`、`role`、`consentStatus`、`accessRights`、`address`、多语 `notes`、`textId`、时间 | `speakers` 已有这些列和 `field_revisions_json` | 旧 `textId` 不建列：本文件就是一个项目。说话人不挂文稿，清除文稿不删行。字段修订和诊断补交与来源相同 |
| 媒体来源 | 新表自己的 `label`、`external_id`、`media_id` | `sources` 已是这三列加时间 | 只表示媒体来源。清录音时解除它 |
| 书目 | `title`、`authors`、`year`、`publisher`、`doi`、`url`、`citationKey`、`sourceType`、多语 `notes`、`accessRights`、`textId` | `bibliography` 已有这些列和 `field_revisions_json` | 不进 `sources`。旧 `textId` 不建列。共享书目不随文稿清除 |
| 对话 | `title`、`mode`、`providerId`、`model`、`archived`、`clearedAt`、`textId`、时间 | `conversations` 已有这些列和 `field_revisions_json` | 旧 `textId` 不建列。`archived` 的 false 和空缺分开。历史审批不进这张表 |
| 消息 | `role`、`content`、`status`、`generationSource`、`generationModel`、`citations`、`errorMessage`、`reasoningContent`、`reflectionChecks`、`compatibilityReport`、`sourceScopeSummary`、时间 | `messages` 只有 `role`、`body`、`created_at` | 追加消息带稳定 id，不整份替换数组。引用和推理正文按 ADR-0080 不进消息行的规则继续有效，不能为了接替把它们塞进 `body` |
| 项目设置 | `project.settings_json` 已是对象 | 同列 | 只接受已经点名的键。会话记忆和车道锁定继续排除，见 ADR-0086 |
| 保存的查询 | `AiSourceSetDoc` 仍在旧类型里 | 新库没有表 | 没有已达产品功能就不建表 |
| AI 写入 | 现有提案、审批、执行分开 | 无新的通用写入口 | 复用具体领域操作 |

来源单域已落地：`label` 和 `external_id` 按字段修订合并，诊断摘要另写入 userData。说话人、对话和书目已按同一规则接上除 `textId` 外的旧字段。对话不保存历史审批。书目不进来源表。备注载体、桌面会话和文件夹页的语段、时间轴、波形备注已落地。桌面标注页的语段备注已接新库，可创建、改正文和分类、删除；还没有词的语段可按空白切成词，带 `-` 或 `=` 的词可再切成词素，词的 gloss 和词类可改写，词和词素可按精确词头链到已有词条的义项，也可按词头和一个义项译文新建词条并在同一事务链上；同词头已存在则拒绝。项目设置只接受字符变体、缩写和词类。会话记忆和车道锁定拒绝，原设置不变。保存的查询不建表。AI 写入不新开通用入口。不依赖先做完整个 M5-E。

## 4. 诊断库

`openSqliteStoragePort` 打开的 userData 文件里已有 `audit_logs(id, timestamp, payload_json)`。写入是 `ON CONFLICT(id) DO UPDATE`，相同 id 会换掉载荷。这和「相同身份、不同载荷必须报冲突」相反，所以不能复用这张表的行或这条 upsert。

复用的是这个文件和这条连接。项目库新增的是待补交记录，不是把 userData 审计搬进项目。接收表对原始项目 id、操作 id 和事件序号唯一，并保存载荷哈希。相同身份和相同哈希返回已接收。`ai_runtime_v2_turns` 是回合过期数据，不是诊断接收表。`agent_artifacts` 仍按 ADR-0081 留在项目侧，不充当这次补交身份。

顺序：项目事务提交内容和待补交记录；宿主再向 userData 插入；成功后另一次项目事务把该条标成已确认。诊断发送本身不再产生必须交付的业务诊断。

## 5. 三平台文件操作

仓库里还没有 `shell.trashItem` 调用。`fileOps.ts` 只推进纯状态。

| 能力 | macOS / Windows | Linux | 合同 |
| --- | --- | --- | --- |
| 移入系统垃圾箱 | `trashItem` 可用，失败则 Promise 拒绝 | 同一 API；没有桌面垃圾箱后端时失败 | 失败进入 failed，不记成 confirmed |
| 从垃圾箱还原 | API 不提供句柄 | 同左 | 应用内不假装能还原 |
| 调用与数据库互斥 | 返回值不能参加 SQLite 提交 | 同左 | 用 ADR-0091 的阶段和操作代际 |
| 替换非空项目目录 | 一次改名不是三平台共同的原子替换 | 同左 | 覆盖走 staging 和已确认阶段，失败不打开混合目录 |
| 核对路径之后被外部换文件 | 普通路径调用不能排除这个窗口 | 同左 | 先移入项目私有暂存并核对身份，再调用垃圾箱。身份不符就不调用。这缩小窗口，不宣称窗口消失 |

本轮没有在三平台执行垃圾箱或目录替换。实施对应片时补夹具；没跑的平台不能写成通过。
