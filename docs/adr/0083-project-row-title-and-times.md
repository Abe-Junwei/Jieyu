---
title: ADR 0083 - 项目行的标题和时间
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-25
source_of_truth: decision-record
depends_on:
  - ./0048-storage-port.md
  - ./0061-jyd-manuscript-file-audio-stays-plain.md
  - ./0081-agent-artifact-created-at.md
  - ./0082-foreign-layer-text-id.md
---

# ADR 0083：项目行的标题和时间

## 状态

accepted。用户 2026-10-25 接受了这一条。#275 的存储接口继续写 SQLite。本篇不改已接受 ADR 的正文。

## 背景

浏览器里的项目是 `TextDocType`：多语言 `title`，以及 `createdAt`、`updatedAt`。项目库的 `project` 行只有 `id`、`name`、`speaker_ids_json`。`name` 是显示名，不是多语言标题。

## 决策

1. 在项目库 `project` 上加可空的 `title_json`、`created_at`、`updated_at`。只改迁移脚本的 `CREATE`。迁移的 `INSERT` 和 `SELECT` 不碰这三列。已有的项目库不加列。
2. 这一刀只实现 `readProject`。查询编号先去掉空白。去掉后是空的，返回 `undefined`。调用前必须已经打开项目文件夹，空编号也不例外。
3. 找不到的编号返回 `undefined`。找到的行要有能解析成字符串映射的 `title_json`，以及 `Date.parse` 能接受的 `created_at` 和 `updated_at`。缺一列、`NULL`、空字符串、解析失败或标题值不是字符串，都抛 `project row is incomplete`。
4. 不读 `name`，不把它写成标题，也不用当前时间或另一列补时间。不返回 `metadata`。
5. 没有这三列的旧库，非空查询整次拒绝，抛 `project row is incomplete`。编号不存在也一样。不补列。

## 影响

- 存储接口的 SQLite 实现按这个规则读。浏览器里的 Dexie 不改。开关默认关。
- 字符变体、缩写和词类仍走 Dexie，直到调用方迁到存储接口。
- 其余还没实现的存储方法仍拒绝。

## 被放弃的备选方案

1. 把 `name` 当成标题，或装成 `{ und: name }`。那会编出一份多语言标题。
2. 用当前时间，或用另一列，补上空的创建时间或更新时间。
3. 打开旧库时 `ALTER TABLE`。没有这三列的旧文件，非空查询直接失败。
4. 这一刀加上 `metadata_json`，或把 `speaker_ids_json` 装进 `metadata`。调用方要的是整份元数据，半份会把缩写和词类读成没有。
5. 顺手实现 `patchProjectMetadata`。写入还没有列合同。
