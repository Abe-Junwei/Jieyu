---
title: lexicon-sense-category design
doc_type: execution-spec-design
status: active
owner: lexicon
last_reviewed: 2026-09-24
source_of_truth: lexicon-sense-category-spec
depends_on:
  - ./requirements.md
---

# Design — Lexicon Sense Part of Speech

## 1. 成熟方案扫描 / Research

- 仓库既有：`Sense.category` 已在类型和 Zod 里；LIFT 入站读 `grammatical-info value`，出站写同一元素；详情列表已显示 `sense.category`。编辑草稿和 `applyLexiconEntryFields` 还没带这个字段，所以导入后的词类无法在表单里改，清空也不会落库。
- 同类产品：FLEx / WeSay 的义项词类就是 LIFT `<grammatical-info value="..."/>`。值来自语言的 range，不是全世界共用的一个下拉表（[LIFT](https://github.com/sillsdev/lift-standard)）。
- 业内：SIL LIFT 0.13 仍是本仓库的词典交换格式。OASIS DMLex 把 part of speech 做成另一套模块，不适合当作这一刀的编辑模型。
- 公认不可行：为词类新建 Dexie 表；用英语 POS 封闭列表挡住 FLEx 里的 `Noun` 等自由值；把 DMLex 文档塞进保存路径。
- 潜在的坑：保存时若继续展开旧 sense，用户清空输入后旧 `category` 还会留着。
- 决定：**复用** `Sense.category` 与现有 LIFT `grammatical-info`。表单用自由文本。空字符串省略该键。无新 flag。

## 2. 架构选择

- 落位：既有 save helper + edit controller 字段
- 拒绝：新 controller；词类 range 文件；DMLex

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `saveLexiconEntry.ts` | 写入或省略 `category` |
| form + controller | 主义项与额外义项输入 |

## 4. ADR 引用

- 无新 ADR。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 空词类省略 `category`，不把空白字符串写入。
- 未改 LIFT 元素名。已有导入导出测试继续覆盖 `grammatical-info`。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | save / LexiconPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
