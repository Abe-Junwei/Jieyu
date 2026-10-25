---
title: ADR 0088 - 单库承接现有领域落点
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-25
source_of_truth: decision-record
depends_on:
  - ./0009-greenfield-timeline-single-source-freeze.md
  - ./0022-annotation-analysis-graph-typed-relations.md
  - ./0036-eaf-import-is-interchange.md
  - ./0037-interchange-loss-report.md
  - ./0044-project-owned-catalogs.md
  - ./0057-model-interface-transcribe.md
  - ./0067-language-document-json-columns.md
  - ./0068-lexeme-dmlex-json.md
  - ./0069-document-bodies-as-json.md
  - ./0085-desktop-project-one-sqlite.md
  - ./0086-desktop-release-scope-and-format-freeze.md
  - ./0087-project-deletion-retention-and-media-cleanup.md
---

# ADR 0088：单库承接现有领域落点

## 状态

accepted。用户 2026-10-25 要求把单库领域落点写入本篇，并纳入同日对写入模型、稳定身份、词条扩展、内置模板、模型运行和外部匹配键的修订。本篇不改已接受 ADR 的正文。与本篇冲突的句子以本篇为准。不改 `schema.ts`，不扩大 [ADR-0085](./0085-desktop-project-one-sqlite.md) 的 M1 验收。

后续条款导航：第 4、6、7 条涉及代际、曾经接受、待复核快照及恢复时，以 [ADR-0089](./0089-analysis-generation-accept-and-restore.md) 为准；下文决定正文保留。

## 背景

桌面目标仍是一个项目一份 `project.sqlite`。ADR-0085 定了 M1 的表、事务和文件夹，并写明那份表集还不是全产品字段的覆盖。标注真值仍是 `analysisGraph`（ADR-0022）。词条正文仍是 DMLex JSON（ADR-0068）。时间轴的文献坐标和 `timeMapping` 仍是 ADR-0009。交换格式仍是投影（ADR-0036、ADR-0037）。

现行屏幕仍写 Dexie。旧 SQLite 端口仍是项目库加 `.jyd`，不是这套表。`src/db/desktop/` 尚未按本篇建库。外部规范用来核对表达和交换损失，不替换内部模型。

## 决策

1. 一个项目一个库，目录行不再重复 `textId`。系统模板留在代码里，不入库。整份校验的文档用一列 JSON，查找和外键用列。派生结果默认查询。确有查询需要、可以重建的索引可以持久化，但必须写明真值来源，并在同一次业务事务里同步。M1 的表和验收仍以 ADR-0085 为准。下面的列和表在实现那一片时写入 `schema.ts`，只重建合成项目，不做补列迁移。

2. 手动编辑、导入和候选接受都是同一种写入：先产生或修改已接受的领域状态，再在同一事务里同步已接受图、线性投影和相关链接。待定候选不改这些行。不要求每次人工编辑都先点一次「接受」。

3. 已接受图在 `units.analysis_graph_json`。服务层用现有分析图校验，事务内读回，并核对基线指纹。转写正文仍是 `unit_texts` 里 `role = transcription` 的那一行。图里的 `text` 和 `displayGloss` 留在图 JSON 里。词级 gloss 层若单独存在，仍是另一条层和另一行正文。

4. 转写正文从旧句改成新句时，原已接受图不再作为当前有效分析。它和当时的投影（含词形、gloss、词类）一起成为一条待复核候选。当前已接受图清空。实时投影行在同一事务里卸下，界面不再把它们显示为有效分析。重新投影是另一次操作。

5. `tokens` 和 `morphemes` 是已接受状态的线性投影，不是分析真值。未改变的图节点沿用稳定 id，投影行使用这个 id。`form` 是按正字法的映射，`gloss` 是按语言的映射，词类留在投影行上。图节点的单个 `label` 不代替这些映射。零词素、多词表达、形态过程及其他非线性节点不建投影行。导入若写入词项，同一次操作必须写入已接受图；图可以是这次导入材料的投影。没有已接受图，就没有实时投影行。

6. 投影同步不靠数据库级联决定产品行为。消失节点上的词义链接和备注在同一事务里显式卸下，并列入这次操作的结果。候选行不因节点消失而被级联删除。不使用 `ON DELETE CASCADE` 表达这些规则。

7. 图分析候选在 `analysis_candidates`：`unit_id`、`status`（`pending` / `accepted` / `rejected`）、`graph_json`、生成时的 `baseline_fingerprint`、操作者、时间戳。指纹取生成时的已接受图；当时没有已接受图，指纹为空基线。提交新的待定候选时，该语段其余待定候选改为 `rejected`。同一语段至多一条 `accepted`。接受时核对保存的指纹与当前已接受图，不一致则整次拒绝。核对通过后，同一事务更新候选状态、已接受图、线性投影和链接。这张表只放图分析候选。转写候选仍按 ADR-0057：待审正文不落库，拒绝不存正文，接受才写入选定转写层。

8. 词条沿用 ADR-0068：`kind` 决定写 `entry_json` 或 `resource_json`，两列不并存。`jieyu_json` 另存 `exampleRefs`、词条及义项备注、`occurrenceCitations`，用现有 Jieyu 扩展校验，不写入 `entry_json`，也不写入 `tags_json`。嵌套 id 先走现有归一化，再校验。校验器不补 id。

9. `token_lexeme_links.sense_id` 是词条 JSON 里的义项 id，没有义项表。新增链接、更新词条、删除义项、删除词条都核对引用。仍有词义链接、例句引用或出现引用指向该义项或词条时，拒绝删除，先解除或改指向。同次批量改指向不是默认行为。

