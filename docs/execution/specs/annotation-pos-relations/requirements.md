---
title: annotation-pos-relations requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-29
source_of_truth: annotation-pos-relations-spec
depends_on:
  - ../annotation-gloss-structure/requirements.md
---

# Requirements — Annotation POS and morphology relations

## 1. What & Why

- **要做什么**：词性可从通用依存词类里选，并能按当前文本的同形词批量写入；重叠、异干、换段、删段、声调各有一个明确动作。
- **为什么现在做**：标注页词性还是纯文本，分析图里这几类关系只有类型、没有保存动作。
- **不做什么**：任意图编辑器；依存和共指；把这些过程写成 FLEx 字段或 ELAN 层；改别的文本。

## 2. 用户场景（≤ 3 条）

1. 编辑词性时能选到 17 个通用依存词类，也能留下不在表里的作者标签。
2. 把一个词性应用到当前文本里表面形式相同、且没有未保存草稿的词。
3. 在词素上标记“复制上一词素”，或在已链接的词上标记异干。换段、删段、声调记在整词上，不切开形式。

## 3. 验收标准（可测）

- [x] 同形词写入只覆盖传入的行；脏草稿被跳过；`NOUN` 进入 `hasPos`
- [x] 重叠、异干、三种过程可写入并在重新投影后保留
- [x] 异干的表面跨度覆盖整词
- [x] 两个词素的顺序在 CoNLL-U 里只作为诊断

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| 纯函数 | `udPosTags.ts`、`morphologyRelations.ts`、`saveAnnotationPosByForm.ts` | 新增 |
| Controller | `useAnnotationPosBatchController.ts`、`useAnnotationRelationController.ts` | 新增 |
| 行 | `AnnotationIgtRow.tsx`、`AnnotationWorkspace.tsx` | 组装 |

## 5. 已知风险与依赖

- 转写页没有独立词类表。下拉建议用通用依存的 17 个标签，输入框仍接受自定义值。
- 词素顺序、零形式、非连续和这些过程都不写成 CoNLL-U 空节点。
