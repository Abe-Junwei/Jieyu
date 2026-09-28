---
title: lexicon-sense-anthropology-categories requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-anthropology-categories-spec
depends_on:
  - ../lexicon-sense-academic-domains/requirements.md
---

# Requirements — Lexicon Sense Anthropology Categories

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项人类学类别（每个义项多条缩写），保存后义项列表 readback，并随 LIFT 0.13 义项 `<trait name="anthro-code">` 进出。
- **为什么现在做**：学术领域之后，FLEx 义项下一条是 Anthropology Categories。它和已落地的人类学注释不是同一个字段。
- **不做什么**：封闭类别词表；人类学注释 `<note type="anthropology">`；学术领域 `domain-type`；词条级 anthro-code；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `kin` 和 `ritual`，保存后该义项能看到这两条，学术领域还在。
2. 清空后再保存，义项上不再有 `anthropologyCategories`。
3. 导入一份带义项 `anthro-code` 的 LIFT，只留下该义项的非空缩写，去重并保持顺序。词条级同名 trait、学术领域 trait 和人类学注释不写入人类学类别。再次导入时若义项不再带这些 trait，人类学类别随整段 `senses` 被替换掉，学术领域仍按同一规则重读。

## 3. 验收标准（可测）

- [x] 人类学类别 write→义项列表 readback，学术领域仍在
- [x] 空白和重复省略；空列表省略 `anthropologyCategories`
- [x] LIFT 义项 `trait name="anthro-code"` 往返，排在学术领域之后、子义项之前
- [x] 词条级同名 trait 和其他 trait 名不写入；再次导入省略这些 trait 时人类学类别随 `senses` 整段替换而消失
- [x] 无新 flag、无新表、无封闭词表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `anthropologyCategories` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<trait name="anthro-code">` |
| Form / list | 编辑表单 / `LexiconExtraSenseEditor` / `LexiconSenseList` | 多行输入与 readback |
