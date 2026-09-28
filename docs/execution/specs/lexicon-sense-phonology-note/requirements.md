---
title: lexicon-sense-phonology-note requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-phonology-note-spec
depends_on:
  - ../lexicon-sense-semantic-domains/requirements.md
---

# Requirements — Lexicon Sense Phonology Note

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项音系注释（每个义项一条文本），保存后义项列表 readback，并随 LIFT 0.13 义项 `<note type="phonology">` 进出。
- **为什么现在做**：语义域之后，FLEx 义项自由文本里下一条还没接的是 Phonology Note。它和词条发音不是同一个元素。
- **不做什么**：词条级音系注释；无 type 的义项备注；词条 `<pronunciation>`；语义域浏览；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `tone on the first syllable`，保存后该义项能看到这句，语义域还在。
2. 清空后再保存，义项上不再有 `phonologyNote`。
3. 导入一份带义项音系注释的 LIFT，只留下该义项第一个有文本的 form；词条级同名 note 和无 type 的 General Note 不写入。再次导入时若义项不再带该 note，注释随整段 `senses` 被替换掉，语义域仍按同一规则重读。

## 3. 验收标准（可测）

- [x] 音系注释 write→义项列表 readback，语义域仍在
- [x] 空白省略 `phonologyNote`
- [x] LIFT 义项 `note type="phonology"` 往返第一条 form 文本，出站 lang 为 `und`，并排在语义域之后、子义项之前
- [x] 词条级同名 note 和无 type 的 General Note 不写入；再次导入省略该 note 时注释随 `senses` 整段替换而消失
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `phonologyNote` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<note type="phonology">` |
| Form / list | 编辑表单 / `LexiconSenseList` | 输入与 readback |
