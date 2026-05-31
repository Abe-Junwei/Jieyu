---
title: ai-conversation-management design
doc_type: execution-spec-design
status: completed
owner: repo
last_reviewed: 2026-05-18
source_of_truth: ai-conversation-management-spec
depends_on:
  - ./requirements.md
  - ../../plans/AI对话会话管理落地方案-2026-05-16.md
---

# Design — AI 会话管理 UI 入口

> **命名**：落地方案 **G1f** 称 `AiConversationListPanel`；本设计实现为 **`AiConversationListPopover`**（Header 下展开层，**非**侧栏全高 Panel，勿与 `AiAdoptionQueuePanel` 混淆）。

---

## 1. 设计约束（项目实际）

| 约束 | 现状 | 影响 |
|------|------|------|
| **容器宽度** | `.transcription-ai-panel` 典型 320–400 px | **禁止**侧向抽屉；列表 **absolute** 贴 Header 下沿 |
| **双 UI 入口** | 侧栏 `AiChatCard`（`showHeader={true}`）；浮动窗 `TranscriptionPage.ChatWindow`（`showHeader={false}` + **自有顶栏**） | 须 **§二.1** 策略，避免语义分裂 |
| **HeaderBar** | 标题、模式切换、provider 点、**provider `<select>`**、设置 | 见 **§2.2** 布局收紧 |
| **Provider 配置** | `AiChatProviderConfigPanel` 在 Header **下方推挤**展开 | 与会话 Popover **互斥**（§4.5） |
| **设计系统** | Material Symbol、`icon-btn`、`DialogShell` | 不引入新组件库 |
| **虚拟列表** | ADR 0017；AI 消息区未接入 | **仅 G1g 消息区**；列表 <20 条不虚拟化 |
| **面板边框** | 两层可见容器规则 | Popover 仅 `border-bottom` + shadow，不加第三层 shell border |

---

## 2. 总体布局

**模式**：HeaderBar 会话标题触发器 + **下方 absolute Popover**（对齐 ChatGPT/Claude；与 provider config **不同层**——config 推挤，列表覆盖）。

```
┌─ .transcription-ai-panel (~360px) ───────────────────────────┐
│ ┌─ .ai-chat-header-anchor (position: relative) ─────────┐ │
│ │ [≡] [会话标题 ▼ …]     [详细|简洁] [●] [⚙️]            │ │
│ │ ┌─ AiConversationListPopover (absolute, z-overlay) ──┐ │ │
│ │ │ [+ 新对话]                            [🔍 搜索*]   │ │ │
│ │ │ ▼ 当前项目 …                                        │ │ │
│ │ └────────────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────────────┘ │
│   AiChatMessageThread …  [清空当前对话]                     │
│   AiChatComposerPanel                                       │
└─────────────────────────────────────────────────────────────┘
```

\* G1：搜索框可 **disabled 占位**；G2c 启用。

### 2.1 双入口：侧栏 vs 浮动窗（必须）

| 入口 | 现状 | G1 策略 |
|------|------|---------|
| **侧栏** `AiChatCard` | `AiChatHeaderBar` + 消息区底部清空 | **主实现**：§三–§四 全量 |
| **浮动窗** `TranscriptionPage.ChatWindow` | `showHeader={false}`；顶栏硬编码「清空」→ `onClearAiMessages`（旧语义） | **推荐（G1 同期）**：顶栏增加 **列表 + 可点标题 + 新建**（复用 `AiConversationListPopover` 或抽 **`AiChatConversationChrome`**）；顶栏「清空」改为 **`clearCurrent`** 或 **移除**（仅保留消息区 `ai.chat.clearCurrent`） |
| **分期备选** | — | G1 仅侧栏；浮动窗在 requirements 标 **out of scope**，顶栏清空改 i18n 并 **disabled** 直至 G1.1 |

> 未处理浮动窗会导致：侧栏已 `startNewConversation` / `clearCurrent`，浮动窗仍 `clear()` 全量删。

### 2.2 HeaderBar 布局（窄宽）

**目标**：左侧会话区可截断；右侧保留高频控制。

