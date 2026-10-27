---
title: ADR 目录说明
doc_type: adr-index
status: accepted
owner: repo
last_reviewed: 2026-10-26
source_of_truth: decision-index
---

# ADR 目录说明

本目录只记为什么。规则见 [ADR-0049](./0049-decisions-not-current-state-inventories.md)，各类文档何时结束见 [ADR-0051](./0051-every-doc-type-has-an-end.md)。索引不复述决策。

## 编号

下一号是 **0095**。0007、0010–0017 空着，不补。编号不复用。撞号的文件不改名，引用时写文件名。

`adr-*` 那一组自称 ADR-001–007，序列已关闭。

0058 有两份，文件名不同，不改名：`0058-card-sqlite-file.md` 记卡片语义，`0058-indexeddb-two-layer-placement.md` 记 IndexedDB 归层。引用时写文件名。

## 桌面存储：当前有效条款

下表只回答「现在以哪一条为准」。被点名的 ADR 正文都不改，整篇也不改成 `superseded`。基础单库布局以 [ADR-0085](./0085-desktop-project-one-sqlite.md) 为准；范围/冻结与开发格式见 [ADR-0086](./0086-desktop-release-scope-and-format-freeze.md)，删除/恢复见 [ADR-0087](./0087-project-deletion-retention-and-media-cleanup.md)，M1 未覆盖的领域落点见 [ADR-0088](./0088-desktop-sqlite-domain-landings.md)。分析过期、曾经接受与恢复见 [ADR-0089](./0089-analysis-generation-accept-and-restore.md)。完整载荷、全项目字段和失效引用见 [ADR-0090](./0090-analysis-payload-custom-fields-and-dangling-refs.md)。字段修订、诊断补交、备注锚点、转写接受回执、删除准入、备份快照和恢复执行隔离见 [ADR-0091](./0091-field-revisions-diagnostic-delivery-and-later-milestones.md)。冲突条款按对应新篇执行。

