---
title: lexicon-senses-forms design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-19
source_of_truth: lexicon-senses-forms-spec
depends_on:
  - ./requirements.md
  - ../lexicon-entry-edit/design.md
---

# Design — Lexicon Senses & Forms (B3c)

## 1. 成熟方案扫描 / Research

- 仓库既有：B3b `saveLexiconEntry` / `useLexiconEntryEditController` / `LexiconEntryEditForm`；详情只读已渲染 `senses` 与 `forms`；`Sense.gloss|definition`、`Form.transcription` 已在 Dexie 类型里。
- 同类产品：FLEx Lexicon Edit 一条词条多个 sense（Insert sense）；词形走 Allomorphs / variant form，LIFT 里 allomorph 是 entry 下 `<variant>`，跨条 variant 才是 `_component-lexeme`。
- 业内：LIFT 多 `<sense>` + `<gloss>`/`<definition>`；词形用 form/variant，不先做 environment / morph-type。
- 公认不可行：一次做 subsense 树、FLEx 自定义域、variant-of 关系网；为 B3c 升 Dexie 版本；把写库存进 `LexiconPage`。
- 潜在的坑：B3b 主 gloss 只写 `senses[0]`，额外义项必须 slice(1) 往返；空行若不当丢弃会写出空 gloss；清掉全部 forms 须从文档上删除字段，不能留 `[]` 与旧数据并存。
- 决定：**复用** `saveLexeme` 与 B3b apply/readback；**适配** FLEx/LIFT 的扁平多 sense + 词形列表；**自研** 仅限表单增删行。不新增依赖。

## 2. 架构选择

- 落位：`state`（draft 行）+ `actions`（save apply）
- 选 A：扩展 `LexiconEntryFields` + 现有 controller/form
- 拒绝：新 sibling mega-controller；义项树 UI

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `saveLexiconEntry.ts` | extraSenses/forms apply + readback | 增量 |
| `useLexiconEntryEditController.ts` | 增删行 | < 200 / ≤ 8 |
| `LexiconEntryEditForm.tsx` | 列表输入 | 增量 |

约束自查：无 ChatWindow；无 `src/features/`；义项行无第三层 border。

## 4. ADR 引用

- 无新 ADR。词典模型沿用现有 `LexemeDocType`。

## 5. Feature flag

- 无新 flag；附件仍 `lexiconAttachmentsEnabled`。

## 6. 失败模式 / 兼容性

- 旧词条无 extra senses / forms：表单空列表，保存不发明数据。
- 回滚：revert PR。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 持久化 | Dexie vitest extra sense / forms readback | pass |
| 守卫 | architecture-guard / docs / r1-r8 | OK |
