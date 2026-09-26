---
title: lexicon-lexeme-literal-meaning requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-literal-meaning-spec
depends_on:
  - ../lexicon-lexeme-etymology/requirements.md
---

# Requirements — Lexicon Entry Literal Meaning

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑词条字面意义（一条文本），保存后概览 readback，并随 LIFT 0.13 `<field type="literal-meaning">` 进出。
- **为什么现在做**：词源之后，FLEx 词条上的下一栏是字面意义。
- **不做什么**：多条字面意义；其他 `<field>` 类型；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 写下 `domestic animal`，保存后概览能看到这句。
2. 清空后再保存，词条上不再有 `literalMeaning`。
3. 导入一份带字面意义的 LIFT，只留下第一个有文本的 form；没有该 field 时，已有字面意义还在。

## 3. 验收标准（可测）

- [x] 字面意义 write→概览 readback
- [x] 空白省略 `literalMeaning`
- [x] LIFT `literal-meaning` 往返第一条 form 文本，出站 lang 为 `und`
- [x] 其他 field type 不写入；省略该 field 时保留已有值
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略 `literalMeaning` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | `<field type="literal-meaning">` |
| Controller / form / page | 既有编辑表单与概览 | 输入与 readback |
| 测试 | save / LexiconPage / LIFT | 新增 |
