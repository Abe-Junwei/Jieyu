---
title: ai-assistant-presentation-modes design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-05-17
source_of_truth: ai-assistant-presentation-modes-spec
depends_on:
  - ./requirements.md
---

# Design — AI 助手呈现样态

## 1. 成熟方案扫描（借鉴点）

| 产品 | 可借鉴 | 不照搬 |
| --- | --- | --- |
| **VS Code** 辅助侧栏 ↔ 编辑器组 | **Detach / Dock** 成对动作；关闭辅助视图回栏位 | 多编辑器组复杂度 |
| **ChatGPT / Claude** 桌面端 | 单会话线程；顶栏 **一个** 会话入口；侧栏为默认可视区 | 无转写页「分析」第二 Tab |
| **Notion AI** | 窄栏召唤 → 可 **覆盖** 内容区；收回即回栏 | 全屏覆盖模式 |
| **Figma** 右侧面板 | 面板与画布 **空间竞争** 明确；折叠与内容分离 | 插件生态 |
| **Slack** 线程 / Huddle | **最小化 ≠ 关闭**；关闭回到主窗 | 独立 IM 窗口 |

**决定**：**适配** — `docked | floating` 互斥 + 对称 Dock/Pop-out + 关闭即 Dock；单 `AiChatCard` 实例（仓库已有共享 `aiChatContextValue`）。

## 2. 状态模型

```ts
type AiAssistantPresentation = 'docked' | 'floating';

// 与 presentation 正交
type FloatingChromeState = 'expanded' | 'minimized'; // 仅 floating 有效
// floating 时联动 isAiPanelCollapsed（见 §2.1）
// hubSidebarTab 在 dock 时恢复快照
```

| presentation | AiChatCard | ChatWindow | AI 侧栏（`.transcription-ai-panel`） |
| --- | --- | --- | --- |
| docked | `AssistantRuntime` | 关 | **展开**（或用户自行折叠）；助手/分析 Tab 照常 |
| floating | `ChatWindow` | 开 | **收起/不渲染 runtime**；**无** 分析 Tab、**无** 占位条 |

### 2.1 floating 与侧栏联动（拍板）

**Pop-out**：

1. 保存 `preFloatingAiPanelCollapsed`、`preFloatingHubSidebarTab`。
2. `presentation → floating`；`isAiPanelCollapsed → true`（时间轴占满原 AI 栏宽度）。
3. 不渲染 `AssistantRuntime` / `AnalysisRuntime`（`shouldRenderAiSidebar` 为 false 或 hub 区零高度）。

**Dock**：

1. `presentation → docked`；关闭浮窗。
2. 恢复 `isAiPanelCollapsed` 自快照（若弹出前已折叠则保持折叠）。
3. `hubSidebarTab → 'assistant'`（或恢复快照后由用户再切分析）。
4. 若恢复快照为展开态，保证 `AiChatCard` 在侧栏可见。

**持久化**（扩展 `jieyu.aiChatWindow.v1`）：

```json
{
  "presentation": "docked",
  "open": false,
  "minimized": false,
  "preFloatingAiPanelCollapsed": false,
  "preFloatingHubSidebarTab": "assistant",
  "x", "y", "width", "height"
}
```

- `open` 由 `presentation === 'floating'` **派生**，写入时同步，避免漂移。
- 迁移：`open === true` 且无 `presentation` → `floating` + 保留几何。

## 3. 切换策略（交互规则）

### 3.1 主动作（对称、顶栏优先）

| 当前 | 控件位置 | 图标（Material） | 行为 |
| --- | --- | --- | --- |
| docked | `AiChatConversationChrome` 右侧 `icon-btn` | `open_in_new` | → floating；计算浮窗初始位（贴侧栏左缘或视口右下默认） |
| floating | 浮窗 header 右侧（设置左侧） | `dock_to_right` | → docked；恢复侧栏快照；默认 `hubSidebarTab='assistant'` |
| docked | `AiPanelHandle` 仍可折叠栏宽 | （现有 ›） | 与 presentation 独立；floating 时把手用于 **展开回 docked 前宽度** 的提示可选 P2 |

**文案**（dictKey → `aiChatCardMessages`）：

- `ai.chat.presentation.popOut` / `popOutTitle`
- `ai.chat.presentation.dockToSidebar` / `dockToSidebarTitle`
- `ai.chat.presentation.streamingBlocked`（disabled tooltip）

### 3.2 关闭 / 最小化（修正现网）

