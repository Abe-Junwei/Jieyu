---
title: ai-conversation-management tasks
doc_type: execution-spec-tasks
status: completed
owner: repo
last_reviewed: 2026-05-18
source_of_truth: ai-conversation-management-spec
depends_on:
  - ./requirements.md
  - ./design.md
  - ../../plans/AI对话会话管理落地方案-2026-05-16.md
---

# Tasks — ai-conversation-management

> PR 列车与契约见落地方案 [§九](../../plans/AI对话会话管理落地方案-2026-05-16.md#九联合实施与防冲突plan--ui-spec)。完成一项将 `[ ]` 改为 `[x]`。

## PR-1 — G0 性能与竞态

- [x] `conversationGeneration.ts` + `useAiChat` bump on `clear`
- [x] `clear`：先 `stop` + `setMessages([])`，延后 `sessionMemory`（G0a/G0b）
- [x] `conversationGenerationRef` 透传 `RunAiChatSendTurnArgs` → stream phase（G0c）
- [x] `flushSync` / `finalizeAssistantMessage` 校验 generation
- [x] `useAiChat.clearLatency.test.tsx`
- [x] PR 描述注明：清空延迟终态在 G1e

## PR-2 — G1 数据

- [x] `AiConversationDoc.clearedAt` + Zod
- [x] Dexie `ai_session_memories: 'conversationId, updatedAt'`
- [x] `sessionMemory` async load/persist + lazy localStorage 迁移
- [x] `sessionMemory.test.ts`

## PR-3 — G1 逻辑（flag off）

- [x] `aiConversationManager.types.ts` 契约类型
- [x] `useAiChatConversationManager`（list/switch/startNew/clearCurrent）
- [x] `textId` 链 + `ensureConversation(textId?)`
- [x] `AiChatContext` 回调；`featureFlags.aiConversationManagement` 默认 false（PR-3 阶段）
- [x] manager / hook vitest

## PR-4 — G1f UI（flag on 自用）

- [x] i18n `ai.chat.conversationList.*` + `ai.chat.clearCurrent`
- [x] `AiConversationList*` + HeaderBar + `headerOverlay` 互斥
- [x] `chatTitle` 动态；消息区 `clearCurrent`
- [x] `TranscriptionPage.ChatWindow` 双入口（design §2.1）
- [x] requirements §3 手动烟测（`tests/e2e/aiConversationManagementSmoke.spec.ts` 自动化烟测锚点）

## PR-5 — G1g（可并行 PR-4）

- [x] `AiChatMessageThread` 底向上虚拟化或首屏 N turn
- [x] perf 记录（`docs/execution/audits/ai-chat-message-thread-virtual-perf-2026-05-17.md` + vitest baseline）

## PR-6 — G2 + flag 默认 true

- [x] 归档 / 删除 Dialog / 搜索 / G2e 多标签（可选）
- [x] G3 Run 视图 `conversationId` 过滤（可选同里程碑）
- [x] G2d **LLM 异步标题**（`conversationTitleLlm.ts` + 规则兜底）+ `titleGenerating` i18n
- [x] G3c `AiChatRunTimelinePanel`（按会话过滤后的决策 + vertical 时间线）

## 实现索引（代码真源）

| G* | 主要落位 |
| --- | --- |
| G0 | `src/ai/chat/conversationGeneration.ts`、`src/hooks/useAiChat.ts`、`src/hooks/ai/useAiChat.clearLatency.test.tsx` |
| G1 数据 | `src/db/*`、`src/ai/chat/sessionMemory.ts` |
| G1b–e | `src/hooks/ai/useAiChatConversationManager.ts`、`aiConversationManager.*` |
| G1f | `src/components/ai/AiConversationList*`、`AiChatHeaderBar`、`TranscriptionPage.ChatWindow.tsx` |
| G1g | `src/components/ai/useAiChatMessageThreadVirtualizer.ts`、`aiChatMessageThreadVirtual.ts` |
| G2 | `conversationSearch.ts`、`conversationListSync.ts`、`AiConversationActionMenu.tsx` |
| G2d | `conversationTitleLlm.ts`、`conversationTitleGeneration.ts` |
| G3 | `src/ai/auditReplay.ts`、`AiChatRunTimelinePanel.tsx`、`useTranscriptionAiController.ts` |
| Flag | `featureFlags.aiConversationManagement` 默认 `true`；`VITE_AI_CONVERSATION_MANAGEMENT_ENABLED` 可覆盖 |
| G2d 关闭 LLM | `VITE_AI_CONVERSATION_LLM_TITLE_ENABLED=false`（仅规则标题） |
