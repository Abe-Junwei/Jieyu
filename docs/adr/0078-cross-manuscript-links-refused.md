---
title: ADR 0078 - 跨文稿关系不写入
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-22
source_of_truth: decision-record
depends_on:
  - ./0061-jyd-manuscript-file-audio-stays-plain.md
  - ./0062-desktop-storage-decisions-2026-10-16.md
---

# ADR 0078：跨文稿关系不写入

## 状态

accepted。#275 的存储接口继续写 SQLite。本篇不改已接受 ADR 的正文。

## 背景

父子链接不能跨文稿（ADR-0061）。其他 `unit_relations` 也不行（ADR-0062 第 4 条）。文件夹里的关系行只有编号、两端语段和关系类型。浏览器库里已有的关系写入不经过文稿文件，这一刀不改那条路径。

## 决策

1. 写下一条语段关系，或改一个语段的父语段，都只动一份 `.jyd`，一次事务。只扫项目目录，不进子目录。
2. 关系编号去掉空白后是空的，就不写。关系类型只收 `aligned_to`、`derived_from`、`linked_reference`。分析图正文不在这一行里。
3. 两端语段必须都在同一份 `.jyd`。有一端找不到、两端分属两份文稿、或同一编号的语段出现在两份文稿里，就不写。已有的关系行若在另一份文稿里，也不改。
4. 父语段同样必须在同一份文稿里。找不到，或在另一份文稿里，就不改原来的 `parent_unit_id`。空编号是摘掉父语段。
5. 提交后读回这一行。读回失败不撤销。

## 影响

- 存储接口的 SQLite 实现按这个规则写。浏览器里的 Dexie 仍走原来的关系写入；新方法在那边拒绝，不写。
- 桌面壳换成这个实现仍是下一刀。

## 被放弃的备选方案

1. 把跨文稿的关系写进项目库。ADR-0062 第 4 条是不存，不是换个库。
2. 为了存分析图，给 `unit_relations` 加列。正文还没定进这一行。
3. 改浏览器里已有的关系写入。那边没有 `.jyd`，这一刀不迁那些调用。
