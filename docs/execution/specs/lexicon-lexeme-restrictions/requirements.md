---
title: lexicon-lexeme-restrictions requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-restrictions-spec
depends_on:
  - ../lexicon-lexeme-bibliography/requirements.md
---

# Requirements — Lexicon Entry Restrictions

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑词条限制（一条文本），保存后概览 readback，并随 LIFT 0.13 词条级 `<note type="restrictions">` 进出。
- **为什么现在做**：参考文献之后，FLEx 词条上的下一栏是 Restrictions。
- **不做什么**：义项级限制；参考文献；无 type 备注；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 写下 `internal`，保存后概览能看到这句，参考文献还在。
2. 清空后再保存，词条上不再有 `restrictions`。
3. 导入一份带限制 note 的 LIFT，只留下第一个有文本的 form；没有该 note 时，已有限制还在。

## 3. 验收标准（可测）

- [x] 限制 write→概览 readback，参考文献仍在
- [x] 空白省略 `restrictions`
- [x] LIFT `note type="restrictions"` 往返第一条 form 文本，出站 lang 为 `und`，并排在参考文献之后
- [x] 省略该 note 时保留已有值；不写入参考文献或无 type 备注
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入或省略 `restrictions` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 词条 `<note type="restrictions">` |
| Controller / form / page | 既有编辑表单与概览 | 输入与 readback |
