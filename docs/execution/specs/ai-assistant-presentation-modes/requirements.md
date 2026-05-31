---
title: ai-assistant-presentation-modes requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-05-17
source_of_truth: ai-assistant-presentation-modes-spec
---

# Requirements — AI 助手呈现样态（侧栏 ⇄ 浮窗）

> 关联：[AI对话会话管理落地方案](../../plans/AI对话会话管理落地方案-2026-05-16.md) G1f；取代 [ai-conversation-management/design.md](../ai-conversation-management/design.md) §2.1「双入口并存」策略。

## 1. What & Why

- **要做什么**：助手对话在 **侧栏（docked）** 与 **浮窗（floating）** 间互斥呈现；同一时刻仅挂载 **一个** `AiChatCard`；顶栏提供对称「弹出 / 收回」入口。
- **为什么**：现网侧栏 + 浮窗可并存，双挂载 `AiChatCard`、双套顶栏语义（清空/会话）易分裂；用户心智应为「同一助手，两种摆放」。
- **不做什么**：不改 `useAiChat` 业务；floating 时 **不** 在侧栏保留助手区/分析 Tab/占位条（整块 AI 栏收起）；不做跨显示器多浮窗；不在 floating 时提供侧栏内「分析」并行入口（要分析须先 Dock）。

## 2. 用户场景

1. 转写员在侧栏与助手对话，需要更大时间轴视野 → 点 **弹出浮窗**；**整条 AI 侧栏收起**（助手 + 分析均不可见），仅保留布局级折叠把手/细条，对话只在浮窗。
2. 需要看分析或回到侧栏助手 → 点 **收回侧栏**；浮窗关闭，AI 栏恢复弹出前宽度/折叠态，并选中助手 Tab。
3. 浮窗最小化后仅 **标题胶囊** 可展开浮窗；侧栏仍保持收起，直至 Dock。

## 3. 验收标准

- [ ] `presentation === 'docked'` 时仅 `AssistantRuntime` 挂载 `AiChatCard`；`ChatWindow` 的 `open === false` 且无第二份 thread/composer DOM
- [ ] `presentation === 'floating'` 时仅 `ChatWindow` 挂载 `AiChatCard`；`TranscriptionPageAiSidebar` **不渲染** 助手/分析 runtime（`isAiPanelCollapsed === true` 或等价隐藏）
- [ ] Pop-out 前快照 `preFloatingPanelCollapsed`（及可选 `preFloatingHubSidebarTab`）；Dock 时按快照恢复，默认展开栏宽 + `hubSidebarTab='assistant'`
- [ ] 侧栏 `AiChatHeaderBar` 与浮窗顶栏均有 **弹出 / 收回**（图标 + `aria-label` + i18n dictKey）
- [ ] 浮窗 **关闭（×）** 行为为 **收回侧栏**（非「双关」）；最小化（—）不改变 `presentation`
- [ ] `aiIsStreaming === true` 时切换按钮 disabled + 说明文案
- [ ] `localStorage` 迁移：`jieyu.aiChatWindow.v1.open === true` → 首次升级为 `floating`
- [ ] `npm run typecheck`；`TranscriptionPage.ChatWindow.test.tsx` + 结构测试断言单实例

## 4. 受影响代码地图

| 类别 | 路径 | 改动 |
| --- | --- | --- |
| Controller | `useAiAssistantPresentation.ts`（新） | 状态 + 持久化 + 切换动作 |
| 页面 | `TranscriptionPage.AssistantRuntime.tsx`、`ChatWindow.tsx`、`ReadyWorkspaceLayout.tsx` | 互斥挂载 |
| 组件 | `AiChatConversationChrome.tsx`（新，抽会话顶栏） | 弹出/收回 + 列表/标题 |
| 组件 | `AiChatHeaderBar.tsx` | 入口（仅 docked 可见） |
| Controller | `useTranscriptionShellController` / layout | floating 时强制收起 AI 栏 |
| i18n | `dictKeys` + `aiChatCardMessages` | 样态相关文案 |
| CSS | `ai-chat-window.css`、`ai-sidebar-shell.css` | 占位与过渡（无第三层 border） |
| Flag | `aiAssistantPresentationMutualExclusionEnabled` | 默认 false |

## 5. 已知风险

- 切换时 composer 草稿：首版可接受丢失；P2 可提升为 context 级 draft
- Voice drawer 随 `AiChatCard` 在浮窗内；侧栏无 voice entry（栏已收起）
- 弹出前若在「分析」Tab，Dock 后恢复 Tab 快照；floating 期间无法切分析

---

*Created: 2026-05-17 · Revised: 2026-05-17（floating 不保留侧栏含分析）*
