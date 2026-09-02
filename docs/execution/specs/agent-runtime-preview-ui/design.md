---
title: agent-runtime-preview-ui design
doc_type: execution-spec-design
status: active
owner: ai-governance
last_reviewed: 2026-09-02
source_of_truth: agent-runtime-preview-ui-spec
depends_on:
  - ./requirements.md
  - ../../../architecture/ai-agent-runtime-runner-model.md
  - ./../agent-runtime-security-write-gate/design.md
---

# Design — Agent Runtime Preview UI (A11)

## 1. 成熟方案扫描 / Research

- 仓库既有：`AiChangeTransactionPreviewV1`、`AiChangeSetPreview`、`AiChatAlertsPanel` pending 确认、`getToolDecisionFailureTriage`、`commitToolEffects`、`AgentCallbackRegistry`（before_client 相位已留空）
- 同类产品：Claude Code / VS Code Copilot 写前展示 **结构化 diff**（path + before/after），Accept/Reject；Cursor 用事件把 agent 状态推到 UI，而不是各面板自拼文案
- 业内 best practice：HITL 预览与 audit **同源 id**；只读自动过、写经 preview（Anthropic containment：证据型确认，非「Allow bash」疲劳）
- 公认不可行：克隆 IDE 侧栏 diff editor；在 ChatWindow 再堆一套 pending 状态；gate 再生成一份 preview（A7 已规定 preview 来自 catalog）
- 潜在的坑：AlertsPanel 再加 hooks 逼近复杂度；flag 默认 true 会改变现网文案/DOM；事件总线若无测试复位会串测
- 决定：**适配** 现有 DTO + AlertsPanel 确认按钮；**自研** 最小 `AgentUiEvent` 总线（不引入 ADK Event 框架）

## 2. 架构选择

- 落位：`derived`（preview DTO）+ `actions`（emit/confirm）+ 轻量 UI 装配
- 方案 A：独立 event bus + AlertsPanel 订阅 — **选 A**，与 audit 同 `agentRunId`，ChatWindow 零改动
- 拒绝：把 UI 事件塞进 `AgentCallbackRegistry`（那是 tool 生命周期，不是用户可见 HITL）

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `src/ai/runtime/agentUiEvents.ts` | 事件类型 + 默认 bus | < 120 / 0 |
| `src/hooks/ai/useAgentUiEvents.ts` | 订阅最新事件 | < 40 / 2 |
| `src/components/ai/AgentWritePreviewSection.tsx` | flag 开时的 preview + triage | < 80 |
| `featureFlags.ts` | `aiAgentUiPreviewEnabled` 默认 false | 数行 |

约束自查：编排层不发事件；不引入 `src/features/`；面板不加第 3 层 border。

## 4. ADR 引用

- 不新建 ADR。架构：[ai-agent-runtime-runner-model.md](../../../architecture/ai-agent-runtime-runner-model.md)；策略：[write-gate design](../agent-runtime-security-write-gate/design.md) §2 L1 preview。

## 5. Feature flag

- Flag 名：`aiAgentUiPreviewEnabled`（env `VITE_AI_AGENT_UI_PREVIEW_ENABLED`）
- 默认值：`false`（所有环境矩阵）
- Rollout：合并 → 自用 1 周 → dogfood/staging 默认 true → 稳定后清 flag

## 6. 失败模式 / 兼容性

- flag off：不 emit、不渲染新 DOM，现网 pending/confirm 不变
- 无 `agentRunId` 时事件仍发，字段省略
- 回滚：关 flag 或 revert 本切片

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元 | `npx vitest run src/ai/runtime/agentUiEvents.test.ts src/components/ai/AgentWritePreviewSection.test.tsx src/hooks/ai/useAiChat.confirmExecution.proposeBatch.test.ts src/hooks/ai/useAiChat.toolDecisionPipeline.test.ts src/ai/config/featureFlags.environmentMatrix.test.ts` | all pass |
| 结构守卫 | `npm run check:architecture-guard` | OK |
| Agent evals | `npm run check:agent-evals:smoke` | OK |
| docs | `npm run check:docs-governance` | OK |
