---
title: corpus-analysis-report requirements
doc_type: execution-spec-requirements
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: corpus-analysis-report-spec
---

# Requirements — corpus-analysis-report

## 1. What & Why

- **要做什么**：模型只输出引用行 id 的主张；代码核对本次查询结果后渲染可复制正文。
- **为什么现在做**：B16a 查询已落地。用户要求继续做主张、核对和正文（#317）。
- **不做什么**：不接文献、网页或外部语料（B17）。不设写作工作区。不把输出 token 上限调高。

## 2. 用户场景

1. 用户问共现或反例时，回复是核对过的主张加例句，例句词形来自查询行。
2. 主张引用了本次结果里没有的 id 时，这条主张不出现；全部对不上则没有正文。
3. flag 关闭时，这句话不选中该工作流。

## 3. 验收标准

- [x] 夹具：命中行保留库里的词形，未知 id 的主张被删，全部失败时正文为空
- [x] flag 默认关，关时关键词不选中 `corpus_analysis_report`
- [x] 流式增量不把主张 JSON 写入可见消息

## 4. 受影响代码地图

- `src/ai/vertical/corpusAnalysisReport.ts`
- `src/ai/vertical/verticalWorkflowRegistry.ts`
- `src/hooks/ai/useAiChat.sendTurnStreamPhase.ts`
- `src/hooks/ai/useAiChat.sendTurnStreamPhase.completionPipelineVerticalFinalize.ts`
