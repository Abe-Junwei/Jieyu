---
title: lexicon-sense-status requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-status-spec
depends_on:
  - ../lexicon-sense-anthropology-categories/requirements.md
---

# Requirements — Lexicon Sense Status

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项状态（每个义项一条文本），保存后义项列表 readback，并随 LIFT 0.13 义项 `<trait name="status">` 进出。
- **为什么现在做**：人类学类别之后，FLEx 义项下一条是 Status。每个义项只允许一条。
- **不做什么**：封闭状态词表；词条级 status；人类学类别 `anthro-code`；词汇关系；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `Confirmed`，保存后该义项能看到这条状态，人类学类别还在。
2. 清空后再保存，义项上不再有 `senseStatus`。
3. 导入一份带义项 `status` 的 LIFT，只留下该义项第一条非空值。词条级同名 trait 和其他 trait 名不写入状态。再次导入时若义项不再带该 trait，状态随整段 `senses` 被替换掉，人类学类别仍按同一规则重读。

## 3. 验收标准（可测）

- [x] 义项状态 write→义项列表 readback，人类学类别仍在
- [x] 空白省略；每个义项只保留第一条非空值
- [x] LIFT 义项 `trait name="status"` 往返，排在人类学类别之后、子义项之前
- [x] 词条级同名 trait 和其他 trait 名不写入；再次导入省略该 trait 时状态随 `senses` 整段替换而消失
- [x] 无新 flag、无新表、无封闭词表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `senseStatus` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<trait name="status">` |
| Form / list | 编辑表单 / `LexiconExtraSenseEditor` / `LexiconSenseList` | 单行输入与 readback |
