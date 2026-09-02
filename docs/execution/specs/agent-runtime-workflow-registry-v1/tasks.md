---
title: agent-runtime-workflow-registry-v1 tasks
doc_type: execution-spec-tasks
status: active
owner: ai-governance
last_reviewed: 2026-09-02
source_of_truth: agent-runtime-workflow-registry-v1-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Agent Runtime Workflow Registry v1 (A12)

## Implementation tasks

- [x] A12.1 `workflowStepKinds.ts` + composed `stepKinds` 与 `steps` 等长 → composed / registry 单测
- [x] A12.2 registry 增 `reflectionHandlerId` / `maxReflectionRetries` / `outputSchemaId` / `stepKinds`；envelope Zod 查表 → registry 单测
- [x] A12.3 + A10.6 `executeReadonlyToolBatch`（拒写、Promise.all、一次 commit）→ `executeReadonlyToolBatch.test.ts`
- [x] A12.4 治理：composed 步 ⊆ registry；checklist keys = registry keys
- [x] A12.5 `verticalWorkflowReflectionDispatch` + finalize 改走 dispatch；`after_model` 相位 → dispatch / callbacks / 既有 vertical 单测
- [x] 路线图 A12 剩余项对账

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 触及域 vitest
- [x] `npm run check:architecture-guard`
- [x] `npm run check:agent-evals:smoke`
- [x] `npm run check:docs-governance`
- [x] 无新默认开 UI flag

## Commit 证据模板

```
feat(ai): A12 workflow step kinds, registry metadata, readonly batch

Verified:
- npm run typecheck
- npx vitest run <touched>
- spec: docs/execution/specs/agent-runtime-workflow-registry-v1/
```

## Post-merge

- [ ] spec `status: completed` 待 A12.3 接入 send-turn 后再关（本切片 API 先行）
