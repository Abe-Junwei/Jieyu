---
title: ADR 0071 - 说话人分配写项目名单和文稿语段
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-22
source_of_truth: decision-record
depends_on:
  - ./0048-storage-port.md
  - ./0060-card-file-ownership-and-operations.md
  - ./0061-jyd-manuscript-file-audio-stays-plain.md
  - ./0070-definition-copy-stays-language-orthography-speaker.md
---

# ADR 0071：说话人分配写项目名单和文稿语段

## 状态

accepted。#275 的存储接口开始写项目文件夹。本篇不改已接受 ADR 的正文。

## 背景

Dexie 里一次说话人分配同时改说话人行、语段行和项目上的说话人名单。桌面上说话人档案在项目库，语段在 `.jyd`。这两个文件不能合成一个 SQLite 事务。语段行还没有记下它是句段还是语段，项目行也还没有这份名单。

## 决策

1. 项目库 `project.speaker_ids_json` 是说话人 id 的 JSON 数组，和 `texts.metadata.projectSpeakerIds` 是同一份名单。这一列空着表示还没有名单。
2. 项目库 `speakers.created_at` 和 `updated_at` 记下说话人行的时间。迁移没有写过的行留空。
3. `.jyd` 的 `units.unit_type` 是 `segment` 或 `unit`。迁移不知道种类时留空。分配时这一列是空的，或和调用方给的种类不一致，就拒绝，不改已经写下的行。
4. 说话人分配先检查，再写。项目库里新建说话人是一次事务。每一份被改到的 `.jyd` 各是一次事务：更新 `units.speaker_id`，并把这份文稿的说话人定义副本刷新成文稿里实际引用的说话人。名单再在项目库里提交一次。每次提交后读回。读回失败不撤销。这不是 [ADR-0060](./0060-card-file-ownership-and-operations.md) 第 4 条的操作记录。那一条只管两份文稿、文件位置或系统垃圾箱。

## 影响

- 存储接口的 SQLite 实现按这个顺序写。浏览器里的 Dexie 仍然是一次事务。
- 定义副本的范围仍是 [ADR-0070](./0070-definition-copy-stays-language-orthography-speaker.md)。这里只刷新这次写到的文稿上的说话人副本。

## 被放弃的备选方案

1. 把项目库和 `.jyd` ATTACH 成一个事务。附加库上的事务不是整体原子。
2. 把语段写进项目库，好让一次事务盖住全部分配。那和一份文稿一个 `.jyd` 相反。
3. 为说话人分配再造一种文件操作记录。现有操作记录的动作对不上这次写入。
