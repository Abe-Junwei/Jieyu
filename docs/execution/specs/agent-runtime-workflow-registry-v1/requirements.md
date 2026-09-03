---
title: agent-runtime-workflow-registry-v1 requirements
doc_type: execution-spec-requirements
status: active
owner: ai-governance
last_reviewed: 2026-09-02
source_of_truth: agent-runtime-workflow-registry-v1-spec
---

# Requirements — Agent Runtime Workflow Registry v1 (A12)

## 1. What & Why

- **要做什么**：把垂直 workflow 收成可登记合同——`WorkflowStepKind`、registry 扩展（reflection / outputSchema / retries）、composed `parallel(readonly)`、只读工具并行 batch（A10.6），B4/B7 新 workflow 只能走 registry。
- **为什么现在做**：Wave 3 后半；checklist / `workflowAnswerReady` 已有，缺 step 种类、registry 元数据与并行只读。
- **不做什么**：不引入 LangGraph / ADK；不做 A13 TaskRunner、A9 guard、B4 标注页；不改 ChatWindow。

## 2. 用户场景

1. 开发者新增 B4 workflow：必须写入 `VERTICAL_WORKFLOW_REGISTRY_V0`，否则单测/守卫失败。
2. composed 模板声明 `llm` 步与 `parallel_readonly` 步；只读工具 `Promise.all` 后一次 `commitToolEffects`。
3. Finalize 按 registry `reflectionHandlerId` 跑 reflection，并触发 `after_model` callback；checklist 未闭合则 envelope `degraded`，agent loop 不得 `answer_ready`。

## 3. 验收标准（可测）

- [x] `WorkflowStepKind` = `llm` | `tool` | `gate` | `parallel_readonly`
- [x] 每个 registry 项有 `reflectionHandlerId`、`maxReflectionRetries`、`outputSchemaId`、`stepKinds`
- [x] `executeReadonlyToolBatch` 拒绝 write 工具；并行执行；一次 commit
- [x] composed 步 id ⊆ registry；finalize 不再按 workflowId 写死四大 if/else
- [x] checklist 未闭合 → envelope `degraded`（已有路径保持）

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| Vertical | `workflowStepKinds.ts`、`verticalWorkflowRegistry.ts`、`verticalWorkflowReflectionDispatch.ts`、`composedWorkflowTemplates.ts` | 新增 / 扩展 |
| Runtime | `executeReadonlyToolBatch.ts`、`agentCallbacks.ts`（`after_model`） | 新增 / 扩展 |
| Hook | `completionPipelineVerticalFinalize.ts` | 改走 dispatch |
| 测试 | 上述 `*.test.ts` | 新增 / 修改 |

## 5. 已知风险与依赖

- 依赖 A10 catalog / `commitToolEffects`。勿把并行 batch 接到现网 sequential local-tool 路径（政策/clarify 仍串行）。
- 回滚：revert；无新用户可见 flag（非 UI）。
