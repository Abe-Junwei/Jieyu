---
title: lexicon-sense-general-note requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-general-note-spec
depends_on:
  - ../lexicon-sense-bibliography/requirements.md
---

# Requirements — Lexicon Sense General Note

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项一般注释（每个义项一条文本），保存后义项列表 readback，并随 LIFT 0.13 义项上无 `type` 的 `<note>` 进出。
- **为什么现在做**：义项参考文献之后，FLEx 义项上仍缺的简单 note 是 General Note。词条级无 type note 已经落地，这一条挂在义项上。
- **不做什么**：改词条 `notes`；带 type 的注释；图片；词汇关系；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `seen in town`，保存后该义项能看到这条，百科注释还在。
2. 清空后再保存，义项上不再有 `generalNote`。
3. 导入一份同时带词条无 type note 和义项无 type note 的 LIFT，两边各留各的。义项上带 type 的 note 不写进一般注释。再次导入时若义项不再带无 type note，一般注释随整段 `senses` 被替换掉，词条注释和百科注释仍在。

## 3. 验收标准（可测）

- [x] 义项一般注释 write→义项列表 readback，百科注释仍在
- [x] 空白省略 `generalNote`，且不改词条 `notes`
- [x] LIFT 义项无 type `<note>` 往返，排在百科注释之后、语法注释之前
- [x] 词条级无 type note 和带 type 的义项 note 不互相覆盖；再次导入省略该 note 时一般注释随 `senses` 整段替换而消失
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `generalNote` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项无 type `<note>` |
| Form / list | 编辑表单 / `LexiconExtraSenseEditor` / `LexiconSenseList` | 单行输入与 readback |
