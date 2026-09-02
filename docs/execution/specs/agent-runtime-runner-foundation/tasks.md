---
title: agent-runtime-runner-foundation tasks
doc_type: execution-spec-tasks
status: active
owner: ai-governance
last_reviewed: 2026-09-02
source_of_truth: agent-runtime-runner-foundation-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Agent Runtime Runner Foundation (A10)

## Implementation tasks

- [x] A10.1 `AgentCallbackRegistry`（before_turn / before_model / before_tool / after_tool / before_client）→ `src/ai/runtime/agentCallbacks.test.ts`
- [x] A10.2 将 shadow 升级为 `AiToolCatalog` SSOT，shadow 文件 re-export → `aiToolCatalog.test.ts` + 既有 shadow tests
- [x] A10.3 `commitToolEffects`：chat_tool 偏好 patch + local_context `localToolState`；禁止写 `projectFacts` → `commitToolEffects.test.ts`
- [x] A10.4 `executeAutoToolCall` / confirm / streamCompletion local-context 改经 commit；grep 无旁路 `buildPostExecSessionMemory`+persist 组合
- [x] A10.5 Memory 边界单测：tool 结果不直写 `projectFacts`
- [x] A8 `newAgentRunId` + audit metadata / ToolAuditContext
- [x] A4b `resolveEffectiveMaxSteps` + flag 默认 false（effort scaling）

## Pre-merge gates

- [x] `npm run typecheck`
- [x] `npx vitest run src/ai/runtime src/ai/catalog src/ai/vertical/aiToolRegistryShadow.test.ts src/hooks/ai/useAiChat.autoExecute.test.ts src/ai/chat/agentLoop.test.ts`
- [x] `npm run check:agent-evals:smoke`
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter`
- [x] Feature flag `aiAgentLoopEffortScalingEnabled` 默认 `false`

## Commit 阶段证据模板

```
feat(ai): land A10 runner foundation (catalog, callbacks, commitToolEffects)

Verified:
- npm run typecheck
- npx vitest run <touched>
- spec: docs/execution/specs/agent-runtime-runner-foundation/
```
