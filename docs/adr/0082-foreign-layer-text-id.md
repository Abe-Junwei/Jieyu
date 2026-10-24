---
title: ADR 0082 - 另一项目的层用文稿上的项目编号
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-24
source_of_truth: decision-record
depends_on:
  - ./0048-storage-port.md
  - ./0061-jyd-manuscript-file-audio-stays-plain.md
  - ./0080-conversations-stay-in-project-library.md
  - ./0081-agent-artifact-created-at.md
---

# ADR 0082：另一项目的层用文稿上的项目编号

## 状态

accepted。用户 2026-10-24 接受了剩余方法草稿里的这一条。#275 的存储接口继续写 SQLite。本篇不改已接受 ADR 的正文。

## 背景

浏览器里，层的项目编号在 `tier_definitions.textId`。`.jyd` 的 `layers` 原来只有 `id`、`key`、`language_id`、`orthography_id`。`meta.id` 是文稿编号，一个项目文件夹可以有多份文稿。

## 决策

1. 在 `.jyd` 的 `layers` 上加可空的 `text_id`。只改迁移脚本的 `CREATE`。迁移的 `INSERT` 和 `SELECT` 不碰这列。已有的文稿文件不加列。
2. 这一刀只实现 `listForeignOwnedLayers`。返回 `{ id, textId }`。不读层定义的其余字段。
3. 要查的编号先去掉空白，空编号丢掉，再去重。一个都不剩就返回空列表，不打开文稿。调用前必须已经打开项目文件夹，空编号也不例外。
4. 找不到的编号跳过。找到的行如果 `text_id` 去掉空白后不是非空字符串，抛 `layer row is incomplete`。`NULL`、空字符串和纯空白都拒绝。不用 `meta.id` 或 `project.id` 补上。
5. 比较时，库里的 `text_id` 去掉空白，传入的项目编号保持原样。返回的 `textId` 是去掉空白后的值。
6. 同一个层编号出现在两份文稿里，抛 `duplicate layer ${id} in project folder`，行留下。归属相同也拒绝。
7. 文稿没有 `text_id` 这一列时，非空查询整次拒绝，抛 `layer row is incomplete`。编号不存在也一样。不返回已经收集的部分结果，不补列，不跳过旧文件，不改用别的列。空编号查询仍按第 3 条返回，不打开文稿。

## 影响

- 存储接口的 SQLite 实现按这个规则读。浏览器里的 Dexie 不改。开关默认关。
- 这一条和已经落地的语段不同：语段上空的 `text_id` 不算另一项目。层上没有项目编号时，不能把它当成当前项目。
- 其余还没实现的存储方法仍拒绝。

## 被放弃的备选方案

1. 用 `meta.id` 当层的项目编号。那是文稿编号。
2. 用文件夹里 `project.id` 当每一层的项目编号。同一份文稿里的语段可以带着另一个 `text_id`。
3. 把空的 `text_id` 当成另一项目，或当成当前项目。前者编出不存在的编号，后者和协作检查要的失败方向相反。
4. 打开旧库时 `ALTER TABLE`。没有这列的旧文件，非空查询直接失败。
5. 顺手实现 `readTierDefinition` 或 `listTierIdsByContentLanguage`。现有列没有内容类型和名称。
