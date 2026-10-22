---
title: ADR 0069 - 结构规则、正字法转换和车道锁定的正文是 JSON
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-21
source_of_truth: decision-record
depends_on:
  - ./0061-jyd-manuscript-file-audio-stays-plain.md
  - ./0068-lexeme-dmlex-json.md
---

# ADR 0069：结构规则、正字法转换和车道锁定的正文是 JSON

## 状态

accepted。#275 定下的下一块列形状。本篇不改已接受 ADR 的正文。

## 背景

结构规则行、正字法转换行和轨道行已经记下标量。规则正文、转换规则与样例、车道锁定表还在行外。这三块都是一份文档，不是要再拆开的关系。

## 决策

1. 结构规则正文在项目库 `structural_rule_profiles.profile_json`。值是 JSON 对象。完整 schema 仍由 `structuralRuleProfileSchema` 负责，写文件这一步只要求它是对象。没有正文就留空。正文不是对象时丢掉这一列并记下，规则行留下。不进 `.jyd`，不进定义副本。
2. 正字法转换的多语名称、规则、样例和备注在项目库 `orthography_bridges` 行上：`name_json`、`rules_json`、`sample_input`、`sample_output`、`sample_cases_json`、`notes_json`。名称和备注是字符串到字符串的映射，空映射可写。规则只收 `mappings`（`from` / `to` 字符串，空串可写）、`ruleText`、`normalizeInput` / `normalizeOutput`（`NFC`、`NFD`、`NFKC`、`NFKD`）和 `caseSensitive`。样例是 `{ input, expectedOutput? }` 的数组。多出来的键或对不上的类型丢掉这一列并记下，转换行留下。不进定义副本。
3. 车道锁定表在 `.jyd` 的 `track_entities.lane_lock_json`。值是 JSON 对象，每个值是有限数字，空对象可写。对不上时丢掉这一列并记下，轨道行留下。不进项目库，不进定义副本。

## 影响

- 存储接口的 SQLite 实现沿用这些列。
- 词条、标签、自定义字段、缩写要不要进定义副本，仍未定。本篇只定这三块正文放哪。

## 被放弃的备选方案

1. 把规则符号、转换对照和车道号拆成子表。那是第二套模型，和现有文档正文并行。
2. 在写文件时再实现一遍结构规则 schema。校验已经在结构规则写入路径上。
3. 正文不合法就丢掉整行。标量已经能读回。
