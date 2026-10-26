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
- [EAF](https://www.mpi.nl/tools/elan/EAF_Annotation_Format_3.0_and_ELAN.pdf) 用 `ANNOTATION_ID` 指向层或父标注，不用下标。ELAN 评论是标注值之外的另一份集合。决定：**适配** 这个分法。译文正文留在 `unit_texts`，评论另起锚点。
- [LIFT / FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf) 把词条备注写成该词条上的多语 `note`，义项身份是词条内的 id。决定：**适配** 到 `jieyu_json.anchoredNotes`，不进 `notes` 表。同名 `senseId` 因此不会串到另一个词条。
- 仓库里 `lexemes.kind` 和 `token_lexeme_links` 已经用 CHECK 把互斥形状定死。决定：**复用** 排他列，不新增依赖，不用一个 `target_id` 兼代九类。没有外键，目标消失后备注行还在，附着状态另行标成 detached。

## 2. 备注：旧字段与构造点

旧行是 `UserNoteDocType`：`id`、`textId`、`targetType`、`targetId`、`targetIndex?`、`parentTargetId?`、多语 `content`、可选 `category`、可选 `provenance`、`createdAt`、`updatedAt`。`targetIndex` 只在一次交换解析时使用，解析后保存稳定身份。

新库 `notes` 目前只有 `layer|unit|token|morpheme`、`target_id`、单字符串 `body` 和 `attachment`。它不是本表的落点，实施时要换载体。词条侧当前 `JieyuNote` 是 `{ owner, ref, text }`，没有稳定备注 id，也没有多语、分类和来源。

| 旧目标 | 生产构造点 | 新锚点 | 归属 |
| --- | --- | --- | --- |
| unit | `useNoteHandlers`、导入、Flex、EAF、`saveAnnotationUnitMeta` | unitId | 由层核对文稿 |
| token | `useNoteHandlers`、`useNotes`、导入词图、自动 gloss | unitId + 稳定节点 id | 接收批次映射，不按 token 下标找回 |
| morpheme | `useNoteHandlers`、`useNotes`、导入词图 | unitId + 稳定节点 id | 父词只校验，不代替身份 |
| tier_annotation | `useNoteHandlers` 的 `unitId::layerId` 与 `::@waveform` | unitId + layerId + timeline 或 waveform | 不粗化成语段或整层 |
| text | 导入标题备注、Flex 文稿头 | projectId | 旧项目范围备注留在项目；文稿头注必须由导入合同显式指定文稿 |
| translation | 本轮没有生产构造点。解析在 `noteTextId.ts`，夹具在测试 | unitTextId + role | 评论不写入译文正文行 |
| annotation | 本轮没有生产构造点。解析和清除测试覆盖它 | 交换给出的内容行、图节点或单元格 | 没有显式映射就拒绝并给出损失，不持久化 |
| lexeme | 本轮没有 `user_notes` 生产构造点 | lexemeId + 稳定 noteId | 只进 `jieyu_json` |
| sense | 本轮没有生产构造点。`saveUserNote` 的义项用例只在测试 | lexemeId + senseId + 稳定 noteId | 先核对属于该词条 |

另有新库已决定的 layer 备注，旧枚举里没有这个类型。包和 JSON 导入仍可能带上没有按钮的四类，恢复时按上表核对，对不上就拒绝，不丢成空备注。

载体已落到 `notes`：`anchor_kind` 决定哪些锚点列必须有值，其余必须为空。项目或文稿归属在写入时核对后放进 `project_id` / `manuscript_id`。`tier_timeline` 与 `tier_waveform` 即使指向同一个语段和层也是两行。`translation_comment` 只指向译文那一行，不改它的 `body`。`content_row`、`graph_node`、`cell` 是旧 `annotation` 的显式映射；没有对应目标就拒绝。词条和义项不写这张表，写在该词条的 `jieyu_json.anchoredNotes`，并保留原来的 `notes` 自由文本。分析恢复只改附着和锚点；备注若在候选之后改过，正文和分类留在行上。`user_version` 14。旧文件只拒绝。旧标注页还没改接。

## 3. 其他域：旧字段与今天的新表

这些行是实施前的对照，不是新的 DDL。不明字段拒绝。空缺和显式清空分开。自定义字段继续走已有定义，不把下面的列收成一个未命名对象。

| 域 | 旧字段（`src/db/types.ts`） | 今天的新表 | 落地 |
| --- | --- | --- | --- |
| 说话人 | `name`、`pseudonym`、`gender`、`birthYear`、`languageIds`、`dialect`、`accent`、`role`、`consentStatus`、`accessRights`、`address`、多语 `notes`、`textId`、时间 | `speakers` 只有 `id`、`name`、时间 | 除 `name` 外都还没有列。共享定义不随文稿清除 |
| 媒体来源 | 新表自己的 `label`、`external_id`、`media_id` | `sources` 已是这三列加时间 | 只表示媒体来源。清录音时解除它 |
| 书目 | `title`、`authors`、`year`、`publisher`、`doi`、`url`、`citationKey`、`sourceType`、多语 `notes`、`accessRights`、`textId` | 新库没有书目表 | 不能塞进 `sources.external_id`。共享书目保留 |
| 对话 | `title`、`mode`、`providerId`、`model`、`archived`、`clearedAt`、`textId`、时间 | `conversations` 只有 `title` 和时间 | 其余字段尚未承接。历史审批不是有效审批 |
| 消息 | `role`、`content`、`status`、`generationSource`、`generationModel`、`citations`、`errorMessage`、`reasoningContent`、`reflectionChecks`、`compatibilityReport`、`sourceScopeSummary`、时间 | `messages` 只有 `role`、`body`、`created_at` | 追加消息带稳定 id，不整份替换数组。引用和推理正文按 ADR-0080 不进消息行的规则继续有效，不能为了接替把它们塞进 `body` |
| 项目设置 | `project.settings_json` 已是对象 | 同列 | 只接受已经点名的键。会话记忆和车道锁定继续排除，见 ADR-0086 |
| 保存的查询 | `AiSourceSetDoc` 仍在旧类型里 | 新库没有表 | 没有已达产品功能就不建表 |
| AI 写入 | 现有提案、审批、执行分开 | 无新的通用写入口 | 复用具体领域操作 |

来源单域已落地：`label` 和 `external_id` 按字段修订合并，诊断摘要另写入 userData。备注载体和桌面会话入口已落地。旧标注页仍不改接，不依赖先做完整个 M5-E。

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
