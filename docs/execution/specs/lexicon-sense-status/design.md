---
title: lexicon-sense-status design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-status-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Status

## 1. 成熟方案扫描 / Research

- 仓库既有：义项类型已经是 `senses[].senseType`，只保留第一条非空 trait。人类学类别是另一条 `anthro-code` 列表。导入用 `senses: parsed.senses` 整段替换。保存时从 `...rest` 拆掉旧键。
- 同类产品：FLEx 把 Status 写成义项上一条 `<trait name="status" value="..."/>`（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)，Sense elements → Status）。只允许一条。值来自 FLEx Status 列表。Jieyu 不内置那份封闭列表。它排在 Anthropology Categories 之后。
- 业内：SIL LIFT 0.13 的 `<trait>` 挂在父元素上，`name` 区分种类。
- 公认不可行：把状态写进人类学类别；读取词条上的同名 trait；同一义项保留多条 status；为这一条字符串新开 Dexie 版本；在本切片做词汇关系。
- 潜在的坑：保存时若不从 `...rest` 拆掉旧值，清空后状态还在。空 value 要丢掉，后面的同名 trait 不能覆盖第一条非空值。`status` 必须按属性精确匹配。导入省略该 trait 时义项数组会被整段替换。
- 决定：**复用** 义项类型的单值 trait 读取。`senseStatus` 是该义项第一条非空 `status`。空白省略键。出站一条，排在人类学类别之后、子义项之前。忽略词条级 `status`。无新 flag，无新 Dexie 版本，无新 controller，无封闭词表。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + 义项列表的一个字符串
- 拒绝：新 controller；封闭词表；多值列表；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略义项 `senseStatus` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 义项 `name="status"` |
| `LexiconEntryEditForm.tsx` / `LexiconExtraSenseEditor.tsx` / `LexiconSenseList.tsx` | 单行输入与义项列表 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空 value 被丢掉。同一义项只保留第一条非空值。
- 再次导入省略该 trait 时，状态随 `senses` 整段替换而消失，人类学类别仍按同一规则重读。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
