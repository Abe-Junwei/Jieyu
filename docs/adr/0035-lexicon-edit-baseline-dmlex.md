---
title: ADR 0035 - 词典编辑基准采用 DMLex JSON
doc_type: adr
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: decision
---

# ADR 0035 — 词典编辑基准采用 DMLex JSON

## 背景

词典页已经按 LIFT 0.13 长出词条、义项树、义项词类、变体和一串 `note` / `trait`。这些字段没有存量词条要保留。导出接收方不是 FLEx、WeSay、Lexique Pro 或 Dictionary App Builder。标注和语料要的是：一个词头、若干义项、分析语言里的对译、能指回语段的例句，以及标注链接落到某一个义项。

DMLex 1.0 的 JSON Schema（带跨语言模块）把这组对象定义成词头、义项、词头翻译、词头解释、释义、例证、发音、屈折、标签、词源和条目间关系。官方文件在 `docs/architecture/dmlex/`。

## 决策

1. 编辑基准使用 `docs/architecture/dmlex/dmlex.schema.json` 里的 `entry`。不用 `dmlex_no-crosslingual.schema.json`。
2. 一个词条一个词头字符串，词类放在词条的 `partsOfSpeech`。同一形式有不同词类时，分成带 `homographNumber` 的多条词条，再用 `lexicographicResource.relations` 连在一起。子义项也用 relation，不在 `sense` 里嵌套。
3. 分析语言的对译写入 `sense.headwordTranslations`。与词头同语言的释义写入 `sense.definitions`。分析语言里的解释写入 `sense.headwordExplanations`。
4. Schema 禁止额外属性。语段引用和自由文本注释放在词条行旁边的解语字段，校验 DMLex 或导出 DMLex JSON 之前拿掉。
5. LIFT 0.13 保留为导入和导出投影。导入写出诊断。不保证与 FLEx 原文件逐字段相同。
6. 不新增 feature flag，不新增 Dexie 版本。库内没有需要迁移的词条。旧的 LIFT 形状编辑字段不作为第二套真值。

## 影响

- `LexemeDocType` 的 lemma / senses / forms 形状会被 `entry` 替换。标注链接要能指向 `sense.id`。
- 词头只有一个字符串，对应资源的 `langCode`。IPA 放在 `pronunciations[].transcriptions`。
- 现有 LIFT 往返测试要改成投影测试：能映射的字段恢复，不能映射的字段只出现在诊断里。

## 被放弃的备选方案

- 继续把 LIFT 元素当作编辑字段。接收方不是那四家工具，再补 FLEx 注释不会服务标注和语料。
- 内部改成 DMLex，同时把对不上的 LIFT 字段留在残留层。残留会比 DMLex 核心更大，保存和导入要维护两套真值。
- 只用无跨语言模块的 schema。解语的日常释义在分析语言里，对译是 `headwordTranslation`，不在 Core 的 `definition` 里。

## 后续回顾点

- 若出现必须无损吞进 FLEx 全量 LIFT 的接收方，再开单独投影，不把那些字段加回编辑基准。
- 实施顺序见 `docs/execution/plans/词典编辑改用DMLex基准-2026-09-27.md`。