| 区域 | 内容 | 说明 |
|------|------|------|
| **左** | `format_list_bulleted` + **按钮式标题**（`ellipsis` + `expand_more`） | `min-width: 0`；标题来自 §4.6 |
| **右** | 详细/简洁、`provider` 状态点、设置 | **G1 可选**：Header 去掉 `<select>`，模型仅在 ProviderConfig 内选（减拥挤） |
| **新建** | Popover 内 **`[+ 新对话]`** 为主 | Header 右侧 `add` **可选**；若保留双入口，需 aria 等价 |

---

## 3. 组件拆分与落位

### 3.1 新增

| 组件 | 文件 | 职责 |
|------|------|------|
| `AiConversationListPopover` | `AiConversationListPopover.tsx` | 壳：操作栏、分组列表、底链 |
| `AiConversationListGroup` | `AiConversationListGroup.tsx` | `textId` 折叠组 |
| `AiConversationListItem` | `AiConversationListItem.tsx` | 单条 + active 态 |
| `AiConversationActionMenu` | `AiConversationActionMenu.tsx` | ⋮：归档、删除（**G1 无 rename**） |

### 3.2 改造

| 组件 | 改造点 |
|------|--------|
| `AiChatHeaderBar` | 列表触发；可点击标题（`aria-expanded`）；包在 **`ai-chat-header-anchor`** 内 |
| `AiChatMessageThread` | 底部改用 `t(locale, 'ai.chat.clearCurrent')` → `onClearCurrentConversation` |
| `AiChatCard` | `headerOverlay: 'none' \| 'conversations' \| 'provider'`（或互斥 boolean）；**不**堆业务，回调来自 **Context** |
| `TranscriptionPage.ChatWindow` | 按 §2.1 对齐（G1 或 G1.1） |

### 3.3 状态与回调（编排）

- **Manager**：`useAiChatConversationManager`（或等价）提供 `list / switch / startNew / clearCurrent / delete / archive`。
- **透传**：`useTranscriptionAssistantSidebarControllerInput` → `AiChatContext`（与 `onClearAiMessages` 同级）；`AiChatCard` 只消费 Context + 本地 overlay state。
- **废弃路径**：`onClearAiMessages` 在 flag on 时映射为 `clearCurrent`；文档标明迁移期。

---

## 4. 交互规格

### 4.1 打开/关闭列表

| 触发 | 行为 |
|------|------|
| 列表图标 / 会话标题按钮 | toggle Popover；`aria-expanded` 同步 |
| 点击消息区/输入区（外点） | `pointerdown` + contain 检测，收起 |
| 选中某会话 | `switchConversation` + 收起 |
| `Esc` | 收起；焦点回退至标题按钮 |

### 4.2 新建

| 触发 | 行为 |
|------|------|
| Popover `[+ 新对话]`（主） | `startNewConversation()`；可选收起 Popover |
| Header `add`（若保留） | 同上 |

### 4.3 清空 vs 新建 vs 删除

| 操作 | 入口 | API |
|------|------|-----|
| 新建 | Popover / Header `+` | `startNewConversation` |
| 清空当前 | **仅**消息区底部 `ai.chat.clearCurrent` | `clearCurrentConversation`（`clearedAt`） |
| 删除 | ⋮ → 删除 | `deleteConversation` + `DialogShell` |

### 4.4 会话项操作

- 桌面：hover 显示 `more_vert` → 归档 / 删除。
- 移动：touch target ≥44px；长按或点 ⋮。
- **Rename**：**不在 G1**；i18n key 可预留，菜单 **不渲染** 或 G2.x 启用。

### 4.5 Header  overlay 互斥

| 状态 | 行为 |
|------|------|
| 打开 **会话列表** | `showProviderConfig = false` |
| 打开 **Provider 配置** | `conversationListOpen = false` |
| Popover | `position: absolute` 盖在消息区顶；**不**推挤布局 |

实现：`headerOverlay` 单枚举优于两个独立 boolean 竞态。

### 4.6 会话标题（`chatTitle`）

- 由 `resolveAiChatConversationTitle`（`aiChatConversationTitle.ts`）解析，**不**使用静态 `ai.chat.title`（MVP 后缀）。
- Dexie 仍为默认/空 title 且已有 user 消息：**G2d** 显示 `ai.chat.conversationList.titleGenerating`（LLM 异步生成中）。
- LLM 写回 Dexie 后显示真实标题；失败时后台用规则标题兜底（`conversationTitleGeneration.ts`）。
- 无消息的新会话： `ai.chat.conversationList.newConversation`。

