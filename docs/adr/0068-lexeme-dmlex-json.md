---
title: ADR 0068 - 词条 DMLex 正文是词条行上的一段 JSON
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-21
source_of_truth: decision-record
depends_on:
  - ./0035-lexicon-edit-baseline-dmlex.md
  - ./0061-jyd-manuscript-file-audio-stays-plain.md
---

# ADR 0068：词条 DMLex 正文是词条行上的一段 JSON

## 状态

accepted。#275 定下的下一块列形状。本篇不改已接受 ADR 的正文。词条编辑基准仍是 [ADR-0035](./0035-lexicon-edit-baseline-dmlex.md)。

## 背景

词条行已经记下 id、项目、词头、种类、使用次数和访问权限。义项、关系和形式在 DMLex 正文里，不在这些标量上。ADR-0035 把正文定为 DMLex JSON，不另做一套对象。

## 决策

1. 正文在项目库的 `lexemes` 行上，不进 `.jyd`，不进定义副本。文稿仍只存词条 id。
2. `kind` 不是 `resource` 时，正文列是 `entry_json`。`kind` 是 `resource` 时，正文列是 `resource_json`。另一列不写。
3. 列的值是 JSON 对象。项目库不把义项、关系、形式拆成表。完整 DMLex schema 仍由现有词条校验负责，写文件这一步只要求它是对象。
4. 正文不是对象，或种类和正文对不上时，丢掉这篇正文并记下，词条行留下。

## 影响

- 存储接口的 SQLite 实现沿用这两列。
- 词条要不要进定义副本，仍未定。本篇只定正文放哪。

## 被放弃的备选方案

1. 把义项、关系、形式拆成子表。那是第二套模型和 ADR-0035 的 JSON 正文并行。
2. 在写文件时再实现一遍 DMLex schema。校验已经在词条写入路径上。
3. 正文不合法就丢掉整条词条。词头已经能读回。
