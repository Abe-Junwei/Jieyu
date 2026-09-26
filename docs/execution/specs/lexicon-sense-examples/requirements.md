---
title: lexicon-sense-examples requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-sense-examples-spec
depends_on:
  - ../lexicon-lexeme-type/requirements.md
---

# Requirements — Lexicon Sense Examples

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项例证（原文 + 可选译文），保存后义项列表 readback，并随 LIFT 0.13 进出。
- **为什么现在做**：LIFT `<example>` 已经是 FLEx 词条的下一栏；表单和出站/入站都还没带它。
- **不做什么**：词条级 `examples: string[]`；书目 `<source>`；多条译文；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 在主义项写下原文和译文，保存后义项列表能看到这两句。
2. 只留下原文、译文留空，readback 不带 `translation`。
3. 清空原文再保存，该例证从义项上消失；词条上已有的 `examples: string[]` 仍在。

## 3. 验收标准（可测）

- [x] 义项 `examples` write→list readback
- [x] 空白原文不写入；空白译文省略 `translation`
- [x] LIFT `<example>` 往返原文与第一条译文
- [x] 保存不清除词条级 `examples`
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `examples` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | `<example>` |
| Controller / form / page | 既有编辑表单与义项列表 | 输入与 readback |
| 测试 | save / LexiconPage / LIFT | 新增 |
