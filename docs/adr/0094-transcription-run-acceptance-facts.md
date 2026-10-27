---
title: ADR 0094 - 转写运行与接受事实
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-27
source_of_truth: decision-record
depends_on:
  - ./0057-model-interface-transcribe.md
  - ./0088-desktop-sqlite-domain-landings.md
  - ./0091-field-revisions-diagnostic-delivery-and-later-milestones.md
---

# ADR 0094：转写运行与接受事实

## 状态

accepted。用户 2026-10-27 确认第一刀只落运行记录、预览凭据和接受事实。模型宿主、候选面板和真正的采纳入口不在本篇开工。ADR-0057 第 8、9 条和 ADR-0091 第 4 条的其余规则继续有效。本篇补上桌面库还没有的列和状态。

## 背景

ADR-0057 把每次转写运行记在 `model_runs`，待审正文不落库，接受用已有 `provenance.params.modelRunId`。ADR-0088 规定单库不再存 `textId`，运行记录、内容行来源和可恢复任务分开。ADR-0091 要求接受认预览凭据，并在一次项目事务里写入正文、位置、来源、计数和一条不含待审正文的接受事实。

当前 `schema.ts` 没有 `model_runs`。转写正文在 `unit_texts`，这行没有来源列。`manuscripts.generation` 会随普通正文编辑增加，不能当作启动时抄下的生命周期凭据。文稿删除门禁还没落地，所以只核对当前 `manuscripts.generation` 不是完整采纳保护。

## 决策

1. **运行行单独成表。** `model_runs` 保存模型身份、文稿、该文稿的录音、目标转写层、输入范围、参数、起止时间和状态。不存 `textId`。状态是 `running | ok | error | cancelled | interrupted`。计数是 `accepted_count`、`rejected_count`、`pending_count`、`abandoned_count`，都非负。零产出是 `ok` 且计数为 0。失败、取消和中断都保留运行行。`capability` 仍只有 `transcribe`。
2. **生命周期凭据独立于内容代际。** `manuscripts.lifecycle_generation` 只留给以后的删除和恢复去增加。普通正文编辑不加它。运行启动时把当时的值抄到运行行。接受时两者不一致就拒绝，已写的正文和接受事实保持原样。这一刀不把删除门禁标成已落地。
3. **预览只把计数写入运行行。** 候选身份是 `块序号:段序号`，序号由解语编排，不含时间映射修订。预览按当前映射把媒体秒换成文稿秒，并带回映射修订和目标范围内已有转写的指纹。这些凭据留在调用方内存里。`pending_count` 改成这次预览的条数，不把被替换的条数记入放弃。映射变了，或指纹对不上，接受就拒绝。
4. **接受是一次项目事务。** 只接受 `ok` 且仍有待审计数的运行。事务内核对生命周期、映射修订和目标指纹，重算文稿秒，拒绝目标层上与该区间重叠的已有转写，不静默覆盖，也不在这一刀并排安放。然后写入语段、`unit_texts.body`、`unit_texts.provenance_json` 和一条接受事实，并增加接受数、减少待审数。来源形状沿用现有信封，`params.modelRunId` 指向该运行，逐条接受的 `reviewStatus` 为 `confirmed`。任一步失败则整笔回滚。
5. **接受事实有两把唯一键，且不含候选正文。** `operation_id` 唯一。`(run_id, candidate_id)` 唯一。调用方预先生成操作编号。按编号查到行就只读；查不到表示那次事务没提交，之后可以用新编号再接受尚未提交的候选。已经提交的候选，换编号再写会被第二把键拒绝。
6. **崩溃和关掉面板只改计数。** 仍为 `running` 的运行改为 `interrupted`，写下结束时间，把 `pending_count` 加进 `abandoned_count` 后清零，不加进 `rejected_count`。已经 `ok` 的运行在面板关闭时同样把待审数记为放弃，状态保持 `ok`。内存里的候选正文不写入运行记录、诊断或快照。

不兼容的旧文件只拒绝。接入真正采纳入口时，删除和恢复必须已经会推进 `lifecycle_generation`，并且正文来源列已经在这条写入路径上。

## 被放弃的备选方案

1. 用 `manuscripts.generation` 充当生命周期凭据。
2. 把待审正文写入运行行或接受事实。
3. 把中断并进 `cancelled`，或把放弃数并进 `rejected_count`。
4. 用 `analysis_candidates`、`ai_tasks` 或 `source_records` 代替 `model_runs`。
5. 在候选身份里放上时间映射修订。
