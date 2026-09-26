---
title: lexicon-sense-grammar-note requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-26
source_of_truth: lexicon-sense-grammar-note-spec
depends_on:
  - ../lexicon-sense-encyclopedic-note/requirements.md
---

# Requirements — Lexicon Sense Grammar Note

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项语法注释（每个义项一条文本），保存后义项列表 readback，并随 LIFT 0.13 义项 `<note type="grammar">` 进出。
- **为什么现在做**：百科注释之后，FLEx 下一条带 type 的义项自由文本是 Grammar Note。无 type 的 General Note 会和词条无类型备注撞在一起，这一刀先不做。
- **不做什么**：词条级语法注释；无 type 的义项备注；义项参考文献；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `count noun`，保存后该义项能看到这句，百科注释还在。
2. 清空后再保存，义项上不再有 `grammarNote`。
3. 导入一份带义项语法注释的 LIFT，只留下该义项第一个有文本的 form；词条级同名 note 不写入。再次导入时若义项不再带该 note，注释随整段 `senses` 被替换掉，百科注释仍按同一规则重读。

## 3. 验收标准（可测）

- [x] 语法注释 write→义项列表 readback，百科注释仍在
- [x] 空白省略 `grammarNote`
- [x] LIFT 义项 `note type="grammar"` 往返第一条 form 文本，出站 lang 为 `und`，并排在百科注释之后、子义项之前
- [x] 词条级同名 note 不写入；再次导入省略该 note 时注释随 `senses` 整段替换而消失
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `grammarNote` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<note type="grammar">` |
| Form / list | 编辑表单 / `LexiconPage` 义项列表 | 输入与 readback |
