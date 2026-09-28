---
title: lexicon-sense-bibliography design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-sense-bibliography-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Bibliography

## 1. 成熟方案扫描 / Research

- 仓库既有：词条 `bibliography` 已经是 entry 上 `<note type="bibliography">` 的第一条 form。义项人类学注释等同型 note 只读该义项的直接子节点。导入用 `senses: parsed.senses` 整段替换。保存时从 `...rest` 拆掉旧键。
- 同类产品：FLEx 把 Sense Bibliography 写成义项上的 `<note type="bibliography">`，里面按书写系统放 form（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)，Sense elements → Bibliography）。词条级参考文献是另一条同名 note。它排在 Anthropology Note 后面、Discourse Note 前面。
- 业内：SIL LIFT 0.13 的 note `type` 区分种类。无 type 的 note 是 General Note。同一 type 只取第一条带 `lang` 的 form。
- 公认不可行：把义项参考文献写进词条 `bibliography`；读取词条上的同名 note；把无 type note 当成参考文献；为这一条字符串新开 Dexie 版本。
- 潜在的坑：保存时若不从 `...rest` 拆掉旧值，清空后参考文献还在。出站两条同名 note 分别在 entry 和 sense 上，断言必须按所在元素区分。导入省略义项 note 时义项数组会被整段替换。
- 决定：**复用** 义项 typed note。`senseBibliography` 是该义项第一条带 `lang` 的 form 文本。空白省略键。出站 `lang="und"`，排在人类学注释之后、语篇注释之前。不改词条参考文献。无新 flag，无新 Dexie 版本，无新 controller。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + 义项列表的一个字符串
- 拒绝：新 controller；并入词条参考文献；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略义项 `senseBibliography` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 义项 `note type="bibliography"` |
| `LexiconEntryEditForm.tsx` / `LexiconExtraSenseEditor.tsx` / `LexiconSenseList.tsx` | 单行输入与义项列表 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空白省略该键。词条参考文献保持原样。
- 再次导入省略该 note 时，义项参考文献随 `senses` 整段替换而消失，人类学注释和词条参考文献仍按同一规则重读。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
