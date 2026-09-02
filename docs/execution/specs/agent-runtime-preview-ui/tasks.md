---
title: agent-runtime-preview-ui tasks
doc_type: execution-spec-tasks
status: active
owner: ai-governance
last_reviewed: 2026-09-02
source_of_truth: agent-runtime-preview-ui-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Agent Runtime Preview UI (A11)

## Implementation tasks

- [ ] A11.1 `agentUiEvents.ts` + 单测（emit/subscribe/`agentRunId`） → `npx vitest run src/ai/runtime/agentUiEvents.test.ts`
- [ ] Flag `aiAgentUiPreviewEnabled` 默认 false + env 覆盖 → `npx vitest run src/ai/config/featureFlags.environmentMatrix.test.ts`
- [ ] A11.4 Preview DTO 增可选 `agentRunId` → `npx vitest run src/ai/changeset/aiChangeTransactionPreviewV1.test.ts`
- [ ] Pipeline pending/blocked emit；confirm 成功 emit `write_confirmed`；cancel emit `write_cancelled` → pipeline / proposeBatch / pending 单测
- [ ] A11.2–A11.3 `useAgentUiEvents` + `AgentWritePreviewSection` 接入 AlertsPanel；triage 字典键 → component 单测
- [ ] A11.5 confirm → `commitToolEffects` session `lastToolName` readback（已有路径补事件断言）
- [ ] i18n `dictKeys` + zh-CN / en-US
- [ ] 路线图 §2.2.2 Wave 3 A11 标 🟡；Wave 2 改为已合并

## Pre-merge gates

- [ ] `npm run typecheck`
- [ ] 触及域 vitest（上列路径）
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:agent-evals:smoke`
- [ ] `npm run check:docs-governance`
- [ ] Feature flag 已注册且默认 `false`
- [ ] E2E：本切片 flag 默认关，不改现网写确认 DOM；现网路径覆盖 `AiChatAlertsPanel.test.tsx` + confirmExecution 单测。全页写确认 e2e 留 flag 放量后补

## Commit 阶段证据模板

```
feat(ai): add A11 AgentUiEvent write preview bus (flag off)

Verified:
- npm run typecheck
- npx vitest run <touched>
- spec: docs/execution/specs/agent-runtime-preview-ui/
```

## Post-merge

- [ ] 自用 1 周后考虑 dogfood 默认 true
- [ ] spec `status: completed` + `closed_at`
