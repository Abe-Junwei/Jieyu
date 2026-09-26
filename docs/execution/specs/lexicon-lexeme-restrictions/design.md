---
title: lexicon-lexeme-restrictions design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-restrictions-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Entry Restrictions

## 1. 成熟方案扫描 / Research

- 仓库既有：词条参考文献已经按 `<note type="bibliography">` 读写。无 type 的 note 仍是 `notes`。`entryNote` 按 type 找词条的直接子 note。
- 同类产品：FLEx 把 Entry Restrictions 写成 `<note type="restrictions">`，里面是按书写系统分开的 `<form>`（[Technical Notes on LIFT used in FLEx](https://downloads.languagetechnology.org/fieldworks/Documentation/Technical%20Notes%20on%20LIFT%20used%20in%20FLEx.pdf)）。它排在 Bibliography 后面。义项限制是 sense 里的同名 note。
- 业内：SIL LIFT 0.13 的 note 用可选 `type` 区分。interlineaR 同样按 `note[@type]` 取分析语言 form。
- 公认不可行：把限制写进参考文献或无 type 备注；读 sense 里的 restrictions note；为这一条文本新开 Dexie 版本。
- 潜在的坑：出站若排在参考文献前面，旧的「按 type 找第一条」不受影响，但和 FLEx 词条顺序不一致。保存时若不从 `...rest` 拆掉旧键，清空后字符串还在。
- 决定：**复用** 参考文献的 note-type 读取。`restrictions` 是词条级第一条非空 form 文本。空白省略键。出站一个 `note type="restrictions"`，lang 固定 `und`，放在参考文献之后。无新 flag，无新 Dexie 版本。

## 2. 架构选择

- 落位：既有 save helper + LIFT 序列化 + edit controller 的一个标量字段
- 拒绝：新 controller；义项限制；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略 `restrictions` |
| `lexiconLiftImport.ts` / `lexiconLiftExport.ts` | 词条 `type="restrictions"` |
| `LexiconEntryEditForm.tsx` / `LexiconPage.tsx` | 输入与概览 |

## 4. ADR 引用

- 无新 ADR。词条仍不进协作快照（ADR-0034）。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 没有 `lang` 的 form 仍被 `formPairs` 跳过。
- 导入省略限制 note 时保留已有值，也不清参考文献。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save + LIFT + LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
