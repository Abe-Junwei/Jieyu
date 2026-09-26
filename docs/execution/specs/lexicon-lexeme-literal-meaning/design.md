---
title: lexicon-lexeme-literal-meaning design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-literal-meaning-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Entry Literal Meaning

## 1. 成熟方案扫描 / Research

- 仓库既有：`LexemeDocType` 已有词源，没有字面意义。保存路径在 `applyLexiconEntryFields`。LIFT 入站 `formPairs` 跳过没有 `lang` 的 `<form>`。词条备注读的是没有 type 的 `<note>`，不读 `<field>`。
- 同类产品：FLEx 把 Literal Meaning 放在词条上，可以有多个书写系统。它存在 `<field type="literal-meaning">` 的 `<form>` 里（[FLEx Technical Notes](https://software.sil.org/fieldworks/support/technical-notes/)）。
- 业内：SIL LIFT 0.13 的 `<field>` 按 `type` 区分，同一父元素里每种 type 只出现一次（[lift-standard](https://github.com/sillsdev/lift-standard)）。DMLex 是另一套交换模型。
- 公认不可行：把任意 `<field>` 都当成字面意义；把字面意义写进备注；用白话 `lang` 出站，让分析语言的字面意义看起来像本词条正字。
- 潜在的坑：保存时若展开旧词条，用户清空后旧字符串还会留在 `...rest`。`form` 没有 `lang` 时现有入站会跳过。导入省略该 field 时不能清掉库里已有的字面意义。
- 决定：**复用** 词条 JSON。`literalMeaning` 是第一条非空 form 文本。空白省略键。出站一个 field，lang 固定 `und`。入站只认 `type="literal-meaning"`。无新 flag，无新 Dexie 版本。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + edit controller 的一个标量字段
- 拒绝：新 controller；其他 field 类型；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `db/types.ts` / `schemas.ts` | 词条 `literalMeaning` |
| `saveLexiconEntry.ts` | 写入或省略 |
| `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | `<field type="literal-meaning">` |
| form + controller + `LexiconPage.tsx` | 输入与概览 |

## 4. ADR 引用

- 无新 ADR。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空白不写入。已有 `morphemeType` 仍留在 rest。
- 入站忽略其他 field type，以及没有 `lang` 的 form。
- 省略该 field 的导入保留已有字面意义。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save / LexiconPage / LIFT | pass |
| typecheck | `npm run typecheck` | 0 errors |
