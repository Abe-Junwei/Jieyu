---
title: ADR 0074 - 来源记录写在项目库
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-22
source_of_truth: decision-record
depends_on:
  - ./0048-storage-port.md
  - ./0061-jyd-manuscript-file-audio-stays-plain.md
  - ./0070-definition-copy-stays-language-orthography-speaker.md
---

# ADR 0074：来源记录写在项目库

## 状态

accepted。#275 的存储接口继续写项目库。本篇不改已接受 ADR 的正文。

## 背景

来源记录已经在项目库里有编号、项目、原始名、显示名、格式和可选的录音编号。存储接口还要按项目列出，并在重新导入、改名、解开录音关联之后读回。字节大小、内容哈希、外部文档编号、导入时间、批次、是否保存原件、原件里的录音文件名和更新时间，这几列还没有。

## 决策

1. 项目库 `source_records` 增加 `byte_size`、`sha256`、`external_doc_id`、`imported_at`、`import_batch_id`、`stored_bytes`、`linked_media_filename`、`updated_at`。迁移没写过的格子留空。不进 `.jyd`，不进定义副本。
2. 列出、登记、改名、解开关联都只动这一份项目库。登记时项目行不存在就拒绝，不写。同一项目里，外部文档编号对上就更新那一行并保留显示名；否则内容哈希对上就不写新行；都对不上就新开一行，显示名在项目内不分大小写地错开。
3. 新行的 `stored_bytes` 写成 0。这一刀不保存原件字节。
4. 调用方传来非空的录音编号就拒绝，原因是录音还不在这一刀里，并且不写。传入空编号只清掉已有的 `media_id`。录音属于哪个项目，留到录音那一刀。
5. 新行和更新是一次事务。提交后读回整行。读回失败不撤销。同一内容不再写一遍。

## 影响

- 存储接口的 SQLite 实现按这个顺序写。浏览器里的 Dexie 仍然是一次事务，表也不变。
- 缺导入时间、批次、`stored_bytes` 或更新时间的旧行，列表和登记会拒绝读出，不补默认值。

## 被放弃的备选方案

1. 把来源记录放进 `.jyd` 或定义副本。它跟项目走，不跟一份文稿走。
2. 在这一刀把原件字节写进库。类型上这一列表示还没保存。
3. 为了能报「录音属于另一个项目」先建一张录音表。录音放哪还没在这一刀决定。
