---
title: lexicon-lexeme-type requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-25
source_of_truth: lexicon-lexeme-type-spec
depends_on:
  - ../lexicon-lift-import/requirements.md
---

# Requirements — Lexicon Entry Type

## 1. What & Why

- **要做什么**：`/lexicon` 可编辑词条类型（`lexemeType`），保存后概览 readback。
- **为什么现在做**：LIFT `morph-type` 已经进出 `lexemeType`，详情只读，表单还不能改。
- **不做什么**：语素类型 `morphemeType` 编辑；封闭类型表；例证；DMLex；新 flag。

## 2. 用户场景（≤ 3 条）

1. 把词条类型从已有值改成新值，保存后概览显示新值。
2. 清空词条类型再保存，readback 不再带 `lexemeType`。
3. 只改词条类型时，已有 `morphemeType` 仍留在词条上。

## 3. 验收标准（可测）

- [ ] `lexemeType` write→list readback
- [ ] 空白词条类型不写入
- [ ] 保存不清除 `morphemeType`
- [ ] 无新 flag、无新表

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Save | `saveLexiconEntry.ts` | 写入 / 清空 `lexemeType` |
| Controller / form | edit controller + form | 词条类型输入 |
| 测试 | save / LexiconPage | 新增 |
