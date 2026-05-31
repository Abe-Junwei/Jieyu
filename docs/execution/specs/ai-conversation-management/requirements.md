---
title: ai-conversation-management requirements
doc_type: execution-spec-requirements
status: completed
owner: repo
last_reviewed: 2026-05-18
source_of_truth: ai-conversation-management-spec
---

# Requirements — ai-conversation-management

> 后端与数据契约见 [AI 对话会话管理落地方案-2026-05-16](../../plans/AI对话会话管理落地方案-2026-05-16.md)。UI 见 [design.md](./design.md)。

## 1. What & Why

- **要做什么**：转写页 AI 助手支持多会话目录（按 `textId` 分组）、新建/切换、清空与新建语义分离，以及可预期的清空性能（G0–G1）。
- **为什么现在做**：单会话 + 全局 `sessionMemory` 无法支撑转写场景回溯；清空体感延迟与流式竞态影响日常使用。
- **不做什么**：开放域 Copilot；**会话列表**虚拟化（消息区 G1g 已做）；不做 rename（G2.x）、不做取消归档；浮动窗完整顶栏可标 G1.1（见 design §二）。
- **已交付（G2+）**：G2d **LLM 异步标题**（失败时规则兜底）；G2a–c 归档/删除/搜索；G3a–c Run 按 `conversationId` 过滤 + 时间线面板。

## 2. 用户场景（≤ 3 条）

1. 转写员在侧栏 AI 面板点击会话标题，展开列表，切换到昨日「语段校对」会话并继续追问。
2. 用户点击「新对话」开始新 thread，旧会话仍在列表中可切换回去。
3. 用户点击消息区底部「清空当前对话」清空当前 thread 内容，与「新对话」语义不同；删除会话需二次确认。

## 3. 验收标准（可测）

- [x] **G0**：`clear` 后 UI ≤1 帧清空；流式 chunk 在 generation bump 后不再写回 UI（`useAiChat.clearLatency.test.tsx`）。
- [x] **G1e**：新建不删旧 conv；清空写 `clearedAt` 且列表默认不展示 cleared 会话。
- [x] **G1f**：Header 打开列表、点选切换、Esc/外点关闭；`chatTitle` 来自 Dexie title、`titleGenerating` 或 `newConversation`。
- [x] **G2d**：首条 user 后异步 LLM 生成标题；生成中显示 `ai.chat.conversationList.titleGenerating`。
- [x] **G2**：归档、删除确认、列表搜索、多标签列表同步（G2e）。
- [x] **G3**：工具/vertical 审计按当前 `conversationId` 过滤；Run 时间线面板可展开查看。
- [x] **G1g**（可并行）：50+ 消息会话切换首帧 p95 在 perf test 记录（无硬编码 100ms CI 门槛）。
- [x] i18n：新增 key 无硬编码；`check-i18n-hardcoded` 通过。
- [x] 双入口：侧栏与浮动窗清空/新建语义一致，或浮动窗在 scope 外有文档声明。

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| 数据 | `src/db/types.ts`、`schemas.ts`、`engine.ts` | `clearedAt`、`ai_session_memories` |
| Hook | `useAiChat.ts`、`useAiChat.conversationState.ts`、`useAiChatConversationManager`（新） | G0/G1 逻辑 |
| Context | `AiChatContext.tsx`、`useTranscriptionAssistantSidebarControllerInput.ts` | 回调透传 |
| UI | `AiChatHeaderBar`、`AiConversationList*`、`AiChatCard`、`AiChatMessageThread` | G1f |
| 浮动窗 | `TranscriptionPage.ChatWindow.tsx` | 双入口对齐 |
| i18n | `dictKeys.ts`、`zh-CN.ts`、`en-US.ts` | 见 design §六 |
| 测试 | `useAiChat.clearLatency.test.tsx`、`sessionMemory.test.ts`、`useAiChatConversationManager.test.tsx`、`conversationTitleLlm.test.ts`、`aiChatRunTimeline.test.ts`、`tests/e2e/aiConversationManagementSmoke.spec.ts` 等 | 新增 |

## 5. 已知风险与依赖

- `AiChatCard` 已接近 architecture hotspot：业务回调走 Context/manager，勿在 Card 内堆编排。
- Header 窄宽 + provider `<select>`：见 design §2.1 布局收紧。
- G0 合入后、G1e 前：`bulkDelete` 清空仍为过渡，PR 须注明。
- Feature flag：`featureFlags.aiConversationManagement` **默认 on**（PR-6）；可用 `VITE_AI_CONVERSATION_MANAGEMENT_ENABLED=false` 回退旧单会话 UI。
- LLM 标题：`VITE_AI_CONVERSATION_LLM_TITLE_ENABLED=false` 时 G2d 仅用规则标题兜底。
- **联合实施**：PR 顺序、Context 契约、防冲突 — 见落地方案 [§九](../../plans/AI对话会话管理落地方案-2026-05-16.md#九联合实施与防冲突plan--ui-spec)。
