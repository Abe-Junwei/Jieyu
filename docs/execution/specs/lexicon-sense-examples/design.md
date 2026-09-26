---
title: lexicon-sense-examples design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-sense-examples-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Examples

## 1. 成熟方案扫描 / Research

- 仓库既有：`Sense` 有 gloss / definition / category / parentId，没有例证。`LexemeDocType.examples?: string[]` 在词条上，界面和 LIFT 都没读写它。保存路径在 `applyLexiconEntryFields`。
- 同类产品：FLEx / WeSay 把例证放在义项下。一句白话原文，外加分析语言译文。书目来源是另一个 `<source>` 元素（[LIFT](https://github.com/sillsdev/lift-standard)）。
- 业内：SIL LIFT 0.13 的 `<example>` 含 `<form><text>`，可选 `<translation><form><text>`。DMLex 的 example 模块是另一套交换模型，不拿来当这一刀的编辑模型。
- 公认不可行：把 `examples: string[]` 当成义项例证；把书目 `<source>` 写进原文字段；为多条译文或语言码再加表。
- 潜在的坑：保存时若展开旧义项，用户删掉例证后旧数组还会留着。`form` 没有 `lang` 时现有入站会跳过该 form。
- 决定：**复用** 义项 JSON。`examples` 为 `{ source, translation? }[]`。`source` 是例句原文。空原文丢弃该行；空译文省略键。出站/入站只带第一条译文的文本，不存 lang。词条级 `examples` 原样保留。无新 flag。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + edit controller 字段
- 拒绝：新 controller；改词条级 `examples`；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `db/types.ts` / `schemas.ts` | 义项 `examples` |
| `saveLexiconEntry.ts` | 写入或省略 |
| `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | `<example>` |
| form + controller + `LexiconPage.tsx` | 输入与列表 |

## 4. ADR 引用

- 无新 ADR。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空原文的行不写入。空译文省略 `translation`。
- 词条级 `examples: string[]` 不因这次保存消失。
- 入站忽略 `<example><source>` 书目，只读 `<form>` 与第一条 `<translation>`。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save / LexiconPage / LIFT | pass |
| typecheck | `npm run typecheck` | 0 errors |
