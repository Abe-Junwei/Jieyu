---
title: lexicon-lexeme-etymology design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-etymology-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Entry Etymology

## 1. 成熟方案扫描 / Research

- 仓库既有：`LexemeDocType` 已有发音，没有词源。保存路径在 `applyLexiconEntryFields`。LIFT 入站 `formPairs` 跳过没有 `lang` 的 `<form>`。义项 gloss 读的是 `<gloss lang><text>`，不是包在 `<form>` 里。
- 同类产品：FLEx 把 Etymology 放在词条上，可以有多条。来源词形是 `<form>`，释义是 `<gloss>`，来源语言是 `<trait name="languages" value="…">`（[FLEx Technical Notes](https://software.sil.org/fieldworks/support/technical-notes/)）。
- 业内：SIL LIFT 0.13 的 `<etymology>` 在 entry 下，可重复（[lift-standard](https://github.com/sillsdev/lift-standard)）。FLEx 从 FW 8.3 起忽略元素上的 `type` 和 `source` 属性，也不再导出它们。注释、书目、前后评注走 `<field type>`。DMLex 是另一套交换模型。
- 公认不可行：把过时的 `source` 属性当成来源语言；把注释和书目收进这一刀；用白话 `lang` 出站，让来源词形看起来像本词条正字；为多条词源或索引再升 Dexie。
- 潜在的坑：保存时若展开旧词条，用户清空词形后旧对象还会留在 `...rest`。`form` 没有 `lang` 时现有入站会跳过。导入省略该元素时不能清掉库里已有的词源。治理补充规范曾建议为词源升 Dexie 索引，这一刀只加可选 JSON，不升版本。
- 决定：**复用** 词条 JSON。只留第一条有词形的词源。`form` 必填才写入；`gloss` 与 `sourceLanguage` 空白则省略。出站 form/gloss 的 lang 固定 `und`。来源语言只读写 `languages` trait。无新 flag，无新 Dexie 版本。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + edit controller 的三个标量字段
- 拒绝：新 controller；多条词源；注释/书目；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `db/types.ts` / `schemas.ts` | 词条 `etymology` |
| `saveLexiconEntry.ts` | 写入或省略 |
| `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | `<etymology>` |
| form + controller + `LexiconPage.tsx` | 输入与概览 |

## 4. ADR 引用

- 无新 ADR。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空白词形不写入。已有 `morphemeType` 仍留在 rest。
- 入站忽略过时 `source`/`type`，以及 `<field>` 注释和书目。
- 省略 `<etymology>` 的导入保留已有词源。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save / LexiconPage / LIFT | pass |
| typecheck | `npm run typecheck` | 0 errors |