| 事项                                                                                                                                                      | 唯一权威                                                                                                                                                                                                 | 不要再当成权威                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 桌面用 SQLite、浏览器用 Dexie、新代码走存储接口                                                                                                           | ADR-0085：新存储只写 SQLite，一次操作一次事务。操作仍是业务方法，不接受表名（ADR-0048 第 3 条的这一句）                                                                                                 | Dexie 与 SQLite 各写一套；按浏览器保存路径先实现新规则                                                                   |
| 交换包与每日备份 | ADR-0046 第 2、6 条中不冲突要求；ADR-0086 取消旧 JYB 迁入，ADR-0087 定已删除对象的包保留与恢复 | 只备数据库替代含音频备份、把 #326 当首发阻塞、恢复旧包立即清除 |
| 文件夹里放什么                                                                                                                                            | ADR-0085：音频是原文件，结构化数据只有 `project.sqlite`，文稿是表里的一行                                                                                                                                | 一份文稿一个 `.jyd`（ADR-0061 第 1–4、6 条）；ADR-0046 第 1、5 条的 `project.sqlite` + `media/`                          |
| 删除、恢复、提醒与录音清除 | [ADR-0087](./0087-project-deletion-retention-and-media-cleanup.md) | 文稿 .jyd 立即送垃圾箱、独立隐藏、按缺失路径猜成功、永久清除后恢复原 id |
| 共用定义、定义副本、清单缓存、操作 id、同名合并时机                                                                                                       | ADR-0060 第 2、3、4、7 条。词条、标签定义、自定义字段定义、缩写不进定义副本，见 ADR-0070                                                                                                                 | ADR-0060 第 5、6 条（分块、`VACUUM INTO`）；把这四类目录复制进每份 `.jyd`                                                |
| 隐藏、系统垃圾箱、协作删除只动本机                                                                                                                        | ADR-0087：首发不做独立隐藏。录音满足清除条件后才送系统垃圾箱，文稿不是被送走的文件。协作删除仍只动本机 | 按 ADR-0058-card 第 5、6 条做独立隐藏，或把文稿立即送垃圾箱 |
| IndexedDB 归哪一层                                                                                                                                        | ADR-0058-indexeddb 管浏览器库归层。项目文件夹以 ADR-0085 为准                                                                                                                                               | 该篇里「项目内容全进 `project.sqlite` + `media/`」                                                                       |
| D14 冻结                                                                                                                                                  | 尚未冻结。一份文稿一条录音，父链接不跨文稿。不兼容文件拒绝打开，不自动拆，不做迁移器（ADR-0086）。冻结前要有含音频的备份恢复并播放，以及桌面写路径验证。不再等 #281、#326 | ADR-0046 第 8 条和试用地图里的「冻结对象 = SQLite + `media/`」；把 #281、#326 当冻结前置；「没有要保留的真实数据」不能当作丢弃本机已导入录音的依据 |
| `unit_relations`、`user_notes` 放哪                                                                                                                       | ADR-0085：备注在 `notes`，关系不跨文稿。标记删除保留备注；最终清除时同一事务删掉所属备注（ADR-0087） | 按 ADR-0062 第 3、4 条把备注拆进 `.jyd`；用户一删除就清掉备注 |
| 存储接口的边界                                                                                                                                            | ADR-0085：一次业务操作一次事务，调用方不传表名。弹窗和订阅仍分开（ADR-0062 第 7 条这一句） | 把新库装回旧 StoragePort；把弹窗、订阅、业务操作收进同一个可选 `files` 对象 |
| 会话记忆载荷                                                                                                                                              | 能力保留。ADR-0085 未列此表。接替前另写 ADR，不塞进 `settings_json`（ADR-0086） | 沿 ADR-0066 直接建 `ai_session_memories`，或放进 `.jyd` |
| 语言记录上的数组、行政区划、多语备注、自定义字段值                                                                                                        | ADR-0067 的具名 JSON 列留在单库 `languages` 行。内置模板先复制成项目行后再被层引用（ADR-0088） | 沿 ADR-0067 写进 `.jyd`，或因未列出就撤掉语言记录 |
| `model_runs`                                                                                                                                              | [ADR-0094](./0094-transcription-run-acceptance-facts.md)：桌面列、中断、放弃数、生命周期凭据和接受事实。运行表与来源、任务仍分开（ADR-0088）。ADR-0057 第 8、9 条的其余规则继续有效 | 把运行记录塞进 `source_records`、`provenance_json` 或 `ai_tasks`；用 `manuscripts.generation` 充当生命周期凭据 |
| 词条附件文件                                                                                                                                              | [ADR-0095](./0095-attachment-file-publish-and-cleanup.md)：项目文件夹里按哈希放文件，链接数由行数得出。最后一条链接先提交 `cleanup_pending`，再送垃圾箱。结果未知则留下文件行 | 沿用 Dexie 的 `ref_count` 和行内 Blob；在数据库事务里删文件；给附件套 90 天 |
| 删除周期列                                                                                                                                                | [ADR-0096](./0096-deletion-cycle-columns.md)：文稿与录音各用 `deleted_at`、`retain_until`、`reminder_shown_at`。可清除时刻由这三列算出 | 只存一个 `purge_after`；把 90 天和 7 天写进每一行 |
| 词条 DMLex 正文                                                                                                                                           | ADR-0068 的 `entry_json` / `resource_json`，加 ADR-0088 的 `jieyu_json`。核心词义链接的删除和失效引用以 ADR-0090 为准。例句引用和出现引用仍按 ADR-0088 第 9 条拒绝删除 | 因 ADR-0085 未列出就撤掉词条，或把义项拆成子表。用 ADR-0088 第 9 条挡住已允许失效的核心词义链接 |
| 结构规则正文、正字法转换规则与样例、车道锁定表                                                                                                            | 正字法转换沿用 ADR-0069 第 2 条，落在单库 `orthography_bridges`（ADR-0088）。结构规则正文仍是 ADR-0069 第 1 条。车道锁定另写决定 | 沿 ADR-0069 把车道锁定写进 `.jyd` |
| 说话人分配                                                                                                                                                | ADR-0085：`speakers` 属于整个项目，一次事务写入 | ADR-0071 的项目库和每份 `.jyd` 各提交一次 |
| 正则拆分                                                                                                                                                  | ADR-0085：起止时间在语段行，单位是秒。语段和转写正文同一次事务。不另建锚点表 | ADR-0072 的 `.jyd` 锚点行 |
| 轨道行                                                                                                                                                    | ADR-0085 未列轨道表。能力若仍要，接替前另写 ADR，不塞进 `settings_json`（ADR-0086） | 沿 ADR-0073 把 `track_entities` 写进 `.jyd` |
| 来源记录                                                                                                                                                  | ADR-0085：`sources` 在 `project.sqlite`，不存原件字节。最终移除录音登记时同事务解除关联，不删来源（ADR-0087） | ADR-0074 的跨库登记 |
| 录音行                                                                                                                                                    | ADR-0085：`media` 只登记相对路径，字节是项目里的文件。一份文稿一条录音 | ADR-0075 的 `media_items` 加 `.jyd`；把音频字节写进库 |
| 去掉一条空录音                                                                                                                                            | 新库不沿 ADR-0076 的两次提交。录音清除以 ADR-0087 为准，未满足条件不删音频文件 | 先改 `.jyd` 再改项目库 |
| 文稿改挂录音                                                                                                                                              | ADR-0085：`manuscripts.media_id` 只有一条，替换是同库一次事务 | ADR-0077 替换 `.jyd` 的 `meta.audio_id` |
| 跨文稿关系                                                                                                                                                | ADR-0085：父层、父语段不空时必须在同一文稿。不要求父语段落在父层上 | ADR-0078 只在同一份 `.jyd` 里写 |
| 桌面壳安装 SQLite 存储接口                                                                                                                                | 新路径一次函数一次 IPC，不把新库装进旧 StoragePort 代理。旧代理留到屏幕改接（ADR-0086） | 按 ADR-0079 默认安装旧端口 |
| 会话和消息                                                                                                                                                | ADR-0085：`conversations` 和 `messages` 在 `project.sqlite`。不存引用和推理正文 | 把会话放进 userData，或为引用另加列 |
| 产物创建时间                                                                                                                                              | ADR-0085 要求产物与必要记录同成败；userData 审计的位置与失败语义尚有冲突，见[边界草案](../execution/specs/desktop-domain-write-boundaries/design.md)。密钥仍留 userData；草案不放宽回滚承诺 | ADR-0081 的先提交产物、审计失败时产物留下 |
| 另一项目的层                                                                                                                                              | ADR-0085：`layers.manuscript_id`。不靠可空 `text_id` 判断归属 | ADR-0082 的 `.jyd` `layers.text_id` 和缺列拒绝 |
| 项目行的标题和时间                                                                                                                                        | ADR-0085：`title_json` 至少一条非空字符串。`created_at`、`updated_at` 必填 | ADR-0083 的可空列和空标题拒绝读取；把 `name` 当成标题 |
| 后加列的空值                                                                                                                                              | ADR-0085：必填是 `NOT NULL`。`NULL` 只表示可以没有的关系，不是未补全 | ADR-0084 把后加列的空值当成未补全并计数 |
| 语段时间与播放器时间 | ADR-0088：语段存文献轴秒。播放器时间由文稿 `timeMapping` 换算 | 把 ADR-0085「单位与播放器相同」理解成不保存映射 |
| 分析图与词项投影 | ADR-0088：已接受图是真值。`tokens` / `morphemes` 是同事务同步的线性投影。过期、曾经接受与恢复以 [ADR-0089](./0089-analysis-generation-accept-and-restore.md) 为准。完整载荷、字段管理和失效引用以 [ADR-0090](./0090-analysis-payload-custom-fields-and-dangling-refs.md) 为准 | 用词项父子表代替分析图，或接受时整表删除再插入。用图内容相等判断当前正在使用，或把旧图直接放到新正文上。把实验键当成协议 |
| 外部标注重导入 | ADR-0088：EAF 按文稿、层和标注 id 匹配。`external_ref` 单独不是匹配键 | 只按标注 id 字符串更新任意层 |