10. 不设 `usage_count`。现有词条列表会按该字段排序，界面文案是「使用次数」，词条写入路径没有递增它。当前引用数查询链接行。历史累计次数若要保存，须另定增量事件，不把查询结果写成累计事实。

11. 词条附件的字节在项目文件夹里。`lexeme_assets` 登记相对路径、sha256、种类、MIME、显示名和字节数。`lexeme_asset_links` 连接词条和附件。`ref_count` 是链接行数的持久化计数，与链接的增删在同一事务里更新；降到 0 时删除登记行。仍有链接的附件保留。解除一条关联走解除操作。词条本身在决策 9 的引用解除之前不能删除。

12. 语段 `start_time` / `end_time` 是文献轴秒。播放器时间在有映射且 `scale > 0` 时为 `offsetSec + scale × 文献秒`；没有映射时偏移为 0、比例为 1。改映射不改语段时间。这收窄 ADR-0085 里「单位与播放器相同」那一句。文稿上另有 `logical_duration_sec`、`time_mapping_json`、`time_mapping_history_json`、`export_timeline_mode`、`tier_roles_json`。有长度时必须是有限正数。映射里的 `sourceMediaId` 若存在，必须等于该文稿的 `media_id`。保存映射时，当前映射、最多 8 条历史和 `revision` 同事务写入。空映射表示恒等映射，不另存一行假映射。`export_timeline_mode` 只作导出标签。这些列不进 M1。不建时间槽表，不建锚点表。`Symbolic_Subdivision` 继续收进词项结构。

13. `languages` 承接现有语言记录里已经保存的标量。国家、官方使用地、行政区划、使用领域、方言、口语变体、书写系统、多语备注和自定义字段值沿用 ADR-0067 的具名 JSON 列，不收成一个未命名对象来代替它们。`canonical_tag`、`iso6393`、`glottocode`、`autonym`、`scope` 和 `name_json` 是列。ISO 639-3 可空。非空的 `iso6393`、`glottocode` 在本库内唯一。显示名、别名和目录历史仍是独立表。

14. `orthographies` 承接现有正字法记录。`script_tag` 是 BCP 47 文字子标签。输入法提示留在正字法记录里，不充当正字法身份。`orthography_bridges` 沿用 ADR-0069 第 2 条的 `name_json`、`rules_json`、`sample_input`、`sample_output`、`sample_cases_json`、`notes_json`，并保留 `engine`、`status`、`is_reversible` 和两端正字法 id。

15. 层的 `language_id`、`orthography_id` 只外键指向项目里的目录行，可空。项目用到代码中的内置语言或内置正字法，或直接使用有效 ISO 639-3 代码时，先建立或复用一条带来源标记的项目行，层再引用该行。代码模板本身不入库。只有 Glottocode、没有 ISO 639-3 的语言仍然可以建立。

16. `external_ref` 保存外部标注 id，不是无作用域的匹配键。EAF 重导入的匹配范围是文稿（经层）、层和标注 id，与现有 `findReimportUnitId` 一致。三者都对上则更新原行，否则新增。同一标注 id 落在另一层时新增行，不更新原行。其他交换格式继续用 ADR-0037 自己的匹配规则。不另建通用身份表。损失清单仍是导入的返回值，不建表。

17. 三个记录各管一件事。内容行上的 `provenance_json` 记录这一行怎样产生、怎样审校，形状用现有 `ProvenanceEnvelope`；有对应运行时，`params.modelRunId` 指向该运行。`model_runs` 记录一次运行，包括失败、取消和零产出。字段沿用 ADR-0057 第 8 条，单库不再存 `textId`。`ai_tasks` 只保存需要恢复的执行状态，不是运行记录，也不是语言真值。

18. 不建语料表、分析节点表、义项表、形式表、关系表、时间槽表、锚点表、OLAC／IMDI 表，也不把 `textId` 加回各表。语料查询读语段、转写正文、线性投影和词义链接。删除周期的列仍只按 ADR-0087 进入 `manuscripts` 和 `media`。车道锁定若仍要保留，另写决定，不塞进 `settings_json`。

## 影响

- M1 仍只证明文稿、层、语段和转写正文的创建、读回和中途失败回滚。
- 实现某一片时，把该片用到的列加进唯一的 `schema.ts`，重建合成库。打开列或约束对不上的文件直接拒绝。
- 验收至少覆盖这些状态变化，而不只是首次写入后重开：修改已有分析；转写正文改变后旧分析变为待复核；删除仍被引用的义项被拒绝；接受基线已过期的候选被拒绝；使用内置模板时先产生项目行；零产出的模型运行仍有 `model_runs` 行；不同层使用相同外部标注 id 时重导入不串行。

## 被放弃的备选方案

1. 用 `tokens` / `morphemes` 父子表代替分析图，或只在接受候选时整表删除再插入。
2. 把 DMLex 拆成义项、形式、关系子表，或把 Jieyu 扩展写进 `entry_json`。
3. 层的外键直接指向代码模板或裸 ISO 代码。
4. 用 `provenance_json` 或 `ai_tasks` 代替 `model_runs`，或把图分析候选和转写候选合成一种候选。
5. 用单独的 `external_ref` 作为重导入匹配键。
6. 用 `ON DELETE CASCADE` 决定链接、备注和候选的去留。
7. 把 `usage_count` 当成当前引用数存下来。
8. 照搬 ELAN 时间槽、Xigt／LAF 的第二套图，或 CLDF 表作为活存储。
