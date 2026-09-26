---
title: lexicon-lexeme-summary-definition design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-summary-definition-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Entry Summary Definition

## 1. 成熟方案扫描 / Research

- 仓库既有：字面意义已经是词条上的一条字符串，入站只认 `<field type="literal-meaning">` 的第一条 form。概览渲染在 `LexiconEntryOverview`。
- 同类产品：FLEx 把 Entry Summary Definition 写成 `<field type="summary-definition">`，里面是按书写系统分开的 `<form>`（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)）。它排在 Restrictions 后面。义项定义仍是 sense 的 `<definition>`。
- 业内：SIL LIFT 0.13 的 `<field>` 按 `type` 区分。同一父元素里每种 type 只取第一条有文本的 form，和字面意义相同。
- 公认不可行：把概要定义写进字面意义或义项 definition；读取 sense 里的同名 field；为这一条文本新开 Dexie 版本。
- 潜在的坑：保存时若不从 `...rest` 拆掉旧键，清空后字符串还在。`form` 没有 `lang` 时现有入站会跳过。导入省略该 field 时不能清掉库里已有的概要定义。
- 决定：**复用** 字面意义的 field 读取。`summaryDefinition` 是词条级第一条非空 form 文本。空白省略键。出站一个 field，lang 固定 `und`，紧跟 `literal-meaning`。无新 flag，无新 Dexie 版本。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + 概览组件的一个标量字段
- 拒绝：新 controller；义项概要定义；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略 `summaryDefinition` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | `type="summary-definition"` |
| `LexiconEntryOverview.tsx` / `LexiconEntryEditForm.tsx` | 输入与概览 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 没有 `lang` 的 form 仍被 `formPairs` 跳过。
- 导入省略该 field 时保留已有值，也不清字面意义。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage + overview | pass |
| typecheck | `npm run typecheck` | 0 errors |
