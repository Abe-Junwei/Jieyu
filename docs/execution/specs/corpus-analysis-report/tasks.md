---
title: corpus-analysis-report tasks
doc_type: execution-spec-tasks
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: corpus-analysis-report-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — corpus-analysis-report

## Implementation tasks

- [x] ADR-0055 词形可发云端，例句从工具行填回
- [x] 解析、核对、渲染纯函数与夹具测试
- [x] 工作流 `corpus_analysis_report`，flag 默认关，关时不可选
- [x] 流式不把主张 JSON 写入可见消息；收尾用核对后的正文

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 定向 vitest
- [x] 不适用：不改页面布局，不跑 e2e
- [ ] `npm run check:agent-evals:smoke`
- [x] `npm run check:docs-governance`

## Post-merge

- [ ] 自用后再考虑把 flag 默认打开
- [ ] 删除 `docs/execution/specs/corpus-analysis-report/`
