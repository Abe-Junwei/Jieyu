---
title: lexicon-sense-bibliography requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-bibliography-spec
depends_on:
  - ../lexicon-sense-reversals/requirements.md
---

# Requirements — Lexicon Sense Bibliography

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑义项参考文献（每个义项一条文本），保存后义项列表 readback，并随 LIFT 0.13 义项 `<note type="bibliography">` 进出。
- **为什么现在做**：反转词条之后，FLEx 义项上仍缺的简单 note 是 Bibliography。词条级参考文献已经落地，这一条挂在义项上。
- **不做什么**：改词条 `bibliography`；无 type 的 General Note；图片；词汇关系；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下 `Smith 1990`，保存后该义项能看到这条，人类学注释还在。
2. 清空后再保存，义项上不再有 `senseBibliography`。
3. 导入一份同时带词条参考文献和义项参考文献的 LIFT，两边各留各的。义项上的无 type note 不写入。再次导入时若义项不再带该 note，义项参考文献随整段 `senses` 被替换掉，词条参考文献和人类学注释仍在。

## 3. 验收标准（可测）

- [x] 义项参考文献 write→义项列表 readback，人类学注释仍在
- [x] 空白省略 `senseBibliography`，且不改词条参考文献
- [x] LIFT 义项 `note type="bibliography"` 往返，排在人类学注释之后、语篇注释之前
- [x] 词条级同名 note 和无 type note 不写入义项；再次导入省略该 note 时义项参考文献随 `senses` 整段替换而消失
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略义项 `senseBibliography` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<note type="bibliography">` |
| Form / list | 编辑表单 / `LexiconExtraSenseEditor` / `LexiconSenseList` | 单行输入与 readback |
