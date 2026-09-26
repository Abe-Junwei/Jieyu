---
title: lexicon-lexeme-summary-definition requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-summary-definition-spec
depends_on:
  - ../lexicon-lexeme-restrictions/requirements.md
---

# Requirements — Lexicon Entry Summary Definition

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑词条概要定义（一条文本），保存后概览 readback，并随 LIFT 0.13 `<field type="summary-definition">` 进出。
- **为什么现在做**：限制之后，FLEx 词条上的下一栏是 Summary Definition。概览组件已经拆出，词典页可以再加这一栏。
- **不做什么**：义项级概要定义；字面意义；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 写下 `a canine kept at home`，保存后概览能看到这句，字面意义还在。
2. 清空后再保存，词条上不再有 `summaryDefinition`。
3. 导入一份带概要定义的 LIFT，只留下第一个有文本的 form；没有该 field 时，已有概要定义还在。

## 3. 验收标准（可测）

- [x] 概要定义 write→概览 readback，字面意义仍在
- [x] 空白省略 `summaryDefinition`
- [x] LIFT `summary-definition` 往返第一条 form 文本，出站 lang 为 `und`，并排在 `literal-meaning` 之后
- [x] 义项里的同名 field 不写入；省略该 field 时保留已有值
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略 `summaryDefinition` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | `<field type="summary-definition">` |
| Overview / form | `LexiconEntryOverview.tsx` / 编辑表单 | 输入与 readback |
