---
title: lexicon-sense-source-note design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-source-note-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Source Note

## 1. 成熟方案扫描 / Research

- 仓库既有：义项社会语言学注释已经是 `senses[].sociolinguisticsNote`。导入用 `senses: parsed.senses` 整段替换。保存时从 `...rest` 拆掉旧键。`parseTypedNote` 按 type 取直接子 note 的第一条有文本 form。词源来源语言是词条 `etymology.sourceLanguage`，不是这条注释。
- 同类产品：FLEx 把 Source 写成义项上的 `<note type="source">`，里面是一条 `<form>`（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)，Sense elements → Source）。它排在 Sociolinguistics Note 之后。无 type 的 General Note 这一刀跳过。Extended Note 在 FLEx LIFT 里不受支持，也不做。
- 业内：SIL LIFT 0.13 的 `<note>` 按 `type` 区分，并且挂在它所在的父元素上。同一义项里每种 type 只取第一条有文本的 form。
- 公认不可行：把这条注释写进社会语言学注释、词源来源语言或词条 `notes`；读取词条上的同名 note；把无 type 的 General Note 当来源注释；为这一条文本新开 Dexie 版本。
- 潜在的坑：保存时若不从 `...rest` 拆掉旧键，清空后字符串还在。没有 `lang` 的 form 会被跳过。导入省略该 note 时义项数组会被整段替换。`type="source"` 必须按属性精确匹配，不能吃进例证的 source 文本。
- 决定：**复用** 义项 JSON 与 `parseTypedNote`。`sourceNote` 是该义项第一条非空 form 文本。空白省略键。出站 lang 固定 `und`，紧跟社会语言学注释、位于子义项之前。忽略词条级 `type="source"`。无新 flag，无新 Dexie 版本，无新 controller。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + 义项列表的一个标量字段
- 拒绝：新 controller；词条级注释；词源来源语言；无 type 的 General Note；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略义项 `sourceNote` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 义项 `type="source"` |
| `LexiconEntryEditForm.tsx` / `LexiconSenseList.tsx` | 输入与义项列表 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 没有 `lang` 的 form 仍被 `formPairs` 跳过。
- 再次导入省略该 note 时，注释随 `senses` 整段替换而消失，社会语言学注释仍按同一规则重读。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
