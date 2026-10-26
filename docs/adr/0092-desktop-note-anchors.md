---
title: ADR 0092 - 新库旁注锚点
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-26
source_of_truth: decision-record
depends_on:
  - ./0085-desktop-project-one-sqlite.md
  - ./0091-field-revisions-diagnostic-delivery-and-later-milestones.md
---

# ADR 0092：新库旁注锚点

## 状态

accepted。用户 2026-10-26 确认八类锚点和三条生命周期。本篇取代 [ADR-0091](./0091-field-revisions-diagnostic-delivery-and-later-milestones.md) 第 3 条里「九类旧目标决定新表锚点种类」以及「恢复时按后来编辑决定是否回写正文」的做法。ADR-0091 的其余条款仍然有效。旧 `targetType` 只在以后导入时对照，不决定这张表的形状。

## 背景

新库已经有项目、文稿、层、语段、正文行、词投影、词素投影和分析图。旁注若沿用旧库的九类目标，会把时间轴、波形、单元格写成并不存在的对象。图节点 id 只在一个语段的图里唯一。投影行 id 才是词和词素的行身份。

ELAN 的评论可以指向时间片和层，父标注引用是另一种机制，不能概括成一律用 `ANNOTATION_ID`。FLEx 的 LIFT 说明把 sense id 定义为项目内唯一。本库的义项备注按 `(lexeme_id, sense_id)` 留在该词条的 `jieyu_json.anchoredNotes`。

## 决策

1. **旁注只挂本库已有对象。** 锚点是 `project`、`manuscript`、`layer`、`unit`、`unit_text`、`token`、`morpheme`、`analysis_node`。每一类只填自己的身份列和创建时核对过的归属列。`view` 只属于 `unit`，值为空、`timeline` 或 `waveform`。不给 `(unit_id, view)` 加唯一约束。层类型为 note 的正文仍在 `unit_texts`。词条和义项备注不进 `notes`。
2. **局部身份贯穿查询、脱离和恢复。** `token` 和 `morpheme` 用投影行 id。`analysis_node` 的身份始终是 `(unit_id, node_id)`。`morpheme.token_id` 在创建时核验并保存。列表、快照、卸下和恢复都带上语段。三类都进入分析关联的保存、脱离和恢复。
3. **目标被物理删除时，同一事务把直接指向它、以及随之删除的对象上的旁注标为 `detached`。** 保留原身份、创建时归属、正文和分类。文稿标记删除不删旁注。最终清除按保存的 `manuscript_id` 在同一事务删除，包括已经脱离的行。清理和展示不反查已经消失的目标。恢复重新附着时仍核验目标身份与归属；对不上就保持脱离。
4. **已有备注行恢复时不写正文和分类。** 快照正文只供查看。分析恢复不插入缺失行，因此用户删掉的旁注不会被复活。

不兼容的旧文件只拒绝，原文件字节保持不变。

## 被放弃的备选方案

1. 用一个 `target_id` 兼代全部对象。
2. 把时间轴和波形做成锚点种类。
3. 用 `updated_at` 区分用户编辑和脱离，并据此回写正文。
4. 分析恢复时按快照补回已经不在表里的备注。
