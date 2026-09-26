---
title: lexicon-sense-anthropology-note requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-sense-anthropology-note-spec
depends_on:
  - ../lexicon-sense-scientific-name/requirements.md
---

# Requirements — Lexicon Sense Anthropology Note

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项人类学注释（每个义项一条文本），保存后义项列表 readback，并随 LIFT 0.13 义项 `<note type="anthropology">` 进出。
- **为什么现在做**：义项学名之后，FLEx 义项上的下一栏是 Anthropology Note。
- **不做什么**：词条级人类学注释；义项参考文献；义项限制；无 type 的义项备注；人类学分类 trait；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `kept at home`，保存后该义项能看到这句，学名还在。
2. 清空后再保存，义项上不再有 `anthropologyNote`。
3. 导入一份带义项人类学注释的 LIFT，只留下该义项第一个有文本的 form；词条级同名 note 不写入。再次导入时若义项不再带该 note，注释随整段 `senses` 被替换掉，学名仍按同一规则重读。

## 3. 验收标准（可测）

- [x] 人类学注释 write→义项列表 readback，学名仍在
- [x] 空白省略 `anthropologyNote`
- [x] LIFT 义项 `note type="anthropology"` 往返第一条 form 文本，出站 lang 为 `und`，并排在学名之后、子义项之前
- [x] 词条级同名 note、义项参考文献 note 不写入；再次导入省略该 note 时注释随 `senses` 整段替换而消失
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `anthropologyNote` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<note type="anthropology">` |
| Form / list | 编辑表单 / `LexiconPage` 义项列表 | 输入与 readback |
