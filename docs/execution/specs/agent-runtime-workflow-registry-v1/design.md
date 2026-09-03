---
title: agent-runtime-workflow-registry-v1 design
doc_type: execution-spec-design
status: active
owner: ai-governance
last_reviewed: 2026-09-02
source_of_truth: agent-runtime-workflow-registry-v1-spec
depends_on:
  - ./requirements.md
  - ../../../architecture/ai-agent-runtime-runner-model.md
  - ../../../adr/0030-vertical-workflow-template-contract.md
---

# Design — Agent Runtime Workflow Registry v1 (A12)

## 1. 成熟方案扫描 / Research

- 仓库既有：`verticalWorkflowRegistry` V0、`workflowCompletionChecklist`、`composedWorkflowTemplates` 串行 LLM 步、`commitToolEffects` 已对 local-context **一次提交**、`isReadOnlyLocalContextToolName`
- 同类产品：LangGraph 用 node 种类（LLM / tool / gate）+ fan-out `Promise.all` / Send 做并行只读检索，再用 reducer 合并；Google ADK Workflow 把 step 标成 agent/function/tool，Join 后再写
- 业内 best practice：只读可并行；写必须串行+单一 commit；workflow 声明进 registry，禁止页面里再发明一条垂直链
- 公认不可行：引入 LangGraph 运行时；把 `streamCompletion` 现网 sequential local-tool（含 policy/clarify）改成无条件并行（会打乱 clarify/block 短路径）
- 潜在的坑：Zod 挂在 registry 对象上使快照测试变重 → 用 `outputSchemaId` 查表；finalize if/else 平移成 mega-dispatch 文件
- 决定：**适配** LangGraph/ADK 的 step kind + 只读 fan-out；**自研** TS 最小实现，复用现有 checklist / reflection 函数

## 2. 架构选择

- 落位：`derived`（kind / schema）+ `actions`（batch + reflection dispatch）
- 方案 A：registry 元数据 + `executeReadonlyToolBatch` 独立 API — **选 A**
- 拒绝：把并行直接替换 streamCompletion 多 tool 循环

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `src/ai/vertical/workflowStepKinds.ts` | StepKind 联合类型 | < 40 |
| `src/ai/vertical/verticalWorkflowReflectionDispatch.ts` | registry → 现有 reflection | < 120 |
| `src/ai/runtime/executeReadonlyToolBatch.ts` | 并行只读 + 一次 commit | < 100 |
| `src/ai/runtime/agentCallbacks.ts` | 增 `after_model` | 数行 |
| `composedWorkflowTemplates.ts` | `stepKinds` 对齐 `steps` | 接线 |

## 4. ADR 引用

- [ADR-0030](../../../adr/0030-vertical-workflow-template-contract.md) 模板合同；不新建 ADR。

## 5. Feature flag

- 无新用户可见 flag（registry / 只读 batch 为内部 API；现网 send-turn 多工具仍串行）

## 6. 失败模式 / 兼容性

- 未知 workflowId：dispatch 返回 null（finalize 跳过 reflection，与缺分支等价）
- write 工具进入 batch：抛错，不 commit
- 回滚：revert

## 7. 验证矩阵

| 验证 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 |
| 单元 | `npx vitest run src/ai/vertical src/ai/runtime/executeReadonlyToolBatch.test.ts src/ai/runtime/agentCallbacks.test.ts` | pass |
| 守卫 | `npm run check:architecture-guard` + docs-governance | OK |
| evals | `npm run check:agent-evals:smoke` | OK |
