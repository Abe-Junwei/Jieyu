---
title: ADR 0126 - v29 一次写入层外观、分轨锁定、口译附件与层软删
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-19
source_of_truth: decision-record
depends_on:
  - ./0086-desktop-release-scope-and-format-freeze.md
  - ./0095-attachment-file-publish-and-cleanup.md
  - ./0100-desktop-engineering-contract.md
  - ./0122-integer-milliseconds-and-optional-media.md
---

# ADR 0126：v29 一次写入层外观、分轨锁定、口译附件与层软删

## 背景

[ADR-0122](./0122-integer-milliseconds-and-optional-media.md) 已决定开发格式改为 `user_version` 29，并写明不写迁移器。2026-11-19 排期审查又把转写切片 1b 后面才会用到的列放进同一次建表，避免每片再升一次 `user_version`、合成库反复作废。

这些列当时不在 ADR-0122 的决定列表里。E06 已要求层可 90 天软删、同层不同说话人可以重叠；ADR-0086 禁止把分轨锁定塞进 `settings_json`；ADR-0095 已规定附件字节按 SHA-256 落在项目文件夹。

## 决定

1. **下列结构与 ADR-0122 的毫秒列同一次进入 `user_version` 29。** 不另升版本，不写迁移器。不是 29 的库仍拒绝且不改字节。
2. **`units` 增加** `sort_order`（ADR-0122）、`skip_processing`（0／1）、机器 `confidence`（0 到 1，可空）、`self_certainty`（`not_understood`／`uncertain`／`certain`，可空）。
3. **`layers` 增加** `modality`（`text`／`audio`／`mixed`）、`lane_height`、`display_font`，以及与文稿相同的 `deleted_at`／`retain_until`／`reminder_shown_at`。删除语义沿 ADR-0100 E06，不在本篇重写。`content_type` 增加 `point`。没挂录音的文稿不能新建点层；解除录音关联后已有点保留。
4. **分轨锁定进 `layer_lane_locks(layer_id, speaker_id, lane_index)`。** 同一层一个说话人一行，同一层的行号不重复。不进 `project.settings_json`。
5. **口译短录音复用 `attachment_files`。** `unit_texts.audio_file_id` 可空，指向已发布的附件。字节仍在 `attachments/objects/<sha256>`，不进顶层 `media` 表，不进 SQLite。
6. **拆合映射表 `unit_span_maps` 只存** `operation_id`、`kind`（`split`／`merge`）、`old_id`、`new_id`、`created_at`。旧 id 与新 id 都不设外键。
7. **同层重叠。** 同一层里，说话人相同，或两边都没有说话人，区间不得重叠，边界可以相接。说话人不同的区间可以重叠。有时间的句段，开始时刻的先后必须和 `sort_order` 一致。这两条由写入触发器检查。
8. **合并正文分隔符**是 `project.settings_json` 的 `mergeSeparator`。只放行这一个新键，不借此写入分轨锁定或会话记忆。

## 未选方案

- **每片改表再升 `user_version`**：冻结规则会把刚建的合成库判为旧库。
- **分轨锁定放 `settings_json` 或本机 localStorage**：前者违反 ADR-0086；后者不进项目备份，换机器就丢。
- **口译短录音写进顶层 `media`**：和文稿主录音、90 天录音回收站混在一张表里。
- **同层不论说话人一律禁止重叠**：和 E06「不同说话人允许合法重叠」冲突，多说话人重叠只能再拆层。

## 影响

- DDL 在 `src/db/desktop/schema.ts`，冻结记录在 `src/db/desktop/formatFreeze.record.json`。
- 层的改名、排序、软删、分轨锁定写入在层结构与分轨小片，不在本篇。
- 口译录音和语音转文字的界面在口译轨小片。转写文本仍先作候选，云端授权沿 ADR-0100 E11。
