---
title: lexicon-lexeme-etymology requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-etymology-spec
depends_on:
  - ../lexicon-lexeme-pronunciation/requirements.md
---

# Requirements — Lexicon Entry Etymology

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑一条词源（来源词形、可选释义、可选来源语言），保存后概览 readback，并随 LIFT 0.13 `<etymology>` 进出。
- **为什么现在做**：发音之后，FLEx 词条上还没接的下一栏是词源。治理补充规范里也把 `etymology` 列为待加可选字段。
- **不做什么**：第二条词源；注释、书目、前后评注；过时的 `source`/`type` 属性；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 写下 `perro`、释义 `dog`、来源语言 `Spanish`，保存后概览能看到这三项。
2. 只留下词形，释义和来源语言留空，readback 只有 `form`。
3. 清空词形再保存，词条上不再有 `etymology`。

## 3. 验收标准（可测）

- [x] 词源 write→概览 readback
- [x] 空白词形省略整个 `etymology`；空白释义和来源语言省略对应键
- [x] LIFT `<etymology>` 往返第一条有词形的块；来源语言走 `trait name="languages"`
- [x] 过时 `source` 属性不写入；省略元素时保留已有词源
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略 `etymology` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | `<etymology>` |
| Controller / form / page | 既有编辑表单与概览 | 输入与 readback |
| 测试 | save / LexiconPage / LIFT | 新增 |
