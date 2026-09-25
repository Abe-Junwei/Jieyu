---
title: lexicon-lexeme-type design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-type-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Entry Type

## 1. 成熟方案扫描 / Research

- 仓库既有：`LexemeDocType.lexemeType` 与 `morphemeType` 都是可选字符串。LIFT 入站把 `<trait name="morph-type">` 写入 `lexemeType`；出站用 `morphemeType ?? lexemeType` 写同一个 trait。详情概览已分别显示这两栏。编辑保存还没带 `lexemeType`，所以导入后的类型无法在表单里改，清空也不会落库。
- 同类产品：FLEx / WeSay 用一个 LIFT trait `morph-type` 表示词条是 stem、prefix、phrase 等。值来自语言的 range，不是全球共用下拉表（[LIFT](https://github.com/sillsdev/lift-standard)）。
- 业内：SIL LIFT 0.13 仍是本仓库的词典交换格式。DMLex 的 entry type 是另一套模块，不拿来当这一刀的编辑模型。
- 公认不可行：为类型新建 Dexie 表；用英语封闭列表挡住 FLEx 的 `stem` 等自由值；这一刀同时改 `morphemeType`，因为出站已经让它优先于 `lexemeType`。
- 潜在的坑：保存时若继续展开旧词条，用户清空输入后旧 `lexemeType` 还会留着。
- 决定：**复用** `lexemeType` 与现有 LIFT `morph-type`。表单用自由文本。空字符串省略该键。`morphemeType` 原样保留。无新 flag。

## 2. 架构选择

- 落位：既有 save helper + edit controller 字段
- 拒绝：新 controller；类型 range 文件；改出站优先级

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略 `lexemeType` |
| form + controller | 词条类型输入 |

## 4. ADR 引用

- 无新 ADR。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空词条类型省略 `lexemeType`。
- 已有 `morphemeType` 不因这次保存消失。LIFT 元素名不变。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save / LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
