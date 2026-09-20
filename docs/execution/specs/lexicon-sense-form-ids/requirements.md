---
title: lexicon-sense-form-ids requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-20
source_of_truth: lexicon-sense-form-ids-spec
depends_on:
  - ../lexicon-senses-forms/requirements.md
---

# Requirements — Lexicon Sense/Form Stable Ids

## 1. What & Why

- **要做什么**：给 `LexemeDocType.senses[]` / `forms[]` 补稳定 `id`；`saveLexeme` 与 B3c apply 保留已有 id、新行 `newId`；Dexie v54 回填旧行。
- **为什么现在做**：B3c 用数组下标当 identity，重排/删行会错位；LIFT 0.13 要求 sense `id`；后续义项树需要稳定键。
- **不做什么**：不做义项树 UI、DMLex 内部 metamodel、LIFT 出站、ChatWindow、新 flag、不改附件表索引。

## 2. 用户场景（≤ 3 条）

1. 保存额外义项后 reload，`senses[1].id` 仍是同一字符串。
2. 打开旧库（无 nested id）升到 v54 后每条 sense/form 都有非空 id。
3. 改 gloss 不换 id；新增词形得到新 `form_*` id。

## 3. 验收标准（可测）

- [x] `saveLexeme` / `saveLexiconEntry` write→list readback：nested `id` 非空且二次保存不变
- [x] v54 upgrade 回填缺 id、保留已有 id
- [x] Zod sense/form 要求 `id` min(1)；validate 先补 id 再 parse（兼容旧快照写入）
- [x] 无新 flag；B3c extra-sense/forms 用例仍绿

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Schema / DB | `types.ts` `schemas.ts` `engine.ts` `lexemeNestedIds.ts` `migrations/m54LexemeNestedIds.ts` | 新增 id + v54 |
| Service | `linguisticServiceLexemeOps.ts` | save / matchOrCreate 补 id |
| Helper | `saveLexiconEntry.ts` | 保留/分配 nested id |
| 测试 | m54 + saveLexiconEntry + engine.lexemeAssets | 新增 / 修改 |

## 5. 已知风险与依赖

- `matchOrCreateLexemeByForm` 走 `dexie.put`，须自行补 id。
- 导入旧 JSON：validate 就地补 id 后再 parse。
- 页面不得 `import '../db'`；apply 用已有 `newId`。
