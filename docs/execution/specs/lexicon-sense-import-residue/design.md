---
title: lexicon-sense-import-residue design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-import-residue-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Import Residue

## 1. 成熟方案扫描 / Research

- 仓库既有：义项学名已经用 `parseFieldText` 读义项直接子 `field` 的第一条带 `lang` 的 form。导入用 `senses: parsed.senses` 整段替换。保存时从 `...rest` 拆掉旧键。词条级 field（字面意义、概要定义）不写到义项上。
- 同类产品：FLEx 把 Sense Import Residue 写成义项上的 `<field type="import-residue">`，里面一个 form，form 里可以再嵌书写系统（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)，Sense elements → Import Residue）。词条级 Import Residue 是 entry 上的同名 field。
- 业内：SIL LIFT 0.13 的 field `type` 区分种类。本仓库 `formPairs` 只收带 `lang` 的 form，嵌套书写系统按现有 `textContent` 展平，与学名同一条路径。
- 公认不可行：把词条级 `import-residue` 存进词条或义项；把学名读成残留；为这一条字符串新开 Dexie 版本；在本切片做反转词条。
- 潜在的坑：保存时若不从 `...rest` 拆掉旧值，清空后残留还在。无 `lang` 的 form 会被 `formPairs` 跳过。同一义项上后一个同 type field 在已读到非空文本后不再读。导入省略该 field 时义项数组会被整段替换。
- 决定：**复用** `parseFieldText`。`importResidue` 是该义项第一条非空、带 `lang` 的 form 文本。空白省略键。出站 `lang="und"`，排在义项限制之后、子义项之前。不存词条级残留。无新 flag，无新 Dexie 版本，无新 controller。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + 义项列表的一个字符串
- 拒绝：新 controller；词条级导入残留；反转词条；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略义项 `importResidue` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 义项 `field type="import-residue"` |
| `LexiconEntryEditForm.tsx` / `LexiconExtraSenseEditor.tsx` / `LexiconSenseList.tsx` | 单行输入与义项列表 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空白省略该键。义项限制保持原样。
- 再次导入省略该 field 时，导入残留随 `senses` 整段替换而消失，义项限制仍按同一规则重读。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
