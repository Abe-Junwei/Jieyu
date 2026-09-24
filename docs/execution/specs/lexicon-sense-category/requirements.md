---
title: lexicon-sense-category requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-24
source_of_truth: lexicon-sense-category-spec
depends_on:
  - ../lexicon-lift-import/requirements.md
---

# Requirements — Lexicon Sense Part of Speech

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑主义项与额外义项的词类（`senses[].category`），保存后详情 readback。
- **为什么现在做**：M3b 写了词类可编辑。字段、Zod 和 LIFT `grammatical-info` 已经往返，编辑表单还没露出。
- **不做什么**：DMLex；词类封闭词表；例证；新 flag；新 Dexie 版本。

## 2. 用户场景（≤ 3 条）

1. 主 gloss 旁填写词类，保存后详情显示该词类。
2. 额外义项单独填写词类，保存后跟在该义项上。
3. 清空词类再保存，readback 不再带 `category`。

## 3. 验收标准（可测）

- [ ] 主义项与额外义项 `category` write→list readback
- [ ] 空白词类不写入
- [ ] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入 / 清空 `category` |
| Controller / form | edit controller + form | 词类输入 |
| 测试 | save / LexiconPage | 新增 |
