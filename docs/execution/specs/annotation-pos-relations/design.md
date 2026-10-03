---
title: annotation-pos-relations design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-29
source_of_truth: annotation-pos-relations-spec
depends_on:
  - ./requirements.md
---

# Design — Annotation POS and morphology relations

## 1. 成熟方案扫描 / Research

- 仓库既有：`updateTokenPos` 写单个 token；`batchUpdateTokenPosByForm` 只扫一个 unit。CoNLL-U 导出已把 17 个 UD 标签当 UPOS，其余进 XPOS。`assignPartOfMwe` 是“一个动作、写回分析图、重新投影时保留”的模式。
- 同类产品：FLEx 的词类来自项目词类表，批量改的是同形词，不跨库。
- 业内：Universal Dependencies 的 UPOS 是封闭的 17 类。Leipzig 不规定重叠和异干的线性切分。
- 公认不可行：为了异干把 `went` 切成假词素；用 CoNLL-U 空节点表示零形式或词素顺序。
- 潜在的坑：自定义词性如 `v` 必须还能输入，否则现有标注和 XPOS 导出被下拉吃掉。
- 决定：**复用** token 写路径和 `partOfMwe` 的保留方式。词类建议**适配** UD 17 类，输入框保留。关系动作**自研**为五个纯函数，不新建图编辑器。

## 2. 架构选择

- 落位：纯函数选择写入对象；两个短 controller 只负责保存和错误。
- 拒绝：扩大 `useAnnotationMweController`；调用按 unit 批量的 API 去扫别的文本。

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `saveAnnotationPosByForm.ts` | 选出当前行里的同形词 | < 120 行 |
| `morphologyRelations.ts` | 五个关系的写入和保留 | < 220 行 |
| `useAnnotationPosBatchController.ts` | 保存并清草稿 | 2 hooks |
| `useAnnotationRelationController.ts` | 保存关系 | 2 hooks |

约束自查：无新 mega-hook；页面只组装；无新边框。

## 4. ADR 引用

- [ADR 0022](../../../adr/0022-annotation-analysis-graph-typed-relations.md)。不新建 ADR。

## 5. Feature flag

- 不新增。

## 6. 失败模式 / 兼容性

- 未保存的注释草稿会挡住批量词性和关系保存。
- 重新投影时，端点还在的关系会接回。

## 7. 验证矩阵

| 验证 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | `npx vitest run src/annotation/morphologyRelations.test.ts src/pages/annotation/saveAnnotationPosByForm.test.ts src/pages/AnnotationPage.test.tsx` | 通过 |
| 类型 | `npx tsc --noEmit` | 0 |
