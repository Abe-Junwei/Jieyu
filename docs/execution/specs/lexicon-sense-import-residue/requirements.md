---
title: lexicon-sense-import-residue requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-import-residue-spec
depends_on:
  - ../lexicon-sense-restrictions/requirements.md
---

# Requirements — Lexicon Sense Import Residue

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项导入残留（每个义项一条文本），保存后义项列表 readback，并随 LIFT 0.13 义项 `<field type="import-residue">` 进出。
- **为什么现在做**：义项限制之后，FLEx 义项上仍缺的简单 field 是 Import Residue。词条级同名 field 不在本切片。
- **不做什么**：词条级导入残留；学名；反转词条；词汇关系；自定义字段；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `kept marker`，保存后该义项能看到这条，义项限制还在。
2. 清空后再保存，义项上不再有 `importResidue`。
3. 导入一份同时带词条级和义项级 `import-residue` 的 LIFT，只读义项上的第一条非空 form。无 `lang` 的 form 跳过。学名仍是学名。再次导入时若义项不再带该 field，导入残留随整段 `senses` 被替换掉，义项限制仍在。

## 3. 验收标准（可测）

- [x] 义项导入残留 write→义项列表 readback，义项限制仍在
- [x] 空白省略 `importResidue`，且不改义项限制
- [x] LIFT 义项 `field type="import-residue"` 往返，排在义项限制之后、子义项之前
- [x] 词条级同名 field 不写入词条或义项；学名不被当成残留；再次导入省略该 field 时导入残留随 `senses` 整段替换而消失
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `importResidue` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<field type="import-residue">` |
| Form / list | 编辑表单 / `LexiconExtraSenseEditor` / `LexiconSenseList` | 单行输入与 readback |
