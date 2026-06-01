---
title: session-memory-single-source design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-06-01
source_of_truth: session-memory-single-source-spec
depends_on:
  - ./requirements.md
---

# Design — session-memory-single-source

## 1. 架构

```text
公共 API (sessionMemory.ts)
  → LRU memoryCache (keyed by conversationId)
  → Dexie ai_session_memories (唯一 SSoT)
```

## 2. 落位

| 文件 | 职责 |
| --- | --- |
| `sessionMemoryNormalize.ts` | 类型、normalize、patch 纯函数 |
| `sessionMemoryStore.ts` | bind、load、persist、LRU |
| `sessionMemory.ts` | 变更 API + re-export |

## 3. 绑定契约

- `bindSessionMemoryConversation(id)` 必须在消费/持久化前调用（`useSessionMemoryConversationBinding` 在 `useAiChat` 中统一处理 bootstrap + 切换）。
- 未绑定：`persistSessionMemory` 记录 warn 并 no-op。

## 4. 验证

- `vitest run src/ai/chat/sessionMemory.test.ts`
- `check:architecture-guard`
- `check:agent-evals:smoke`（触 AI 路径时）
