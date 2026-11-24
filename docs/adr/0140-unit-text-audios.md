---
title: ADR 0140 - 一句最多五条录音
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-23
source_of_truth: decision-record
depends_on:
  - ./0086-desktop-release-scope-and-format-freeze.md
  - ./0126-v29-lane-locks-oral-audio-and-layer-retention.md
---

# ADR 0140：一句最多五条录音

## 背景

合并两个口语句段时，两边的短录音都要留下。`unit_texts.audio_file_id` 一行只能挂一条。撤销还在引用这条文件时，不能把文件真删掉。

## 决定

1. **开发格式改为 `user_version` 35。** 新增 `unit_text_audios`：稳定 `id`，`unit_text_id` 外键 `ON DELETE CASCADE`，`file_id` 指向 `attachment_files`，`position` 为 1 到 5。同一正文行的 `position` 唯一，同一正文行不重复同一文件。第六条由写入拒绝。`unit_texts` 去掉 `audio_file_id`。
2. **不写迁移器。** `user_version` 不是 35 的 `project.sqlite` 以「不是解语项目库」拒绝，文件字节保持原样。34 的库打不开，也不能导出再导入。自用的 34 库删掉重建。
3. **空正文但还有录音时留住正文行。** 清空正文、撤销分析把正文撤没，只要该行还有录音，就把正文写成空串，不删行。真删句段或清稿时，先记下 `file_id`，再删正文行，由 CASCADE 删录音行，然后把不再被引用的文件排队清理。
4. **撤销账本里的文件不算可删。** 账本只在内存里。`finishAttachmentCleanup` 看到撤销或重做栈还记着该 `file_id` 时，把文件留在 `cleanup_pending`，不送进回收站。扫描待清理文件只有三处：会话结束之后、打开项目时、清空重做栈之后。账本还握着的跳过。挂上或卸下录音不再清空撤销栈，否则删句段后再卸下同一文件会把撤销还要读的录音清掉。

## 未选方案

- **给 34 的库补表。** 冻结规则是拒绝而不是改写。
- **外键改成 RESTRICT。** 删正文行时要连带删掉录音行，所以用 CASCADE。留行的是清空正文，不是删行。

## 影响

- 冻结记录换成 35 的 DDL 签名。
- 录音的写入、删除、列表、播放、转写、引用计数、句段删除与恢复、拆分、清稿和单稿导出都改读这张表。
