---
name: AiChatCard second split round
overview: 围绕 `AiChatCard` 剩余热点再做一轮拆分，优先降低主组件 JSX/分支密度，并同步补齐 hook 级测试保护，避免回归风险扩散。
todos:
  - id: round2-phase1-shell-panels
    content: 拆分 Header 与 ProviderConfig 展示组件，压缩 AiChatCard 顶部区域
    status: completed
  - id: round2-phase2-message-thread
    content: 拆分消息线程与自动滚动控制器，收口消息渲染热点
    status: completed
  - id: round2-phase3-decision-panel
    content: 拆分 Decision/Replay 面板组件，减少 AiChatCard 内 decision JSX
    status: completed
  - id: round2-test-hardening
    content: 补齐 message/replay/resizer 的 hook 级单测并执行阶段验证
    status: completed
isProject: false
---

# AiChatCard 第二轮拆分计划

## 本轮目标
- 继续降低 [`src/components/ai/AiChatCard.tsx`](src/components/ai/AiChatCard.tsx) 的编排复杂度（当前约 1584 行）。
- 保持用户行为不变，优先做“纯渲染搬迁 + 现有回调透传”。
- 同步补齐拆分后最关键的 hook 单测，避免只靠大集成测试兜底。

## 现状结论
- 剩余最高热点：消息视口渲染区、decision panel 区。
- 中风险热点：header/provider config 区、composer 聚合区。
- 测试短板：`useAiChatMessageInteractionController`、`useAiChatReplayController`、`useAiChatPanelResizer` 缺少独立回归保护。

## Phase 1（低风险降体积）
- **目标**：先拆纯展示块，快速压缩主组件 JSX。
- **改动文件**：
  - 新增 [`src/components/ai/AiChatHeaderBar.tsx`](src/components/ai/AiChatHeaderBar.tsx)
  - 新增 [`src/components/ai/AiChatProviderConfigPanel.tsx`](src/components/ai/AiChatProviderConfigPanel.tsx)
  - 更新 [`src/components/ai/AiChatCard.tsx`](src/components/ai/AiChatCard.tsx)
- **风险**：低到中（仅搬 JSX + 事件透传）。
- **验证**：
  - `npm run typecheck`
  - `npx vitest run src/components/ai/AiChatCard.input.test.tsx`

## Phase 2（核心热点：消息线程）
- **目标**：把 turn 渲染和 assistant 行为块下沉，处理最大复杂区。
- **改动文件**：
  - 新增 [`src/components/ai/AiChatMessageThread.tsx`](src/components/ai/AiChatMessageThread.tsx)
  - 新增 [`src/components/ai/AiChatAssistantMessage.tsx`](src/components/ai/AiChatAssistantMessage.tsx)
  - 新增 [`src/components/ai/useAiChatAutoScrollController.ts`](src/components/ai/useAiChatAutoScrollController.ts)
  - 更新 [`src/components/ai/AiChatCard.tsx`](src/components/ai/AiChatCard.tsx)
- **风险**：中到高（消息渲染分支多，易出现细节回归）。
- **验证**：
  - `npm run typecheck`
  - `npx vitest run src/components/ai/AiChatCard.input.test.tsx -t "citation|copy|reasoning|pin|ArrowRight|Tab|Enter"`

## Phase 3（Decision/Replay 面板收口）
- **目标**：把 decision 面板渲染从 `AiChatCard` 继续下沉，主组件仅保留状态与数据接线。
- **改动文件**：
  - 新增 [`src/components/ai/AiChatDecisionPanel.tsx`](src/components/ai/AiChatDecisionPanel.tsx)
  - 新增 [`src/components/ai/AiChatDecisionListItem.tsx`](src/components/ai/AiChatDecisionListItem.tsx)
  - 更新 [`src/components/ai/AiChatCard.tsx`](src/components/ai/AiChatCard.tsx)
- **风险**：中（键盘焦点与 replay 定位状态）。
- **验证**：
  - `npm run typecheck`
  - `npx vitest run src/components/ai/AiChatCard.input.test.tsx -t "replay|snapshot|decision|vertical workflow"`

## 测试补强（与拆分并行）
- 新增/补充以下测试：
  - [`src/components/ai/useAiChatMessageInteractionController.test.ts`](src/components/ai/useAiChatMessageInteractionController.test.ts)
  - [`src/components/ai/useAiChatReplayController.test.ts`](src/components/ai/useAiChatReplayController.test.ts)
  - [`src/components/ai/useAiChatPanelResizer.test.ts`](src/components/ai/useAiChatPanelResizer.test.ts)
- 重点覆盖：timer 清理、失败分支、键盘可达性、拖拽 clamp 与解绑。

## 阶段收口标准
- 每阶段完成后都执行：
  - `npm run typecheck`
  - `npx vitest run src/components/ai/AiChatCard.input.test.tsx`
  - `npm run check:architecture-guard`
- 全部阶段完成后执行：
  - `npm run test:panel-regression`
- 验收目标：`AiChatCard.tsx` 继续显著降行，且行为回归为 0。