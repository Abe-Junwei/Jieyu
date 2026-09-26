---
title: lexicon-lexeme-bibliography design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-bibliography-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Entry Bibliography

## 1. 成熟方案扫描 / Research

- 仓库既有：`LexemeDocType.notes` 是多语言备注。入站原先取 `directChildren(entry, 'note')[0]`，不看 `type`。出站写成没有 type 的 `<note>`。字面意义已经是一条字符串。
- 同类产品：FLEx 把 Entry Bibliography 写成 `<note type="bibliography">`，里面是按书写系统分开的 `<form>`（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)）。义项参考文献是 sense 里的同名 note。词源书目是 etymology 里的 `<field type="bibliography">`。
- 业内：interlineaR 把无 type 的 `./note` 当一般备注，把 `./note[@type="bibliography"]` 当参考文献。SIL LIFT 0.13 的 note 可以带可选 `type`。
- 公认不可行：继续把第一条 note 当备注；把义项参考文献或词源 field 写进词条参考文献；为这一条文本新开 Dexie 版本。
- 潜在的坑：参考文献排在无 type 备注前面时，旧的「第一条 note」会把书目写进 `notes`。出站若把 typed note 放在前面，旧导入器仍会吞掉它。保存时若不从 `...rest` 拆掉旧键，清空后字符串还在。
- 决定：**复用** 词条 JSON。`bibliography` 是词条级第一条非空 form 文本。空白省略键。出站一个 `note type="bibliography"`，lang 固定 `und`，放在无 type 备注之后。入站只认词条级 `type="bibliography"`，一般备注只认没有 type 的 note。无新 flag，无新 Dexie 版本。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + edit controller 的一个标量字段
- 拒绝：新 controller；义项参考文献；词源 field；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略 `bibliography` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 按 note type 分开 |
| `LexiconEntryEditForm.tsx` / `LexiconPage.tsx` | 输入与概览 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 没有 `lang` 的 form 仍被 `formPairs` 跳过。
- 导入省略参考文献 note 时保留已有值。
- 无 type 备注的读写保持多语言 `notes`。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
