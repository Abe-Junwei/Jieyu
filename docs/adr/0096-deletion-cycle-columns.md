---
title: ADR 0096 - 删除周期列
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-27
source_of_truth: decision-record
depends_on:
  - ./0087-project-deletion-retention-and-media-cleanup.md
---

# ADR 0096：删除周期列

## 状态

accepted。用户 2026-10-27 确认本篇列名。这是 ADR-0087 推迟到实施前的结构设计。文稿删除、恢复和录音连带删除已经写入。提醒展示、删除界面和垃圾箱仍不开放。

## 背景

ADR-0087 已经定了行为：删除后保留 90 天；用户真正看到该对象的提醒之后再留 7 天；两者取较晚者才可以清除；没看过提醒就不清除。录音连带删除只延长文稿期限，不缩短。恢复清掉这一周期。列名当时没有定，规格里的“不得早于的清除期限”和“本周期提醒展示时点”仍是提案。

## 决策

1. **文稿和录音各用三列表示一个删除周期。** `manuscripts` 已有 `deleted_at`。本篇为它补上 `retain_until` 和 `reminder_shown_at`。`media` 补上 `deleted_at`、`retain_until`、`reminder_shown_at`。三列都是文本时间，空值用 `NULL`。不另建 `purge_after`。90 天和 7 天是代码里的规则，测试可以换时钟，不做成列。
2. **空值。** `retain_until` 与 `deleted_at` 同空同有。`reminder_shown_at` 只有在 `deleted_at` 非空时才能有值。录音的三列遵守同一规则。恢复时，该对象的这三列一起清空。
3. **何时可清除由这三列算出，不存结果。** `reminder_shown_at` 为空则不可清除。否则最早清除时刻是 `retain_until` 与 `reminder_shown_at` 加 7 天里较晚的那个。同一周期里再次看到提醒，不把 `reminder_shown_at` 改晚，也不改早。
4. **标记删除写满这一周期。** 删除文稿时，`deleted_at` 是当时，`retain_until` 是当时加 90 天，`reminder_shown_at` 为空，`lifecycle_generation` 仍加一。再次删除使用新的 `deleted_at`，并清空上一周期的提醒。
5. **录音连带在同一次事务里延长，不缩短。** 删除录音时写下录音自己的三列，并把引用它的文稿的 `retain_until` 抬到不早于该录音的 `retain_until`。原来更晚的文稿期限保持不变。不改未引用该录音的文稿。
6. **恢复一份文稿时，同事务取消录音的待清除。** 清空该文稿的三列，并清空其录音的三列。其他文稿仍保持已删除，各自的 `retain_until` 不变。只恢复录音时，只清空录音的三列，不恢复文稿。

垃圾箱操作记录的列仍不在本篇。不兼容的旧项目文件在真正加列时只拒绝，不迁移。

## 被放弃的备选方案

1. 只存一个算好的 `purge_after`。提醒被看到之后，这个值必须改写，和“没看过就不清除”拆不开。
2. 把 90 天和 7 天存进每一行。规则变了就会和已存的期限互相矛盾。
3. 文稿和录音共用一个周期行。一份录音被多份文稿引用时，恢复一份文稿必须能单独取消录音的待清除，同时留下其他文稿自己的期限。
