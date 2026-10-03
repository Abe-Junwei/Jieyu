---
title: annotation-alternative-analysis design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-29
source_of_truth: annotation-alternative-analysis-spec
depends_on:
  - ./requirements.md
---

# Design — Annotation alternative analysis

## 1. 成熟方案扫描 / Research

- 仓库既有：`alternativeAnalysis` 已是分析图关系类型。二次分词把候选写在 `unit_relations`，role 为 `retokenize`。`assignPartOfMwe` 是“一个动作、写回分析图、重新投影时保留”的模式。
- 同类产品：FLEx 对歧义词保留多条分析，用户选定当前分析，不删掉其余条目。
- 业内：CoNLL-U 一次只投一个 UPOS。多分析不能同时写成多行词。
- 公认不可行：用空节点或任意图编辑器表达“尚未选定”。
- 潜在的坑：二次分词快照也用 `alternativeAnalysis`。把它放进选择列表会改掉恢复用的 role。
- 决定：**复用**分析图保存和重新投影保留。候选列表只收 `pending` / `accepted` / `rejected`（以及未写 role 的边）。

## 2. 架构选择

- 落位：纯函数负责列出和选定；短 controller 负责脏草稿和保存。
- 拒绝：把选择塞进 `useAnnotationRelationController`；在页面里直接改分析图。

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `alternativeAnalysis.ts` | 列出候选、选定、重新投影保留 | < 180 行 |
| `analysisGraphView.ts` | 两条以上未拒绝候选才可点选定 | 读出 |
| `useAnnotationAlternativeAnalysisController.ts` | 脏草稿跳过并保存 | < 80 行 |
| `AnnotationIgtRow.tsx` | 聚焦行芯片和按钮 | 组装 |

约束自查：无新 mega-hook；编排层不写选择规则；无新边框。

## 4. ADR 引用

- [ADR 0022](../../../adr/0022-annotation-analysis-graph-typed-relations.md) M2b `alternativeAnalysis`。不新建 ADR。

## 5. Feature flag

- 不新增。沿用已开放的标注页。

## 6. 失败模式 / 兼容性

- 找不到候选、或同一来源少于两条时抛错，界面显示保存失败。
- 脏草稿不调用保存。
- 选定后去掉以 `Ambiguous` 开头的需复核诊断，避免选定后仍提示未选。

## 7. 验证矩阵

| 验证 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | `npx vitest run src/annotation/alternativeAnalysis.test.ts src/annotation/analysisGraphView.test.ts src/annotation/analysisGraph.test.ts` | 通过 |
| 类型 | `npx tsc --noEmit` | 0 |
| 文档 | `npm run check:docs-governance` | 通过 |
