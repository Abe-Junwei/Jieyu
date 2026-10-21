---
title: ADR 0067 - 语言记录上的数组和备注是语言行里的 JSON
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-21
source_of_truth: decision-record
depends_on:
  - ./0061-jyd-manuscript-file-audio-stays-plain.md
  - ./0066-session-memory-payload-json.md
---

# ADR 0067：语言记录上的数组和备注是语言行里的 JSON

## 状态

accepted。#275 定下的下一块列形状。本篇不改已接受 ADR 的正文。

## 背景

语言行的标量已经在项目库里。还没写的是国家、官方使用地、使用领域、方言、口语变体、书写系统这些字符串数组，行政区划，多语备注，以及自定义字段值。它们在现有行上是数组或映射，没有自己的 id。显示名和别名已经是单独的行，因为它们有 id。

定义副本仍然只复制文稿引用到的语言 id 和名称、显示名、别名、正字法和说话人。

## 决策

1. 这些字段留在项目库的 `languages` 行上，各用一列 JSON 文本：`countries`、`countries_official`、`administrative_divisions`、`domains`、`dialects`、`vernaculars`、`writing_systems`、`notes`、`custom_fields`。不进 `.jyd`，不进定义副本。
2. 字符串数组的每一项都是字符串。使用领域只收现有枚举。行政区划每一项只含国家、省、市、县、乡、村和自由文本，值都是字符串。备注是语言标签到字符串的对象。自定义字段的值是字符串、有限数字、布尔，或字符串数组。空数组和空对象要写。
3. 某一个字段形状不对时，丢掉这个字段并记下，语言行留下。不因为一个字段丢掉整行。

## 影响

- 存储接口的 SQLite 实现沿用这些列。
- 词条、标签、自定义字段定义、缩写要不要进定义副本，仍未定。

## 被放弃的备选方案

1. 为每个数组另建子表。这些值没有自己的 id，也不是单独查询的目录。
2. 放进定义副本。副本只用于跨项目对比共用定义，这些字段不是那份副本的范围。
3. 一个字段不合法就丢掉整行语言。标量已经能读回，不该连带消失。
