---
title: lexicon-sense-scientific-name requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-sense-scientific-name-spec
depends_on:
  - ../lexicon-lexeme-summary-definition/requirements.md
---

# Requirements — Lexicon Sense Scientific Name

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项学名（每个义项一条文本），保存后义项列表 readback，并随 LIFT 0.13 义项 `<field type="scientific-name">` 进出。
- **为什么现在做**：概要定义之后，交叉引用是关系、import residue 是未映射残渣。FLEx 下一栏可落地的简单文本是义项学名。
- **不做什么**：词条级学名；交叉引用；import residue；义项备注；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `Canis familiaris`，保存后该义项能看到这句，词类还在。
2. 清空后再保存，义项上不再有 `scientificName`。
3. 导入一份带义项学名的 LIFT，只留下该义项第一个有文本的 form；词条级同名 field 不写入。再次导入时若义项不再带该 field，学名随整段 `senses` 被替换掉。

## 3. 验收标准（可测）

- [x] 学名 write→义项列表 readback，词类仍在
- [x] 空白省略 `scientificName`
- [x] LIFT 义项 `scientific-name` 往返第一条 form 文本，出站 lang 为 `und`，并排在例证之后、子义项之前
- [x] 词条级同名 field 不写入；再次导入省略该 field 时学名随 `senses` 整段替换而消失
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `scientificName` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<field type="scientific-name">` |
| Form / list | 编辑表单 / `LexiconPage` 义项列表 | 输入与 readback |
