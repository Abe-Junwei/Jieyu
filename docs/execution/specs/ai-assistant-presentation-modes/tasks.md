---
title: ai-assistant-presentation-modes tasks
doc_type: execution-spec-tasks
status: deferred
owner: repo
last_reviewed: 2026-08-21
source_of_truth: ai-assistant-presentation-modes-spec
---

# Tasks — AI 助手呈现样态

> 2026-08-21：当前产品按 [ADR-0032](../../../adr/0032-transcription-ai-chat-floating-window-only.md) 落地为「对话仅浮窗」。下列 Dock/Pop-out 任务延后。

> [requirements.md](requirements.md) | [design.md](design.md)

## Phase 1 — 状态与互斥挂载

| # | 任务 | 验证 |
|---|------|------|
| 1.1 | `useAiAssistantPresentation.ts` + localStorage 迁移 | 单测 |
| 1.2 | flag `aiAssistantPresentationMutualExclusionEnabled` | typecheck |
| 1.3 | `AssistantRuntime` / `ChatWindow` 互斥挂载 `AiChatCard` | structure test |
| 1.4 | `ReadyWorkspaceLayout` + controller：`floating` 时 `shouldRenderAiSidebar=false` / 强制 collapsed | 手动 smoke |
| 1.5 | `popOut`/`dockToSidebar` 读写 `preFloatingAiPanelCollapsed` + `preFloatingHubSidebarTab` | 单测 |

## Phase 2 — Chrome 与入口

| # | 任务 | 验证 |
|---|------|------|
| 2.1 | `AiChatConversationChrome`（列表+标题+样态按钮） | typecheck |
| 2.2 | `AiChatHeaderBar` 接入 Chrome；浮窗去掉重复会话 UI | 视觉 |
| 2.3 | 浮窗 × → `dockToSidebar`；移除 docked 时 FAB | ChatWindow.test |
| 2.4 | 确认 floating 时无 `AiSidebar` hub tabs / `AnalysisRuntime` DOM | structure test |

## Phase 3 — 守卫与抛光

| # | 任务 | 验证 |
|---|------|------|
| 3.1 | 流式中禁用切换 + tooltip | 单测 / 手动 |
| 3.2 | Pop-out 强制收起 AI 栏；Dock 恢复快照 + 默认助手 Tab | 手动 / 单测 |
| 3.3 | 更新 [ai-conversation-management/design.md](../ai-conversation-management/design.md) §2.1 为「互斥样态」指针 | docs-governance |

## 跨阶段验证

```bash
npm run typecheck
npx vitest run src/pages/TranscriptionPage.ChatWindow.test.tsx
npx vitest run src/pages/TranscriptionPage.structure.test.ts
npm run check:docs-governance
# 触及 UI：npm run test:e2e:chromium
```

---

*Created: 2026-05-17 · Revised: 2026-05-17（floating 不保留侧栏）*
