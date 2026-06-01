---
title: session-memory-single-source requirements
doc_type: execution-spec-requirements
status: active
owner: repo
last_reviewed: 2026-06-01
source_of_truth: session-memory-single-source-spec
---

# Requirements — session-memory-single-source

## 1. What & Why

- **要做什么**：`sessionMemory` 确立 Dexie `ai_session_memories` 为唯一 SSoT；删除 localStorage 双写；拆分超大模块。
- **为什么现在做**：未绑定会话时全局 localStorage 单键互相覆盖；1155 行触发 architecture-guard 硬失败。
- **不做什么**：不改 `useAiChat.*` 公共 import 路径；不做旧 localStorage 数据迁移（已确认无兼容需求）。

## 2. 用户场景

1. 多会话切换时各会话记忆互不覆盖。
2. 绑定 `conversationId` 前同步 persist 应 warn 并跳过，而非写全局键。

## 3. 验收标准

- [ ] 无 `localStorage` 读写 session memory 路径
- [ ] `bindSessionMemoryConversation` 先于 sync persist
- [ ] LRU memory cache（32）+ Dexie 持久化
- [ ] `sessionMemory.ts` ≤ architecture ceiling；19+ vitest 通过

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| Store | `sessionMemoryStore.ts` | Dexie + LRU |
| Normalize | `sessionMemoryNormalize.ts` | 拆分 |
| API | `sessionMemory.ts` | 变更 ops + re-export |
| Test | `sessionMemory.test.ts` | bind + Dexie |
