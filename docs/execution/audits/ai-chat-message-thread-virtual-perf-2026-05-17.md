---
title: ai-chat-message-thread-virtual-perf-2026-05-17
doc_type: execution-audit
status: recorded
owner: repo
last_reviewed: 2026-05-18
---

# G1g — AI 消息区虚拟化 perf 记录

> 自动化基线：`src/components/ai/AiChatMessageThreadVirtualPerformanceBaseline.test.ts`（vitest，本地 `npm run test` 或定向运行）。

## 常量（与 spec 对齐）

| 项 | 值 |
| --- | --- |
| `AI_CHAT_TURN_VIRTUAL_THRESHOLD` | 20 turn |
| `AI_CHAT_TURN_ESTIMATE_PX` | 136 px |
| 样本会话 | 64 turn × 2 messages = 128 rows |

## 本地实测（2026-05-17，vitest jsdom + fake-indexeddb）

| 指标 | 结果 | 预算 |
| --- | --- | --- |
| `loadConversationUiMessages`（64 turn） | ~数十 ms 级（见 CI 日志 `[G1g ai-chat-thread perf]`） | p95 &lt; 400ms（非 coverage 模式） |

## 说明

- 首帧切换体感以「不全量挂载 100+ `AiChatTurnRow`」为主验收；本文件记录 vitest 可复现的 IDB 加载预算。
- 无硬编码 100ms CI 门槛（requirements §3）。
- 同里程碑 G2d LLM 标题 perf 未单独建 CI 门槛；见 `conversationTitleLlm.ts` 与专篇 §五 G2d 实施说明。
