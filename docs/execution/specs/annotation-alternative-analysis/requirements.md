---
title: annotation-alternative-analysis requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-29
source_of_truth: annotation-alternative-analysis-spec
depends_on:
  - ../annotation-pos-relations/requirements.md
---

# Requirements — Annotation alternative analysis

## 1. What & Why

- **要做什么**：同一来源有多条分析时，聚焦行列出候选，并允许选定其一写入分析图。
- **为什么现在做**：`alternativeAnalysis` 已在 schema 和歧义 fixture 里，标注行还不能选定。
- **不做什么**：任意图编辑器；改二次分词快照边；覆盖未保存的格子草稿；把选定结果写成 CoNLL-U 空节点。

## 2. 用户场景（≤ 3 条）

1. 聚焦句段看到同一词的多条待选分析。
2. 选定一条后，该条为已选，其余为未选，重新打开仍在。
3. 格子里还有未保存的词性或注释时，选定不写库。

## 3. 验收标准（可测）

- [x] 歧义 fixture 列出两条 pending，选定后一条 accepted、一条 rejected，并写入 `hasPos`
- [x] 少于两条候选时拒绝选定
- [x] `retokenize` 边不出现在候选列表，选定分析时不改它的 role
- [x] 重新投影后候选节点和边仍在

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| 纯函数 | `alternativeAnalysis.ts`、`analysisGraphView.ts` | 新增 / 读出 |
| Controller | `useAnnotationAlternativeAnalysisController.ts` | 新增 |
| 行 | `AnnotationIgtRow.tsx`、`AnnotationWorkspace.tsx` | 组装 |

## 5. 已知风险与依赖

- 选定只写分析图上的 `hasPos`，不改 `unit_tokens.pos`。作者词性格子保持原值。
- 二次分词的 `retokenize` / `retokenize-snapshot` 仍走既有覆盖与恢复，不进这个选择列表。
