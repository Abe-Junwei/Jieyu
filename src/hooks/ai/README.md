# `src/hooks/ai` — 导航说明（非 barrel）

本目录承载 **AI 聊天编排 Hook** 与 send-turn 管线切片。此处 **不提供** `index.ts` 聚合导出，避免 mega barrel；请按文件路径显式 import。

## 页面层（`src/pages`）建议

- **聊天 UI / 会话编排入口**：优先从 `src/hooks/useAiChat.ts`（或项目约定的 `@/` 别名）引用，而不是从本目录深链一堆文件。
- **跨域「聊天领域」稳定能力（白名单）**：若页面确实需要直接触达 `src/ai/chat` 的受控 API，请从 **`src/ai/chat/index.ts`** 引用；子路径实现细节留给 `src/hooks/ai` 与 `src/components/ai`。
- **禁止**：从 `src/pages/**` 导入 `src/ai/chat/**/internal/**`（由 `npm run check:ai-chat-public-surface` 门禁）。

## Send-turn 管线（常见切片）

- `useAiChat.sendTurn.ts` — 编排入口
- `useAiChat.sendTurnPreflight.ts` / `useAiChat.sendTurnPersistAndPrimaryStream.ts` / `useAiChat.sendTurnCompletion.ts`
- `useAiChat.sendTurnStreamPhase.ts` — 流阶段编排（子模块见同前缀 `useAiChat.sendTurnStreamPhase.*`）

## 与 `src/ai/chat` 的分工（简记）

| 区域 | 职责 |
| --- | --- |
| `src/ai/chat` | 领域逻辑、工具执行、会话内存、agent loop 等 **可单测的纯模块 / 服务式代码** |
| `src/hooks/ai` | React 编排、refs、与 UI 状态机耦合的 **Hook 与管线切片** |
| `src/components/ai` | 展示与交互组件 |
