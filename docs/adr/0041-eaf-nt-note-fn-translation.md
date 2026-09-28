---
title: ADR 0041 - EAF 的 nt 是备注、fn 是译文
doc_type: adr
status: active
owner: transcription
last_reviewed: 2026-09-28
source_of_truth: decision
---

# ADR 0041 — EAF 的 nt 是备注、fn 是译文

## 背景

DoReCo 沿 Toolbox 的层名：`ft` 是自由翻译，`fn` 是译成国家语言的自由翻译，`nt` 是话轮备注。ADR 0038 的翻译记号有 `ft`，没有 `fn`。`nt` 也不在锚点表里，所以两条都掉进翻译行。Tabaq 的 `nt` 正文是词源和语法说明，不是译文。

## 决策

1. 层名按非字母切开后，整词 `fn` 与 `ft` 一样是翻译。两条不合并。
2. 整词 `nt` 是该句的 `user_notes`，类别 `comment`。不进翻译行，不计丢失。`<p:>` 和只含星号的占位不写入。
3. `note`、`notes` 仍是 ADR 0038 的锚点，不因本决定改成 `nt`。
4. 已保存的层角色仍优先。用户把 `nt` 标成翻译时，按该选择写入。

## 影响

- Tabaq 的 `nt@NHK` 出现在句子备注里，例如 “Sudanese Ar. yes”。`fn` 仍是单独的翻译层。
- 短语 `note`、段号和录音元数据的归类不变。

## 不采纳

- 把 `fn` 并进 `ft`，或写成备注。
- 把占位 `<p:>` 和 `****` 收成备注。
- 为备注新增字段。

## 回顾

本决定只给 ADR 0038 第 2 条的记号表补上 `fn` 和 `nt`。其余选层规则继续有效。
