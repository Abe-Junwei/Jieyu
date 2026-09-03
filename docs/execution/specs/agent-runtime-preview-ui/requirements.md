---
title: agent-runtime-preview-ui requirements
doc_type: execution-spec-requirements
status: active
owner: ai-governance
last_reviewed: 2026-09-02
source_of_truth: agent-runtime-preview-ui-spec
---

# Requirements — Agent Runtime Preview UI (A11)

## 1. What & Why

- **要做什么**：把写工具人在环收成同源 UI：`AgentUiEvent` + 结构化 Preview-diff + triage 上屏，确认后仍只经 A10 `commitToolEffects`。
- **为什么现在做**：主路线图 Wave 3 下一刀；A7/A10 已落地，聊天侧仍是零散 pending alert + 三行 impact，与 audit 未同源。
- **不做什么**：不引入 bash 权限框 / Google ADK；不做 A12 StepKind、A9 guard、B4 标注页壳；不改 ChatWindow 编排。

## 2. 用户场景（≤ 3 条）

1. 语言学家在转写聊天里遇到 scope 内写（如 `set_transcription_text` / `propose_changes`）：看到 child-step diff，点确认后写入，session `lastToolName` 经 `commitToolEffects` 可 readback。
2. 策略挡住破坏性写：审批历史显示 triage=abandon/human，并发出 `write_blocked` 事件（含 `agentRunId`）。
3. flag 关闭时：现网 AlertsPanel 行为不变。

## 3. 验收标准（可测）

- [ ] `AgentUiEvent` 与 tool decision audit 同 `agentRunId`（pending / blocked / confirmed）
- [ ] Preview 使用 `AiChangeTransactionPreviewV1`（含可选 `agentRunId`），不再只靠 3 行 impact
- [ ] `toolDecisionFailureReason` triage（clarify/human/retry/abandon）在 flag 开启时上屏
- [ ] 至少一条写路径：preview → confirm → `commitToolEffects`，session memory readback
- [ ] `aiAgentUiPreviewEnabled` 默认 `false`

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Runtime | `src/ai/runtime/agentUiEvents.ts` | 新增 |
| Preview DTO | `src/ai/changeset/aiChangeTransactionPreviewV1.ts` | 扩展 `agentRunId` |
| Pipeline / confirm | `toolDecisionPipeline.ts`、`useAiChat.confirmExecution.ts`、`useAiChat.pendingToolCall.ts` | 发事件 |
| Hook / UI | `useAgentUiEvents.ts`、`AgentWritePreviewSection.tsx`、`AiChatAlertsPanel.tsx` | 新增 / 装配 |
| Flag / i18n | `featureFlags.ts`、`dictKeys.ts`、zh/en 字典 | 新增 |
| 测试 | 上述对应 `*.test.ts(x)` | 新增 / 修改 |

## 5. 已知风险与依赖

- 依赖 A8 `agentRunId`、A10 `commitToolEffects`、A7 `supportsPreview`。
- 勿向 `TranscriptionPage.ChatWindow.tsx` / Orchestrator 堆逻辑；AlertsPanel 已近 500 行，preview 块抽独立组件。
- 回滚：关 flag 或 revert。
