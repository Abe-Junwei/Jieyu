---
title: ADR 目录说明
doc_type: adr-index
status: accepted
owner: repo
last_reviewed: 2026-10-22
source_of_truth: decision-index
---

# ADR 目录说明

本目录只记为什么。规则见 [ADR-0049](./0049-decisions-not-current-state-inventories.md)，各类文档何时结束见 [ADR-0051](./0051-every-doc-type-has-an-end.md)。索引不复述决策。

## 编号

下一号是 **0077**。0007、0010–0017 空着，不补。编号不复用。撞号的文件不改名，引用时写文件名。

`adr-*` 那一组自称 ADR-001–007，序列已关闭。

0058 有两份，文件名不同，不改名：`0058-card-sqlite-file.md` 记卡片语义，`0058-indexeddb-two-layer-placement.md` 记 IndexedDB 归层。引用时写文件名。

## 桌面存储：当前有效条款

下表只回答「现在以哪一条为准」。被点名的 ADR 正文都不改，整篇也不改成 `superseded`。

| 事项                                                                                                                                                      | 唯一权威                                                                                                                                                                                                 | 不要再当成权威                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 桌面用 SQLite、浏览器用 Dexie、新代码走存储接口                                                                                                           | ADR-0046 第 3 条，操作形状见 ADR-0048；Electron 骨架跑通后浏览器构建只作开发与测试、新功能只按桌面实现（ADR-0063）；#275 之后新操作只写 SQLite，Dexie 冻结，E2E 迁完且旧库迁完后删浏览器构建（ADR-0064） | 按浏览器保存路径先实现一遍新规则；Dexie 与 SQLite 两边都写                                                               |
| JYT/JYM 是交换包不是活文件；JYB 只在浏览器构建（旧浏览器数据迁入桌面时例外，见 0062 第 6 条）；每日 JYM 快照留 3 份，在含音频的备份通过恢复演练前保持不动 | ADR-0046 第 2、6 条；ADR-0062 第 1、6 条                                                                                                                                                                 | 用「只备份数据库、音频只留哈希」替换每日 JYM。该替换未批准；将来的备份必须含可播放的音频字节                             |
| 文件夹里放什么                                                                                                                                            | ADR-0061 第 1–4、6 条：音频是原文件，一份文稿一个 `.jyd`，声文稿只是展示                                                                                                                                 | ADR-0046 第 1、5 条的 `project.sqlite` + `media/`；ADR-0058-card 第 1 条（音频字节在卡片文件里）                         |
| 认回与删除状态                                                                                                                                            | 还没有。ADR-0061 第 5 条写了「按 sha256 认回」，多个文件哈希相同时不够，规格里先约束为必须问用户。同名判断把「已隐藏」算进去（ADR-0062 第 2 条）                                                         | 把第 5 条直接当成实现规格                                                                                                |
| 共用定义、定义副本、清单缓存、操作 id、同名合并时机                                                                                                       | ADR-0060 第 2、3、4、7 条。词条、标签定义、自定义字段定义、缩写不进定义副本，见 ADR-0070                                                                                                                 | ADR-0060 第 5、6 条（分块、`VACUUM INTO`）；把这四类目录复制进每份 `.jyd`                                                |
| 隐藏、系统垃圾箱、协作删除只动本机                                                                                                                        | ADR-0058-card 第 5、6 条                                                                                                                                                                                 | —                                                                                                                        |
| IndexedDB 归哪一层                                                                                                                                        | ADR-0058-indexeddb；项目文件夹里再按 ADR-0060、ADR-0061 分                                                                                                                                               | 该篇里「项目内容全进 `project.sqlite` + `media/`」                                                                       |
| D14 冻结                                                                                                                                                  | 尚未冻结。一份文稿同时只关联一条音频，父子链接不能跨文稿；已经同时挂着两条的旧文稿迁移时拒绝，不自动拆。冻结前还要有：格式原型、含音频的备份恢复并播放、桌面写路径验证                                   | ADR-0046 第 8 条和试用地图里的「冻结对象 = SQLite + `media/`」；「没有要保留的真实数据」不能当作丢弃本机已导入录音的依据 |
| `unit_relations`、`user_notes` 放哪                                                                                                                       | ADR-0062 第 3、4 条：按每行所指对象归属；跨文稿的关系一律不存                                                                                                                                            | 把整表划进 `.jyd` 或项目库                                                                                               |
| 存储接口的边界                                                                                                                                            | ADR-0062 第 7 条：业务操作走端口（一事务）；弹窗和订阅分开                                                                                                                                               | 把弹窗、订阅、业务操作收进同一个可选 `files` 对象                                                                        |
| 会话记忆载荷                                                                                                                                              | ADR-0066：项目库 `ai_session_memories.payload_json`，不进 `.jyd`、不进定义副本                                                                                                                           | 按 AI 层的键拆列，或把载荷放进文稿文件                                                                                   |
| 语言记录上的数组、行政区划、多语备注、自定义字段值                                                                                                        | ADR-0067：项目库语言行上的 JSON 列，不进定义副本                                                                                                                                                         | 为这些值另建子表，或放进 `.jyd`                                                                                          |
| `model_runs`                                                                                                                                              | ADR-0057 第 8 条，落在项目库                                                                                                                                                                             | 写进 `source_records` 或 `.jyd`                                                                                          |
| 词条 DMLex 正文                                                                                                                                           | ADR-0068：项目库词条行上的 `entry_json` 或 `resource_json`，不进定义副本                                                                                                                                 | 把义项、关系、形式拆成子表                                                                                               |
| 结构规则正文、正字法转换规则与样例、车道锁定表                                                                                                            | ADR-0069：规则正文和转换文档在项目库行上的 JSON，车道锁定表在 `.jyd` 轨道行上，都不进定义副本                                                                                                            | 把符号、对照和车道号拆成子表                                                                                             |
| 说话人分配                                                                                                                                                | ADR-0071：名单在项目行 `speaker_ids_json`，语段种类在 `.jyd` `units.unit_type`。项目库和每一份文稿各一次事务，提交后读回。不进 ADR-0060 第 4 条的文件操作记录                                            | 把两个库合成一个事务，或把语段搬进项目库                                                                                 |
| 正则拆分                                                                                                                                                  | ADR-0072：一份 `.jyd` 里一次事务写锚点、语段和正文。语段行带 `text_id`、起止时间和 `updated_at`，正文行带 `text_id` 和 `updated_at`                                                                      | 把一次拆分拆进两份文稿，或只把时间留在锚点上                                                                             |
| 轨道行                                                                                                                                                    | ADR-0073：一份 `.jyd` 里一次事务写 `track_entities`。轨道行带 `text_id` 和 `updated_at`，车道锁定表仍是 `lane_lock_json`                                                                                 | 把轨道行放进项目库，或在活写入时丢掉坏的车道锁定表再留下该行                                                             |
| 来源记录                                                                                                                                                  | ADR-0074：项目库 `source_records` 记下哈希、外部编号、导入时间和更新时间。登记、改名、解开关联各一次事务。不保存原件字节。挂录音见 ADR-0075                                                              | 把来源记录放进 `.jyd` 或定义副本                                                                                         |
| 录音行                                                                                                                                                    | ADR-0075：项目库 `media_items` 记下文件名、时长和字节状态。`details_json` 不收音频字节。来源挂录音读这张表                                                                                               | 把音频字节写进录音行，或把录音行并进迁移用的 `audio` 表                                                                  |
| 去掉一条空录音                                                                                                                                            | ADR-0076：先改碰到的 `.jyd`，再改项目库。语段和锚点改成未挂接，删掉轨道行，清掉来源关联，删掉录音行。不删音频文件，不改 `meta.audio_id`                                                                  | 先删项目库里的录音行，或为了删句段元数据和快照先把这些表建出来                                                           |

研究「音频放进卡片文件」的那份计划已经从工作区删除，记录在 Git 历史。ADR-0061 没有采用那个方案。

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

## 已关闭的另一套编号

- [adr-timeline-unit-view-read-model.md](./adr-timeline-unit-view-read-model.md)（自称 ADR-001）
- [adr-ai-grounding-mcp-shaped.md](./adr-ai-grounding-mcp-shaped.md)（自称 ADR-002）
- [adr-db-unification-timeline-units.md](./adr-db-unification-timeline-units.md)（自称 ADR-003）
- [adr-timeline-unit-view-single-caliber.md](./adr-timeline-unit-view-single-caliber.md)（自称 ADR-004）
- [adr-db-unification-strangler.md](./adr-db-unification-strangler.md)（自称 ADR-005）
- [adr-006-linguistic-subgraph-unitid-utterances-retirement.md](./adr-006-linguistic-subgraph-unitid-utterances-retirement.md)（自称 ADR-006）
- [adr-ai-list-units-snapshot-handle.md](./adr-ai-list-units-snapshot-handle.md)（自称 ADR-007）
