---
name: AiChatCard phased split
overview: 先以最小风险拆分 `AiChatCard` 的高密度交互逻辑，再逐步收口 composer 与 replay 决策链路，确保每阶段都可独立验证与回滚。
todos:
  - id: phase1-message-controller
    content: 拆分消息区交互 controller，完成 AiChatCard 最小第一刀
    status: completed
  - id: phase2-composer-flow
    content: 收口 composer 键盘与 recommendation 逻辑，降低 JSX 条件分支复杂度
    status: completed
  - id: phase3-replay-boundary
    content: 重整 replay/decision controller 接口，减少 setter 穿透
    status: completed
  - id: phase-gates
    content: 每阶段运行 typecheck、AiChatCard focused tests、architecture guard 并记录结果
    status: completed
isProject: false
---

# AiChatCard 拆分执行计划

## 目标与边界
- 优先降低 `src/components/ai/AiChatCard.tsx` 的编排复杂度，避免继续在组件层累积成簇业务回调。
- 拆分遵循“最小第一刀”：先抽取高耦合交互簇，不改 UI 行为与用户可见流程。
- 避免把复杂度平移到新的 mega-hook；每次拆分都要形成清晰输入/输出边界。

## 当前基线（作为验收前后对比）
- 核心热点：`src/components/ai/AiChatCard.tsx`（约 1691 行，`useState/useMemo/useEffect` 密集，内联事件较多）。
- 已有可复用拆分基础：
  - `src/components/ai/AiChatSummaryPanels.tsx`
  - `src/components/ai/useAiChatComposerActions.ts`
  - `src/components/ai/useAiChatReplayBundleOpener.ts`
  - `src/components/ai/useAiChatReplayArtifactActions.ts`
  - `src/components/ai/useAiChatPanelResizer.ts`
  - `src/components/ai/useAiChatTransientBlockedHint.ts`
- 关键回归保护：`src/components/ai/AiChatCard.input.test.tsx`。

## Phase 1（最小第一刀）
- 目标：抽离消息区交互簇（pin/copy/reasoning/citation 与相关派生），减少 `AiChatCard` 内联回调与状态拼装。
- 预计改动文件：
  - `src/components/ai/AiChatCard.tsx`
  - `src/components/ai/useAiChatMessageInteractionController.ts`（新增）
  - `src/components/ai/AiChatCard.input.test.tsx`（仅必要断言/适配）
- 风险点：optimistic pin/unpin 时序、复制状态回落、citation 跳转动作顺序。
- 验证：
  - `npm run typecheck`
  - `vitest run src/components/ai/AiChatCard.input.test.tsx`
  - `npm run check:architecture-guard`

## Phase 2（Composer 收口）
- 目标：将 composer 键盘分支（IME/Enter/Tab/ArrowRight/Escape）与 recommendation 接受链路进一步从 JSX 收口到 action/controller 层。
- 预计改动文件：
  - `src/components/ai/AiChatCard.tsx`
  - `src/components/ai/useAiChatComposerActions.ts`
  - `src/components/ai/aiChatComposerKeydown.ts`（可选新增，纯函数）
  - `src/components/ai/AiChatCard.input.test.tsx`
- 风险点：IME 边界、recommendation telemetry 触发时机。
- 验证：
  - `npm run typecheck`
  - `vitest run src/components/ai/AiChatCard.input.test.tsx -t "IME|recommendation|ArrowRight|Tab|Enter"`
  - `npm run check:architecture-guard`

## Phase 3（Replay/Decision 边界重整）
- 目标：减少 replay 相关 hook 的 setter 穿透，统一为更稳定的 controller 输入/输出接口。
- 预计改动文件：
  - `src/components/ai/AiChatCard.tsx`
  - `src/components/ai/useAiChatReplayArtifactActions.ts`
  - `src/components/ai/useAiChatReplayBundleOpener.ts`
  - `src/components/ai/useAiChatReplayController.ts`（可选新增）
  - `src/components/ai/AiChatCard.input.test.tsx`
- 风险点：replay focus/定位高亮、snapshot 导入导出与 diff 刷新链路。
- 验证：
  - `npm run typecheck`
  - `vitest run src/components/ai/AiChatCard.input.test.tsx -t "replay|snapshot|decision|vertical workflow"`
  - `npm run check:architecture-guard`
  - `npm run test:panel-regression`（阶段收口时执行）

## 执行顺序建议
- 严格按 Phase 1 → Phase 2 → Phase 3 递进；每阶段独立提交并通过验证后再进入下一阶段。
- 若某阶段验证失败，先在该阶段内回收边界，不跨阶段叠加修复。