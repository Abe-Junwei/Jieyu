---
title: corpus-analysis-query-tools requirements
doc_type: execution-spec-requirements
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: corpus-analysis-query-tools-spec
---

# Requirements — corpus-analysis-query-tools

## 1. What & Why

- **要做什么**：三个只读查询进现有本地工具：共现、词类相邻 gloss、反例。
- **为什么现在做**：用户要求先完成智能体第一阶段（B16a / #315），不调模型。
- **不做什么**：不写主张、不渲染分析正文、不接文献或网页（B16b / B17）。

## 2. 用户场景

1. 查询某个 gloss 时，返回左邻、目标、右邻，每条带 `unitId`。
2. 给定词类，返回该词类词上相邻 gloss 的次数。
3. 给定「某词类应出现某 gloss」，返回符合句数和反例 `unitId`。

## 3. 验收标准

- [x] 固定夹具上三次查询的次数和 id 正确
- [x] flag 默认关，关时工具说明不进提示词；调用返回 `flag_off`
- [x] 只读，不写库

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| 纯函数 | `src/ai/analysis/corpusAnalysisQueries.ts` | 新增 |
| 工具执行 | `src/ai/chat/executors/corpusAnalysis.ts` | 新增 |
| 登记 | `src/ai/chat/localContextToolTypes.ts`、`src/ai/policy/localContextToolEffects.ts` | 修改 |
| Flag | `src/ai/config/featureFlags.ts` | 修改 |
