---
title: lexicon-sense-reversals requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-reversals-spec
depends_on:
  - ../lexicon-sense-import-residue/requirements.md
---

# Requirements — Lexicon Sense Reversals

## 1. What & Why

- **要做什么**：`/lexicon` 可按书写系统编辑义项反转词条，并保留嵌套的 `main` 链。保存后义项列表 readback，并随 LIFT 0.13 义项 `<reversal>` 进出。
- **为什么现在做**：义项导入残留之后，FLEx 义项上还缺的是 Reversal Entries。存储形态已定为按书写系统分条，并保留 `main` 树。
- **不做什么**：把多种书写系统展平成一条文本；词条级反转；反转上的 grammatical-info；并列的多个 `main`；词汇关系；图片；DMLex；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主义项写下书写系统 `en`、形式 `Buick`，上级 `American`，再上级 `car`。保存后该义项能看到 `en: Buick › American › car`，导入残留还在。
2. 清空反转后再保存，义项上不再有 `reversals`。
3. 导入一份同时带英文和西班牙文 `<reversal>`、以及 `Buick / American / car` 链的 LIFT。同一书写系统的两条反转都留下。无 `lang` 的 form 跳过。同一 `main` 下的第二个并列 `main` 不写入。词条上的 `<reversal>` 不写入。再次导入省略这些元素时，反转随整段 `senses` 被替换掉，导入残留仍在。

## 3. 验收标准（可测）

- [x] 反转 write→义项列表 readback，导入残留仍在
- [x] 空白书写系统或空白形式省略该条；空白上级被跳过，子级保留
- [x] LIFT `<reversal type>` 往返，排在 gloss 之后、definition 之前；`main` 链保留
- [x] 词条级 `<reversal>` 不写入；反转上的 grammatical-info 不改义项词类；再次导入省略时反转随 `senses` 整段替换而消失
- [x] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` / `senseReversals.ts` | 写入或省略义项 `reversals` |
| LIFT | `lexiconLiftExport.ts` / `lexiconLiftImport.ts` | 义项 `<reversal>` 与嵌套 `<main>` |
| Form / list | `LexiconSenseReversalFields` / 编辑表单 / `LexiconSenseList` | 书写系统、形式、上级链与 readback |
