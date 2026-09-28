---
title: lexicon-sense-usages requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-usages-spec
depends_on:
  - ../lexicon-sense-source-note/requirements.md
---

# Requirements — Lexicon Sense Usages

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项用法（每个义项多条文本），保存后义项列表 readback，并随 LIFT 0.13 义项 `<trait name="usage-type">` 进出。
- **为什么现在做**：来源注释之后，FLEx 义项下一条是 Usages。
- **不做什么**：封闭用法词表；词条级 usage-type；语义域浏览；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `formal` 和 `child directed`，保存后该义项能看到这两条，来源注释还在。
2. 清空后再保存，义项上不再有 `usages`。
3. 导入一份带义项 usage-type 的 LIFT，只留下该义项的非空值，去重并保持顺序。词条级同名 trait 和其他 trait 名不写入用法。再次导入时若义项不再带这些 trait，用法随整段 `senses` 被替换掉，来源注释仍按同一规则重读。

## 3. 验收标准（可测）

- [x] 用法 write→义项列表 readback，来源注释仍在
- [x] 空白和重复省略；空列表省略 `usages`
- [x] LIFT 义项 `trait name="usage-type"` 往返，排在来源注释之后、子义项之前
- [x] 词条级同名 trait 和其他 trait 名不写入；再次导入省略这些 trait 时用法随 `senses` 整段替换而消失
- [x] 无新 flag、无新表、无封闭词表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `usages` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<trait name="usage-type">` |
| Form / list | 编辑表单 / `LexiconSenseList` | 多行输入与 readback |
