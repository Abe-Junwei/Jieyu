---
title: lexicon-lexeme-bibliography requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-bibliography-spec
depends_on:
  - ../lexicon-lexeme-literal-meaning/requirements.md
---

# Requirements — Lexicon Entry Bibliography

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑词条参考文献（一条文本），保存后概览 readback，并随 LIFT 0.13 词条级 `<note type="bibliography">` 进出。
- **为什么现在做**：字面意义之后，FLEx 词条上的下一栏是参考文献。现在入站把第一条 `<note>` 当成备注，参考文献会盖住无 type 的备注。
- **不做什么**：义项级参考文献；词源里的 `<field type="bibliography">`；多条参考文献；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 写下 `Smith 1990`，保存后概览能看到这句，原有备注还在。
2. 清空后再保存，词条上不再有 `bibliography`。
3. 导入一份参考文献写在无 type 备注前面的 LIFT，参考文献和备注各归各位。

## 3. 验收标准（可测）

- [x] 参考文献 write→概览 readback，备注仍在
- [x] 空白省略 `bibliography`
- [x] LIFT `note type="bibliography"` 往返第一条 form 文本，出站 lang 为 `und`，并排在无 type 备注之后
- [x] 义项 note、其他 note type、`<field type="bibliography">` 不写入；省略该 note 时保留已有值
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略 `bibliography` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 词条 `<note type="bibliography">`；无 type 备注单独读取 |
| Controller / form / page | 既有编辑表单与概览 | 输入与 readback |
