---
title: lexicon-sense-scientific-name design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-sense-scientific-name-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Scientific Name

## 1. 成熟方案扫描 / Research

- 仓库既有：义项词类已经写在 `senses[].category`，入站读 `grammatical-info`。`parseFieldText` 已按 field type 取第一条有 `lang` 的 form。保存空白时从 `...rest` 拆掉旧键。导入用 `senses: parsed.senses` 整段替换，和词类一样，省略不会像词条级标量那样保留旧值。
- 同类产品：FLEx 把 Scientific Name 写成义项上的 `<field type="scientific-name">`，里面是一条 `<form>`（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)）。它排在义项例证附近、子义项之前。词条级同名 field 不是这一栏。
- 业内：SIL LIFT 0.13 的 `<field>` 按 `type` 区分，并且挂在它所在的父元素上。同一义项里每种 type 只取第一条有文本的 form。
- 公认不可行：把学名写成词条级字符串；读取词条上的同名 field；把交叉引用或 import residue 当成下一条文本；为这一条文本新开 Dexie 版本。
- 潜在的坑：保存时若不从主义项和额外义项的 `...rest` 拆掉旧键，清空后字符串还在。`form` 没有 `lang` 时现有入站会跳过。导入省略该 field 时不能承诺保留已有学名，因为义项数组会被整段替换。
- 决定：**复用** 义项 JSON 与 `parseFieldText`。`scientificName` 是该义项第一条非空 form 文本。空白省略键。出站在该义项内写一个 field，lang 固定 `und`，紧跟例证、位于子义项之前。忽略词条级 `scientific-name`。无新 flag，无新 Dexie 版本，无新 controller。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + 义项列表的一个标量字段
- 拒绝：新 controller；词条级学名；交叉引用；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略义项 `scientificName` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 义项 `type="scientific-name"` |
| `LexiconEntryEditForm.tsx` / `LexiconPage.tsx` | 输入与义项列表 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 没有 `lang` 的 form 仍被 `formPairs` 跳过。
- 再次导入省略该 field 时，学名随 `senses` 整段替换而消失，词类仍按同一规则重读。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
