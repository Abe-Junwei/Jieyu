---
title: lexicon-sense-type requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-type-spec
depends_on:
  - ../lexicon-sense-usages/requirements.md
---

# Requirements — Lexicon Sense Type

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项类型（每个义项一条文本），保存后义项列表 readback，并随 LIFT 0.13 义项 `<trait name="sense-type">` 进出。
- **为什么现在做**：用法之后，FLEx 义项下一条是 Sense Type，而且每个义项只有一条。
- **不做什么**：封闭类型词表；多条 sense-type；词条类型 `morph-type`；语义域浏览；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `figurative`，保存后该义项能看到这句，用法还在。
2. 清空后再保存，义项上不再有 `senseType`。
3. 导入一份带多条义项 `sense-type` 的 LIFT，只留下该义项第一条非空值。词条级同名 trait 和其他 trait 名不写入。再次导入时若义项不再带该 trait，类型随整段 `senses` 被替换掉，用法仍按同一规则重读。

## 3. 验收标准（可测）

- [x] 义项类型 write→义项列表 readback，用法仍在
- [x] 空白省略 `senseType`
- [x] LIFT 义项 `trait name="sense-type"` 只往返第一条非空值，排在用法之后、子义项之前
- [x] 词条级同名 trait 和其他 trait 名不写入；再次导入省略该 trait 时类型随 `senses` 整段替换而消失
- [x] 无新 flag、无新表、无封闭词表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `senseType` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<trait name="sense-type">` |
| Form / list | 编辑表单 / `LexiconSenseList` | 输入与 readback |