研究「音频放进卡片文件」的那份计划已经从工作区删除，记录在 Git 历史。ADR-0061 没有采用那个方案。

详细结构与业务操作的待实施载体见[领域接替规格](../execution/specs/desktop-sqlite-domain-landings/requirements.md)及其[设计、关系图与验收矩阵](../execution/specs/desktop-sqlite-domain-landings/design.md)。ADR-0088 与 ADR-0089 保留决定正文。R1 的取舍已由 ADR-0090 接受，字段编码仍在[该规格](../execution/specs/annotation-graph-rebuild/design.md)直到实施完成。附件的 R5 与列空值已由 ADR-0095 接受，表还没建。删除周期列已由 ADR-0096 接受，并已写入 `schema.ts`。可执行 DDL 仍只在 `src/db/desktop/schema.ts`。

## 本轮范围与生命周期

- [0086：首发单库集成、有限开放与开发格式](./0086-desktop-release-scope-and-format-freeze.md)
- [0087：项目内可恢复删除与录音清除](./0087-project-deletion-retention-and-media-cleanup.md)
- [0088：单库承接现有领域落点](./0088-desktop-sqlite-domain-landings.md)
- [0089：分析代际、曾经接受与恢复写入](./0089-analysis-generation-accept-and-restore.md)
- [0090：完整分析载荷、全项目字段与失效引用](./0090-analysis-payload-custom-fields-and-dangling-refs.md)
- [0094：转写运行与接受事实](./0094-transcription-run-acceptance-facts.md)
- [0095：附件文件发布与最后引用收尾](./0095-attachment-file-publish-and-cleanup.md)
- [0096：删除周期列](./0096-deletion-cycle-columns.md)

