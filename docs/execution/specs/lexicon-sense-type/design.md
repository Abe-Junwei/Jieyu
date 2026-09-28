---
title: lexicon-sense-type design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-type-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Type

## 1. 成熟方案扫描 / Research

- 仓库既有：义项用法已经是 `senses[].usages`，按 `usage-type` 读多条 trait。词条类型是 `lexemeType`，对应词条 `morph-type`，不是这条字段。导入用 `senses: parsed.senses` 整段替换。保存时从 `...rest` 拆掉旧键。
- 同类产品：FLEx 把 Sense Type 写成义项上的一条 `<trait name="sense-type" value="..."/>`（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)，Sense elements → Sense Type）。它排在 Usages 之后，而且每个义项只有一个。值来自 FLEx 列表。Jieyu 不内置那份封闭列表。
- 业内：SIL LIFT 0.13 的 `<trait>` 挂在父元素上，`name` 区分种类。同一义项若出现多条同名 trait，只取第一条非空值。
- 公认不可行：把类型写成用法数组或词条 `lexemeType`；读取词条上的同名 trait；把 `usage-type` 或 `morph-type` 当成义项类型；为这一条文本新开 Dexie 版本。
- 潜在的坑：保存时若不从 `...rest` 拆掉旧键，清空后类型还在。空 value 要跳过，后面的第二条不能覆盖第一条。导入省略该 trait 时义项数组会被整段替换。
- 决定：**复用** trait 列表读取，只取第一条非空 `sense-type`。`senseType` 是一个字符串。空白省略键。出站一条 trait，紧跟用法、位于子义项之前。忽略词条级 `sense-type`。无新 flag，无新 Dexie 版本，无新 controller，无封闭词表。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + 义项列表的一个标量字段
- 拒绝：新 controller；封闭词表；多值；词条类型；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略义项 `senseType` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 义项 `name="sense-type"` |
| `LexiconEntryEditForm.tsx` / `LexiconExtraSenseEditor.tsx` / `LexiconSenseList.tsx` | 输入与义项列表 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空 value 被跳过，只保留第一条非空值。
- 再次导入省略该 trait 时，类型随 `senses` 整段替换而消失，用法仍按同一规则重读。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
