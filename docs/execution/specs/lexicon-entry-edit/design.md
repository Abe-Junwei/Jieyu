---
title: lexicon-entry-edit design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-11
source_of_truth: lexicon-entry-edit-spec
depends_on:
  - ./requirements.md
  - ../../plans/标注页与词典页开发路线图-2026-04-25.md
---

# Design — Lexicon Entry Edit (B3b)

## 1. 成熟方案扫描 / Research

- 仓库既有：`LinguisticService.lexemes.save` → `saveLexeme`（Dexie `put`）；列表/详情只读在 `LexiconPage`；附件已有 `useLexiconAttachmentController`；B2 已对 `lexeme-updated` invalidate `['lexemes']`。标注页链词条走 `token_lexeme_links`，不编辑 lexeme 行。
- 同类产品：FLEx 词条表单是 lemma + senses（gloss/definition）；WeSay 把编辑拆成「一次填一个字段」的任务，默认偏 definition、gloss 给 interlinear。LanguageForge 也是选条目后改 lemma/sense。
- 业内：LIFT 0.13 词条 = lexical-unit + sense/gloss；SIL 不把完整 FLEx 对象模型塞进田野编辑器。Web 词典（Lexique Pro / DAB）是只读发布，不是编辑器。
- 公认不可行：在词典页做第二套 LIFT XML 编辑器；把 FLEx 义项树/例证/自定义字段一次做完；把写库放进 `LexiconPage`；从语料页做词典包（R5）。
- 潜在的坑：schema 要求 `senses.min(1)`；`exactOptionalPropertyTypes` 不能写 `undefined`；多语言 gloss 不能同时写 `eng` 与新 `default`；R8 不得新增 sessionStorage 键。
- 决定：**复用** `saveLexeme` + 现有 `LexemeDocType`；**适配** 最小字段表单（lemma / 主 gloss / citation / language / notes）+ 新建；**自研** 仅 patch helper 与 sibling controller。不新增依赖。

## 2. 架构选择

- 落位：`actions`（save/create）+ `state`（草稿）
- 选 A：`saveLexiconEntry` 纯函数 + `useLexiconEntryEditController`；页面装配表单
- 拒绝：在 `LexiconPage` 里直接 `saveLexeme`；新 Dexie 表；新页面 flag（词典工作台已开放，写的是已有 save API）

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `saveLexiconEntry.ts` | 字段 patch + save + list readback | < 140 |
| `useLexiconEntryEditController.ts` | 草稿 / 保存 / 新建 | < 180 / ≤ 10 |
| `LexiconEntryEditForm.tsx` | 受控表单 | < 160 |
| `LexiconPage.tsx` | 装配按钮与表单 | 仅接线 |

约束自查：无 `src/features/`；表单容器不再加第 3 层 border（原生 input 不计）。

## 4. ADR 引用

- 不新建 ADR。词条真源仍是 `lexemes`。

## 5. Feature flag

- 不新增。词典页已是开放工作台；附件继续 `lexiconAttachmentsEnabled` 默认 false。

## 6. 失败模式 / 兼容性

- 空 lemma：抛错，不 put
- 保存失败：错误文案；草稿保留
- 回滚：revert PR；数据可用 `lexemes.put` 覆盖回旧行

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元 | `saveLexiconEntry.test.ts` + `LexiconPage.test.tsx` | pass |
| 守卫 | architecture-guard / docs / workflow / r1-r8 | OK |
