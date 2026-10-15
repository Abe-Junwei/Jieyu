---
title: corpus-analysis-query-tools tasks
doc_type: execution-spec-tasks
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: corpus-analysis-query-tools-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — corpus-analysis-query-tools

## Implementation tasks

- [x] 纯函数与夹具测试 → `npx vitest run src/ai/analysis/corpusAnalysisQueries.test.ts`
- [x] 登记三个只读工具、flag 默认关、关时不进提示词
- [x] 执行器按 `workspaceTextId` 读 `unit_tokens` / `unit_morphemes`

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 定向 vitest
- [x] 不适用：不改交互界面，不跑 e2e
- [x] 不适用：不新增页面 controller
- [ ] `npm run check:agent-evals:smoke`
- [x] `npm run check:docs-governance`
- [x] flag `corpusAnalysisQueryToolsEnabled` 默认 false

## Post-merge

- [ ] 自用后再考虑把 flag 默认打开
- [ ] 删除 `docs/execution/specs/corpus-analysis-query-tools/`
