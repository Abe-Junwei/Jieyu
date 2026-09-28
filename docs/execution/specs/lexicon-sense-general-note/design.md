---
title: lexicon-sense-general-note design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-general-note-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense General Note

## 1. 成熟方案扫描 / Research

- 仓库既有：词条 `notes` 已经是 entry 上无 `type` `<note>` 的多书写系统 form。义项带 type 的注释只读该义项的直接子节点。导入用 `senses: parsed.senses` 整段替换。保存时从 `...rest` 拆掉旧键。
- 同类产品：FLEx 把 Sense General Note 写成义项上没有 `type` 的 `<note>`，里面按书写系统放 form（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)，Sense elements → General Note）。词条级一般注释是另一条同形 note。它排在 Encyclopedic Info 后面、Grammar Note 前面。
- 业内：SIL LIFT 0.13 用有没有 `type` 区分一般注释和带种类的注释。同一 note 只取第一条带 `lang` 的 form。
- 公认不可行：把义项一般注释写进词条 `notes`；读取词条上的无 type note；把带 type 的 note 当成一般注释；为这一条字符串新开 Dexie 版本。
- 潜在的坑：保存时若不从 `...rest` 拆掉旧值，清空后注释还在。出站词条和义项都会有无 type `<note>`，断言必须按所在元素区分。导入省略义项 note 时义项数组会被整段替换。
- 决定：**复用** 义项 note 解析。`generalNote` 是该义项第一条无 `type` note 里带 `lang` 的 form 文本。空白省略键。出站不写 `type`，`lang="und"`，排在百科注释之后、语法注释之前。不改词条 `notes`。无新 flag，无新 Dexie 版本，无新 controller。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + 义项列表的一个字符串
- 拒绝：新 controller；并入词条 `notes`；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略义项 `generalNote` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 义项无 type `<note>` |
| `LexiconEntryEditForm.tsx` / `LexiconExtraSenseEditor.tsx` / `LexiconSenseList.tsx` | 单行输入与义项列表 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空白省略该键。词条 `notes` 保持原样。
- 再次导入省略该 note 时，一般注释随 `senses` 整段替换而消失，百科注释和词条注释仍按同一规则重读。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
