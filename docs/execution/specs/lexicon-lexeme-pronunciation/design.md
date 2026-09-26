---
title: lexicon-lexeme-pronunciation design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-pronunciation-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Entry Pronunciation

## 1. 成熟方案扫描 / Research

- 仓库既有：`LexemeDocType` 有 `lexemeType` / `citationForm`，没有发音字段。保存路径在 `applyLexiconEntryFields`。LIFT 入站 `formPairs` 跳过没有 `lang` 或没有文本的 `<form>`。附件媒体走 B8，flag 默认关，不进 LIFT。
- 同类产品：FLEx / WeSay 把 Pronunciation 放在词条上，不放在义项上。一条发音是一个 form，后面可以再挂媒体、CV、声调、location（[FLEx Technical Notes](https://software.sil.org/fieldworks/support/technical-notes/)）。
- 业内：SIL LIFT 0.13 的 `<pronunciation>` 在 entry 下，可重复，每个里面是零个或多个 `<form lang>` 加可选 `<media>`（[lift-standard](https://github.com/sillsdev/lift-standard)）。音标常用 `und-fonipa` 或语言码加 `-fonipa`。DMLex 是另一套交换模型，不拿来当这一刀的编辑模型。
- 公认不可行：把发音塞进义项；把 `<media href>` 当发音文本；用白话 `lang` 出站，让 IPA 看起来像正字；为多条发音或 CV/声调再加表。
- 潜在的坑：保存时若展开旧词条，用户清空发音后旧字符串还会留在 `...rest`。`form` 没有 `lang` 时现有入站会跳过。导入省略该元素时不能清掉库里已有的发音（与 citation 相同）。
- 决定：**复用** 词条 JSON。`pronunciation` 是第一条非空 form 文本。空白省略键。出站一个元素，lang 固定 `und-fonipa`。入站按块顺序取第一个有文本的 form，跳过只有媒体的块。无新 flag，无新 Dexie 版本。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + edit controller 字段
- 拒绝：新 controller；媒体/CV/声调；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `db/types.ts` / `schemas.ts` | 词条 `pronunciation` |
| `saveLexiconEntry.ts` | 写入或省略 |
| `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | `<pronunciation>` |
| form + controller + `LexiconPage.tsx` | 输入与概览 |

## 4. ADR 引用

- 无新 ADR。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空白不写入。已有 `morphemeType` 仍留在 rest。
- 入站忽略 `<media>`、CV、声调，以及同一块里的第二条 form。
- 省略 `<pronunciation>` 的导入保留已有发音。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save / LexiconPage / LIFT | pass |
| typecheck | `npm run typecheck` | 0 errors |
