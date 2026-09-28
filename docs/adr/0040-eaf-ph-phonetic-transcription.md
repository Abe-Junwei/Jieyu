---
title: ADR 0040 - EAF 的 ph 层是语音转写
doc_type: adr
status: active
owner: transcription
last_reviewed: 2026-09-28
source_of_truth: decision
---

# ADR 0040 — EAF 的 ph 层是语音转写

## 背景

DoReCo 的 `ph`（含 `ph@说话人`）挂在词层 `wd` 或语素层 `mb` 下，正文是音标，常见 X-SAMPA。ADR 0039 只把短语级转写写入转写页，没有对应字段的已知类型不建层。因此 `ph` 被记成 `unmapped-field`，导入后看不到。

## 决策

1. 层名按非字母切开后，有整词 `ph` 的层是语音转写。`phrase`、`phonetic` 不是这一层。
2. 非空标注写入已有的 `extraTranscriptionTiers`，成为另一条转写层。不进翻译行，不进 `unit_tokens` / `unit_morphemes`，不计丢失。
3. 每条音标保留自己的时间和标注 id。时间对齐的音标用自己的时间槽；符号依附的音标用父标注的时间。
4. 已保存的层角色仍优先。用户把这一层标成排除、备注、翻译或转写时，不改写该选择。

## 影响

- Tabaq 一类文件里，`ph@NHK` 出现在转写层列表，不再出现在丢失清单。
- 词注释、语素注释、词性、录音元数据的归类不变。

## 不采纳

- 把音标拼进句子正文，或写进词的 `form`。
- 用层名子串判断，把 `phrase` 收成语音转写。
- 为音标新增 Dexie 字段。

## 回顾

本决定只放宽 ADR 0039 第 2 条对 `ph` 的「不建层」。其余字段表继续有效。