| 控件 | 现网问题 | 优化后 |
| --- | --- | --- |
| **× 关闭** | 仅 `setOpen(false)`，侧栏仍全量聊天 → 像「两个助手」 | **等价 Dock**：`presentation=docked`，展开侧栏助手 |
| **— 最小化** | 合理 | 保持；仅隐藏 body；**不** 改 presentation；胶囊显示会话标题 + 未读/流式点 |
| **右下角 FAB**（`transcription-chat-window-trigger`） | docked 时仍存在 → 第三入口 | **仅** `floating && minimized` 或 legacy 迁移期显示；docked 时 **移除** |

### 3.3 守卫条件

- `aiIsStreaming`：**禁止** Pop-out / Dock（避免 unmount 断流）；按钮 `disabled` + `title` 说明。
- `providerConfigOpen` / `conversationListOpen`：切换前 **关闭 overlay**（与会话 Popover 互斥规则一致）。
- 可选 P2：`requestAnimationFrame` 轻量位移动画（sidebar rect → window），非阻塞。

### 3.4 与面板折叠的关系

- **docked**：`isAiPanelCollapsed` 仍由用户通过 `AiPanelHandle` 控制。
- **floating**：**强制** `isAiPanelCollapsed=true`；侧栏 **不保留** 分析 Tab 与助手区（拍板）。
- 用户在 floating 期间要看分析：**必须先 Dock**（或 P2 另做「分析」浮窗/菜单入口，本 spec 不做）。

## 4. UI 入口布局

### 4.1 抽取 `AiChatConversationChrome`

**文件**：`src/components/ai/AiChatConversationChrome.tsx`

**职责**（会话管理 G1f 与样态共用）：

- 左：列表 + 标题（现有 `AiConversationListPopover` 触发）
- 右：**样态切换** `icon-btn` + 详细/简洁 + provider 点 + 设置（设置仍可在 HeaderBar 工具区）

**变体**：`variant: 'docked' | 'floating'` — 仅影响间距/class（`is-floating`），**不** 复制业务逻辑。

- docked：`AiChatHeaderBar` 内嵌 Chrome。
- floating：替换 `TranscriptionPage.ChatWindow` 内重复 meta/toolbar 的 **会话+模式+provider** 块，保留浮窗专属：拖拽区、resize、最小化/关闭。

### 4.2 floating 时侧栏视觉

- 不渲染 hub tabs（助手/分析）与 runtime；布局上等同 **AI 栏完全收起**（与手动点 › 折叠一致）。
- 可选 P2：在 `AiPanelHandle` hover 显示「助手在浮窗，点击展开侧栏将收回浮窗」——首版 **不做**，避免第三入口；收回 **仅** 浮窗顶栏 Dock。

### 4.3 入口优先级（避免入口泛滥）

| 优先级 | 入口 | 可见条件 |
| --- | --- | --- |
| P0 | 顶栏 Pop-out / Dock | docked / floating 的 Chrome（流式 disabled） |
| P1 | 最小化胶囊 | floating && minimized |
| **废弃** | docked 右下角 FAB | 移除 |
| **废弃** | floating 侧栏占位条 | 不保留侧栏 |

## 5. 架构落位

| 文件 | 职责 |
| --- | --- |
| `useAiAssistantPresentation.ts` | `presentation`、`popOut()`、`dockToSidebar()`、持久化、迁移 |
| `useTranscriptionAssistantController` | 装配 presentation 入 `assistantRuntimeProps` |
| `AssistantRuntime` | 仅 `docked` 挂载 `AiChatCard` |
| `ChatWindow` | 仅 `floating` 挂载 card；× → `dockToSidebar` |
| `ReadyWorkspaceLayout` | `floating` 时不渲染 `TranscriptionPageAiSidebar` runtime；`popOut`/`dock` 联动 `isAiPanelCollapsed` |
| `useAiAssistantPresentation` | 保存/恢复 `preFloating*` 快照 |

## 6. Feature flag

`aiAssistantPresentationMutualExclusionEnabled` — 默认 `false`；开启后启用 §2–§4 全部规则。

## 7. 测试要点

- 单测：`useAiAssistantPresentation` 迁移与 `open` 派生
- `ChatWindow.test.tsx`：× → docked
- `TranscriptionPage.structure.test.ts`：flag on 时 DOM 内至多一个 `.transcription-ai-card-embedded` 聊天体
- E2E：Pop-out → 输入 → Dock → 消息仍在（共享 context）

---

*Created: 2026-05-17 · Revised: 2026-05-17（floating 不保留侧栏含分析）*
