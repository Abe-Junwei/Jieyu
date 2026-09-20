---
title: lexicon-sense-form-ids design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-20
source_of_truth: lexicon-sense-form-ids-spec
depends_on:
  - ./requirements.md
  - ../lexicon-senses-forms/design.md
---

# Design — Lexicon Sense/Form Stable Ids

## 1. 成熟方案扫描 / Research

- 仓库既有：B3c `applyLexiconEntryFields` 按下标对齐 extra sense/form；`saveLexeme` Dexie `insert`；B8 v53 `lexeme_assets`；`upgradeM42TrackEntityDocumentIds` 数据迁移范式。
- 同类产品：FLEx/WeSay LIFT 导出要求 **entry 与 sense 都有 unique id**（sense 多为 GUID）；FLEx 用 guid 做 merge 键。词形在 LIFT 里是 `lexical-unit/form` 按 `@lang`，**没有独立 form id**。
- 业内：SIL LIFT 0.13（程序仍用 0.13，0.15 未普及）；TEI Lex-0 用 `xml:id`；OASIS DMLex 1.0（2025）内部 metamodel 过重，本切片不做。
- 公认不可行：用数组下标当长期 identity；为 form 建独立 Dexie 表；一次上 DMLex/LIFT 出站；把 id 只写 UI draft 不落库。
- 潜在的坑：`validateLexemeDoc` 若要求 id 但不补，旧快照导入失败；`dexie.lexemes.put` 绕过 adapter。v54 索引仍是 `id, updatedAt`，只做 nested 回填。
- 决定：**复用** nested JSON 与 B3c apply；**适配** LIFT sense id；form 给**内部** id 供编辑稳定（非 LIFT 字段）；**自研** `assignLexemeNestedIdsInPlace` + v54 modify。不新增依赖。

## 2. 架构选择

- 落位：`actions`（save/apply）+ Dexie upgrade
- 选 A：nested `id` on sense/form + v54 backfill
- 拒绝：独立 `lexeme_senses` 表；义项树 UI

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `src/db/lexemeNestedIds.ts` | 就地补缺 id | < 80 |
| `src/db/migrations/m54LexemeNestedIds.ts` | v54 modify lexemes | < 40 |
| `src/db/schemas.ts` / `types.ts` / `engine.ts` | Zod + TARGET=54 | 增量 |
| `saveLexiconEntry.ts` / `saveLexeme` | 保留已有 id | 增量 |

约束自查：无 `src/features/`；无新 hook；无第三层 border。

## 4. ADR 引用

- 无新 ADR。词典仍单行 `lexemes` JSON。

## 5. Feature flag

- 无。附件仍 `lexiconAttachmentsEnabled`。

## 6. 失败模式 / 兼容性

- 旧行无 id：打开库跑 v54 modify；导入走 validate 补 id。
- 回滚：revert PR（已写 id 留在 JSON，可忽略）。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 持久化 | m54 + saveLexiconEntry + saveLexeme readback | pass |
| 守卫 | architecture-guard / docs / workflow | OK |
