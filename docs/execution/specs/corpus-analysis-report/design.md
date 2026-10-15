---
title: corpus-analysis-report design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: corpus-analysis-report-spec
depends_on:
  - ./requirements.md
---

# Design — corpus-analysis-report

## 1. 成熟方案扫描 / Research

- 仓库既有最相似的模式：`elanFlexCompatibilityWorkflow.ts`。模型输出结构化 JSON，代码解析后再渲染。
- 同类产品：Consensus 没有证据就不回答，悬停显示原文。Elicit 先抽表再写报告。
- 业内做法：OpenScholar 记录不检索时引用会大面积编造。主张必须引用当次查询行。
- 不可行：让模型直接写可复制正文。流式增量会先把未核对的句子显示出来。
- 坑：自研 `agentLoopRunner` 不是新的多步循环。路线图 A15 已定循环用 Vercel AI SDK 的 ToolLoopAgent。
- 决定：本片只做主张解析、核对和渲染。工具结果回到模型再写主张，走 A15，不扩展 `agentLoopRunner`。flag 默认关。词形可发给用户自选的云端模型，见 ADR-0055。例句从工具行填回。

## 2. 架构选择

- 落位：纯函数解析和渲染，工作流登记，流式阶段跳过可见增量，收尾时替换正文。
- 选核对后渲染，而不是模型直接写段落，因为对不上的主张必须删掉。
- 清单不要求证据包。证据是本次工具行，不是 packet。

## 3. 验证

- `npx vitest run src/ai/vertical/corpusAnalysisReport.test.ts src/ai/vertical/verticalWorkflowSelection.test.ts src/ai/vertical/verticalP0.test.ts`
- `npm run typecheck`