**环境变量**：`VITE_AI_CONVERSATION_LLM_TITLE_ENABLED=false` 可关闭 LLM，仅规则标题。

### 4.7 分期 UI（当前）

| 控件 | 状态 |
|------|------|
| 搜索框 | **G2c** 已启用（title + 最近消息 body） |
| 查看已归档 | **G2a** 已启用 |
| 归档 / 删除 ⋮ | **G2a/G2b** 已启用；删除走 `ModalPanel` 确认 |
| Run 时间线 | **G3c** `AiChatRunTimelinePanel`（多会话 flag on 时） |
| Rename | **未做**（菜单不渲染） |

---

## 5. 样式（`ai-hub.css`）

Popover 容器包在 **`.ai-chat-header-anchor { position: relative; }`** 内：

```css
.ai-conversation-list-popover {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: var(--z-overlay-base);
  background: var(--surface-panel);
  border-bottom: 1px solid var(--border-soft);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--shadow-color) 8%, transparent);
  max-height: min(420px, 60vh);
  overflow-y: auto;
}
```

列表项 / 分组标题：同前 spec（与 `.ai-chat-decision-item` hover 一致）。

**G1g 消息区**：虚拟化 **自底向上**（新消息在下方），与侧栏语段列表正向虚拟化区分；`@tanstack/react-virtual` 或首屏 N turn + 向上分页。

---

## 6. i18n

| Key | 用途 |
|-----|------|
| `ai.chat.conversationList.*` | 列表、分组、菜单、Dialog（见原表 13 keys） |
| `ai.chat.clearCurrent` | 消息区底部清空 |
| `ai.chat.clear` | **保留**通用「清空」；浮动窗过渡期可暂用 |

> 方案 G1d 的「新对话」统一为 **`ai.chat.conversationList.newConversation`**（非 `ai.chat.newConversation`）。

---

## 7. 与 G* 对齐

| 设计项 | G* |
|--------|-----|
| Popover / Header 列表 | G1f |
| 新建 / 清空入口 | G1e |
| `textId` 分组 | G1c |
| 消息虚拟化 | G1g |
| 归档 / 删除 / 搜索 | G2a / G2b / G2c |

---

## 8. 验收标准

| 检查项 | 标准 |
|--------|------|
| 打开列表 | 展开 ≤220ms；`aria-expanded=true`；provider 面板关闭 |
| 切换会话 | 加载历史；Popover 收起 |
| 新建 | 新 id；标题为 `newConversation` i18n |
| **清空当前** | 点击消息区底部 **「清空当前对话」**；当前 thread UI 空；**非**新建（旧 conv 可 `clearedAt`） |
| 删除 | `DialogShell` 确认后硬删 |
| 键盘 | Tab 列表项；Enter 切换；Esc 收起并聚焦触发器 |
| i18n / 样式 | 无硬编码；样式进 `ai-hub.css` / `ai-chat-thread.css` |
| 浮动窗 | 符合 §2.1 选定策略（同期或 documented out of scope） |

---

## 9. 实施顺序（UI，已交付）

> **与落地方案同步**：PR-1～PR-6 已完成，见 [tasks.md](./tasks.md)。

1. Context + Manager（PR-3）→ Header + Popover（PR-4）→ `chatTitle` / `clearCurrent` / ChatWindow 双入口
2. G1g 消息区虚拟化（PR-5）
3. G2 搜索 / 归档 / 删除 + flag 默认 on（PR-6）
4. G2d LLM 标题 + G3c Run 时间线

---

## 10. 其它

- **Feature flag**：`aiConversationManagement` **默认 `true`**；`VITE_AI_CONVERSATION_MANAGEMENT_ENABLED=false` 回退单会话。
- **测试**：`tests/e2e/aiConversationManagementSmoke.spec.ts`；逻辑见 `useAiChat.clearLatency.test.tsx` 等（tasks.md 索引）。
- **维护**：后续增量（rename、unarchive）单独立项，勿与本 spec 已交付项混 PR。