R1 的字段编码留在[执行规格](../execution/specs/annotation-graph-rebuild/design.md)，取舍已接受为 ADR-0090，代码未改。附件 R5 已接受为 ADR-0095，表未建。删除周期列已接受为 ADR-0096，并已写入 schema。

## superseded

- [0001-当前事实统一收口到-architecture.md](./0001-当前事实统一收口到-architecture.md) → [0049](./0049-decisions-not-current-state-inventories.md)
- [0043-superseded-by-project-owned-catalogs.md](./0043-superseded-by-project-owned-catalogs.md) → [0044](./0044-project-owned-catalogs.md)

## 主序列

- [0002-开放工作台范围.md](./0002-开放工作台范围.md)
- [0003-execution-文档按角色分层.md](./0003-execution-文档按角色分层.md)
- [0004-logical-timeline-acoustic-media-lifecycle.md](./0004-logical-timeline-acoustic-media-lifecycle.md)
- [0005-unified-timeline-workspace-host.md](./0005-unified-timeline-workspace-host.md)（与下一份都叫 0005）
- [转写层录音模态（SayMore careful speech 向）架构方案.md](./转写层录音模态（SayMore careful speech 向）架构方案.md)（也叫 0005）
- [0006-dexie-transaction-scope-layer-graph.md](./0006-dexie-transaction-scope-layer-graph.md)
- [0008-greenfield-indexeddb-export-collab-surface.md](./0008-greenfield-indexeddb-export-collab-surface.md)
- [0009-greenfield-timeline-single-source-freeze.md](./0009-greenfield-timeline-single-source-freeze.md)
- [0018-transcription-segment-scope-media-ssot.md](./0018-transcription-segment-scope-media-ssot.md)
- [0019-first-acoustic-import-time-remap.md](./0019-first-acoustic-import-time-remap.md)
- [0020-unscoped-canonical-unit-transcription-lane-read-scope.md](./0020-unscoped-canonical-unit-transcription-lane-read-scope.md)
- [0021-zod-jitless-strict-csp.md](./0021-zod-jitless-strict-csp.md)
- [0022-annotation-analysis-graph-typed-relations.md](./0022-annotation-analysis-graph-typed-relations.md)（与评测 Judge 那份都叫 0022）
- [0022-ai-evaluation-judge-provider-contract.md](./0022-ai-evaluation-judge-provider-contract.md)
- [0023-全局布局与样式token壳层策略.md](./0023-全局布局与样式token壳层策略.md)
- [0024-release-evidence-core-governance-dual-gate.md](./0024-release-evidence-core-governance-dual-gate.md)
- [0025-ai-propose-changes-b2-rollback-boundary.md](./0025-ai-propose-changes-b2-rollback-boundary.md)
- [0026-ai-propose-changes-canonical-cluster-rollback.md](./0026-ai-propose-changes-canonical-cluster-rollback.md)
- [0027-voice-unified-non-dictation-chat-path.md](./0027-voice-unified-non-dictation-chat-path.md)
- [0028-assistant-multimodal-orchestration-local-first.md](./0028-assistant-multimodal-orchestration-local-first.md)
- [0029-assistant-tts-web-speech-policy.md](./0029-assistant-tts-web-speech-policy.md)
- [0030-vertical-workflow-template-contract.md](./0030-vertical-workflow-template-contract.md)
- [0031-ai-chat-keyvault-and-csp-connect-src.md](./0031-ai-chat-keyvault-and-csp-connect-src.md)
- [0032-transcription-ai-chat-floating-window-only.md](./0032-transcription-ai-chat-floating-window-only.md)
- [0033-analysis-restricted-workspace-no-transcription-dock.md](./0033-analysis-restricted-workspace-no-transcription-dock.md)
- [0034-collaboration-project-snapshot-by-project.md](./0034-collaboration-project-snapshot-by-project.md)
- [0035-lexicon-edit-baseline-dmlex.md](./0035-lexicon-edit-baseline-dmlex.md)
- [0036-eaf-import-is-interchange.md](./0036-eaf-import-is-interchange.md)
- [0037-interchange-loss-report.md](./0037-interchange-loss-report.md)
- [0038-eaf-tier-pick-by-content.md](./0038-eaf-tier-pick-by-content.md)
- [0039-flex-elan-import-field-map.md](./0039-flex-elan-import-field-map.md)
- [0040-eaf-ph-phonetic-transcription.md](./0040-eaf-ph-phonetic-transcription.md)
- [0041-eaf-nt-note-fn-translation.md](./0041-eaf-nt-note-fn-translation.md)
- [0042-eaf-unnamed-date-tier.md](./0042-eaf-unnamed-date-tier.md)
- [0044-project-owned-catalogs.md](./0044-project-owned-catalogs.md)
- [0045-lift-copy-id-hash-freeze.md](./0045-lift-copy-id-hash-freeze.md)
- [0046-desktop-sqlite-project-folder.md](./0046-desktop-sqlite-project-folder.md)
- [0047-desktop-build-strips-collab-keys-telemetry.md](./0047-desktop-build-strips-collab-keys-telemetry.md)
- [0048-storage-port.md](./0048-storage-port.md)
- [0049-decisions-not-current-state-inventories.md](./0049-decisions-not-current-state-inventories.md)
- [0050-timeline-dispatcher-routes-only.md](./0050-timeline-dispatcher-routes-only.md)
- [0051-every-doc-type-has-an-end.md](./0051-every-doc-type-has-an-end.md)
- [0052-tool-outcome-steps-stay-separate.md](./0052-tool-outcome-steps-stay-separate.md)
- [0053-approval-not-one-handle.md](./0053-approval-not-one-handle.md)
- [0054-outbound-collab-later-web-leg.md](./0054-outbound-collab-later-web-leg.md)
- [0055-corpus-analysis-cloud-forms.md](./0055-corpus-analysis-cloud-forms.md)
- [0056-single-agent-runtime-toolloopagent.md](./0056-single-agent-runtime-toolloopagent.md)
- [0057-model-interface-transcribe.md](./0057-model-interface-transcribe.md)
- [0058-card-sqlite-file.md](./0058-card-sqlite-file.md)
- [0058-indexeddb-two-layer-placement.md](./0058-indexeddb-two-layer-placement.md)
- [0059-electron-shell-skeleton.md](./0059-electron-shell-skeleton.md)
- [0060-card-file-ownership-and-operations.md](./0060-card-file-ownership-and-operations.md)
- [0061-jyd-manuscript-file-audio-stays-plain.md](./0061-jyd-manuscript-file-audio-stays-plain.md)
- [0062-desktop-storage-decisions-2026-10-16.md](./0062-desktop-storage-decisions-2026-10-16.md)
- [0063-desktop-only-after-electron-skeleton.md](./0063-desktop-only-after-electron-skeleton.md)
- [0064-storage-freeze-until-desktop-opens-real-projects.md](./0064-storage-freeze-until-desktop-opens-real-projects.md)
- [0065-toolloopagent-eager-tool-limit.md](./0065-toolloopagent-eager-tool-limit.md)
- [0066-session-memory-payload-json.md](./0066-session-memory-payload-json.md)
- [0067-language-document-json-columns.md](./0067-language-document-json-columns.md)
- [0068-lexeme-dmlex-json.md](./0068-lexeme-dmlex-json.md)
- [0069-document-bodies-as-json.md](./0069-document-bodies-as-json.md)
- [0070-definition-copy-stays-language-orthography-speaker.md](./0070-definition-copy-stays-language-orthography-speaker.md)
- [0071-speaker-assignment-columns.md](./0071-speaker-assignment-columns.md)
- [0072-regex-split-manuscript-columns.md](./0072-regex-split-manuscript-columns.md)
- [0073-track-entity-manuscript-columns.md](./0073-track-entity-manuscript-columns.md)
- [0074-source-record-project-columns.md](./0074-source-record-project-columns.md)
- [0075-recording-row-project-library.md](./0075-recording-row-project-library.md)
- [0076-remove-empty-recording.md](./0076-remove-empty-recording.md)
- [0077-manuscript-audio-replace.md](./0077-manuscript-audio-replace.md)
- [0078-cross-manuscript-links-refused.md](./0078-cross-manuscript-links-refused.md)
- [0079-desktop-shell-installs-sqlite-storage-port.md](./0079-desktop-shell-installs-sqlite-storage-port.md)
- [0080-conversations-stay-in-project-library.md](./0080-conversations-stay-in-project-library.md)
- [0081-agent-artifact-created-at.md](./0081-agent-artifact-created-at.md)
- [0082-foreign-layer-text-id.md](./0082-foreign-layer-text-id.md)
- [0083-project-row-title-and-times.md](./0083-project-row-title-and-times.md)
- [0084-unbackfilled-column-is-not-a-bad-row.md](./0084-unbackfilled-column-is-not-a-bad-row.md)
- [0085-desktop-project-one-sqlite.md](./0085-desktop-project-one-sqlite.md)
- [0086-desktop-release-scope-and-format-freeze.md](./0086-desktop-release-scope-and-format-freeze.md)
- [0087-project-deletion-retention-and-media-cleanup.md](./0087-project-deletion-retention-and-media-cleanup.md)
- [0088-desktop-sqlite-domain-landings.md](./0088-desktop-sqlite-domain-landings.md)
- [0089-analysis-generation-accept-and-restore.md](./0089-analysis-generation-accept-and-restore.md)
- [0090-analysis-payload-custom-fields-and-dangling-refs.md](./0090-analysis-payload-custom-fields-and-dangling-refs.md)
- [0094-transcription-run-acceptance-facts.md](./0094-transcription-run-acceptance-facts.md)
- [0095-attachment-file-publish-and-cleanup.md](./0095-attachment-file-publish-and-cleanup.md)
- [0096-deletion-cycle-columns.md](./0096-deletion-cycle-columns.md)

## 已关闭的另一套编号

- [adr-timeline-unit-view-read-model.md](./adr-timeline-unit-view-read-model.md)（自称 ADR-001）
- [adr-ai-grounding-mcp-shaped.md](./adr-ai-grounding-mcp-shaped.md)（自称 ADR-002）
- [adr-db-unification-timeline-units.md](./adr-db-unification-timeline-units.md)（自称 ADR-003）
- [adr-timeline-unit-view-single-caliber.md](./adr-timeline-unit-view-single-caliber.md)（自称 ADR-004）
- [adr-db-unification-strangler.md](./adr-db-unification-strangler.md)（自称 ADR-005）
- [adr-006-linguistic-subgraph-unitid-utterances-retirement.md](./adr-006-linguistic-subgraph-unitid-utterances-retirement.md)（自称 ADR-006）
- [adr-ai-list-units-snapshot-handle.md](./adr-ai-list-units-snapshot-handle.md)（自称 ADR-007）
