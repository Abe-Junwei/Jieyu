---
title: annotation-utterance-graph-change requirements
doc_type: execution-spec-requirements
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: annotation-utterance-graph-change-spec
---

# Requirements — annotation-utterance-graph-change

## 1. What & Why

- **要做什么**：四条分析图写入共用投影、调用方变换和按行基线保存。
- **为什么现在做**：关系、多词表达和备选分析各自重复这段顺序；草稿规则不能合并。
- **不做什么**：不统一草稿策略，不把 `reload()` 放进保存，不改行内展示、多词表达导出和词类菜单测试。

## 2. 用户场景

1. 标注人在没有未保存草稿时标记关系、确认多词表达或选择备选分析，分析图按该行当前基线写入并刷新。
2. 标注人给目标 token 添加词类，且该 token 的词类草稿与提交值一致时，写入仍然发生。
3. 语段没有可投影文本时不写入，界面记为失败。

## 3. 验收标准

- [x] 投影失败时保存不被调用，函数返回 `null`。
- [x] 同一行基线的第二次写入抛出 `analysisGraph baseline conflict`，库中保留第一次分析图。
- [ ] `addPos` 仍允许目标 token 的词类草稿与提交值一致。（检查留在调用方，本切片未另写测试。）

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| 保存 | `src/pages/annotation/saveAnnotationUnitAnalysisGraph.ts` | 修改 |
| Controller | `src/pages/useAnnotationRelationController.ts` | 修改 |
| Controller | `src/pages/useAnnotationMweController.ts` | 修改 |
| Controller | `src/pages/useAnnotationAlternativeAnalysisController.ts` | 修改 |
