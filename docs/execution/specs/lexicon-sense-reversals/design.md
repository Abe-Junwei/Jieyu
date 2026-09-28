---
title: lexicon-sense-reversals design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-reversals-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Reversals

## 1. 成熟方案扫描 / Research

- 仓库既有：义项字段都挂在 `Sense` 的 JSON 上。导入用 `senses: parsed.senses` 整段替换。保存时从 `...rest` 拆掉旧键。没有反转索引表。
- 同类产品：FLEx 在 LIFT 里把反转写成义项上的 `<reversal>`。每个元素一条形式、一个书写系统，不能把 “house; bungalow” 写进同一条。层级用嵌套 `<main>` 表示上级，直到顶层（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)，Sense elements → Reversal Entries）。例子是 Buick 在 American 下，American 在 car 下。
- 业内：SIL LIFT 0.13 `reversal-content` 有可选 `type`、若干不同 `lang` 的 form，以及可选的一个 `reversal-main`。`main` 同样只有一个子 `main`（[lift.rng](https://github.com/sillsdev/lift-standard/blob/master/lift.rng)）。`main` 不能没有父级 form。
- 公认不可行：把所有书写系统拼成一段文本；为反转新开 Dexie 表；把词条上的 `<reversal>` 存进词条；在本切片做词汇关系或图片。
- 潜在的坑：schema 只允许一条 `main` 链，并列的第二个 `main` 不能当成兄弟树。同一 `<reversal>` 里多条 form 时，FLEx 只发一条；这里保留 `type`（没有 type 时用第一条 form 的 lang），其它书写系统的 form 不拆成新行。空白上级若整段丢掉，会把更上一级一起丢掉，所以空白上级跳过并保留子级。反转上的 grammatical-info 不是义项词类。
- 决定：**复用** LIFT `<reversal>` / `<main>`。`reversals` 是数组，每条有 `lang`、`text`，以及可选的单链 `main`。空白头省略。出站 `type` 与 form `lang` 相同，排在 gloss 之后、definition 之前。无新 flag，无新 Dexie 版本，无新 controller。

## 2. 架构选择

- 落位：既有 save helper + 纯函数 `senseReversals.ts` + LIFT 序列化 + 一个编辑组件
- 拒绝：新 controller；纯文本展平；反转索引表；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `senseReversals.ts` | 规范化、列表文案、草稿增删 |
| `saveLexiconEntry.ts` | 写入或省略义项 `reversals` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 义项 `<reversal>` 与 `<main>` |
| `LexiconSenseReversalFields.tsx` | 书写系统、形式、上级链 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空白书写系统或空白形式省略该条。空白上级跳过，子级接到上一层。
- 再次导入省略 `<reversal>` 时，反转随 `senses` 整段替换而消失，导入残留仍按同一规则重读。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
