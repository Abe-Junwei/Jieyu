---
title: ready-workspace-body-拆分迁移-2026-05-09
doc_type: execution-plan
status: active
owner: repo
last_reviewed: 2026-05-12
---
# ReadyWorkspace.body 拆分迁移总览（2026-05-09）

## 关联：一次性收口总图

剩余工作（body 压到 **≤550 行**、L1–L11 阶段 hook、守卫/测试一次对齐）见 **`ready-workspace-body-彻底拆分一次性计划-2026-05-09.md`**。本文件保留阶段 0～6 的增量记录；**执行彻底拆分时以该文件为单一真值**。

## 目标

在 **`TranscriptionPage.ReadyWorkspace.tsx` 仅作 chunk 入口（CSS + re-export）** 的前提下，将 **`TranscriptionPage.ReadyWorkspace.body.tsx`** 从「单文件编排中枢」演进为「薄编排壳 + 卫星模块 / 专用 hook」，持续满足：

- `copilot-instructions.md`：编排层只做组装；成簇回调进 controller；单 hook 300 行 / 12 个 effect+memo+callback 阈值。
- `scripts/architecture-guard/rules.pages.mjs`：入口壳与 **body** 分轨守门（入口 maxLines 40；body 继承原 ReadyWorkspace 规则）。
- `src/pages/TranscriptionPage.structure.test.ts`：通过 `readTranscriptionReadyWorkspaceRuntimeSource()`（shell + body）断言关键接线。

## 当前状态（Phase 0）

| 项 | 说明 |
|----|------|
| 入口 | `TranscriptionPage.ReadyWorkspace.tsx`：样式 + `export { TranscriptionPageReadyWorkspace } from './TranscriptionPage.ReadyWorkspace.body'` |
| 实现 | `TranscriptionPage.ReadyWorkspace.body.tsx`：全部 hook / 组装 / JSX |
| 已外提卫星 | `readyWorkspaceSurfaceOrchestratorLayeredFlatSlice`、`readyWorkspaceSurfacePropsOrchestratorInputSlice`、`readyWorkspaceAssistantBridgeOrchestratorInputSlice`、`readyWorkspaceViewModels*` 等 |

## 迁移阶段（建议顺序）

### Phase 1 — Surface 编排「四段 input」卫星化（优先）

**范围**：`layoutInput` / `waveformInput` / `overlaysInput` / `controllersInput`（`buildReadyWorkspaceSurfacePropsOrchestratorInputSlice` 的非 `layeredFlat` 部分）。

**做法**：

1. 新增 `readyWorkspaceSurfaceOrchestratorNestedSliceInputsBuilder.ts`（或按域拆 `…WaveformSlice.ts`、`…OverlaysSlice.ts`），用 **纯函数** 从「已分组 deps」组装四段 input；避免在 body 内保留 150+ 行字面量。
2. **分组策略**（减少扁平参数爆炸）：`playbackBundle`（keyboard + readModel + player + projection）、`waveformRefs`、`overlayMenus`、`controllerBundle` 等；重复字段（如 `selectedMediaIsVideo`）只在 deps 出现一次，在 builder 内写入 layout 与 waveform。
3. body 仅：`const nested = build…(deps);` + `useReadyWorkspaceSurfaceOrchestratorBundle({ layeredFlat, ...nested })`（见 Phase 2 薄 hook）。

**验收**：`npx tsc --noEmit`、`npm run check:architecture-guard`、`npx vitest run src/pages/TranscriptionPage.structure.test.ts`。

### Phase 2 — Surface 薄 hook（可选、与 Phase 1 衔接）

**范围**：`useReadyWorkspaceSurfaceProps(buildReadyWorkspaceSurfacePropsOrchestratorInputSlice(…))`。

**做法**：`useReadyWorkspaceSurfaceOrchestratorBundle(args)` 内部调用 `buildReadyWorkspaceSurfacePropsOrchestratorInputSlice` + `useReadyWorkspaceSurfaceProps`，body 单行取 `readyWorkspaceOverlaysProps` 等。

**注意**：不在 hook 内隐藏 `useMemo` 依赖地狱；若引入 `useMemo`，deps 列表必须与现行为一致或可证等价。

### Phase 3 — AI 桥 `assembleReadyWorkspaceAssistantBridgeControllerInput` 的 deps 组装

**范围**：`bridge` 大块 + 尾部标量（`currentNotes`、`timelineViewportProjection`、`effectiveLaneLockMap` 等）。

**做法**：

1. `joinAssistantBridgeOrchestratorSliceDeps({ segmentScopeMediaItem, bridge, tail })`（已实现卫星）保持 **tail 与 bridge 字段不扁平合并**，避免 `selectedLayerId` 等键冲突。
2. 后续可将 `bridge` 内再拆为「选区 / 层与段 / token / 云与 acoustic」子 builder，每块单独类型与单测。

**验收**：同 Phase 1 + 若有桥相关 vitest 则跑 targeted。

### Phase 4 — Assistant Sidebar `useTranscriptionAssistantSidebarControllerInput` 输入

**范围**：`runtimePropsInput` 与 header 字段（`aiChat`、`observer*`、`timelineReadModelEpoch` 等）。

**做法**：

1. `buildReadyWorkspaceAssistantSidebarRuntimePropsInputSlice.ts`：纯函数组装 `UseTranscriptionRuntimePropsInput`（含 `buildAssistantRuntimeVoiceAnalysisFireAndForgetHandler`）。
2. `buildReadyWorkspaceAssistantSidebarControllerInputHeaderSlice.ts`：纯函数组装 header 部分。
3. body：`useTranscriptionAssistantSidebarControllerInput({ ...header, runtimePropsInput: buildRuntime…(...) })`。

### Phase 5 — body 上半区「bootstrap」聚合 hook（可选、大改动）

**范围**：自 `useTranscriptionData` 解构之后到 `useReadyWorkspacePlaybackReadModelSetup` 之前的多段 shell / selection / bridge / shell controller。

**做法**：新建 `useReadyWorkspaceReadyPhaseBootstrap.ts`（或按域 2～3 个 hook），把 **稳定顺序** 的 hook 串迁入；body 只保留与 UI 强绑定的局部 state。

**风险**：依赖顺序与 rerender 行为；必须结构测试 + 关键交互手测或 E2E。

### Phase 6 — 文档与治理表

- 更新 `docs/architecture/code-governance-plan-2026-05-06.md` 中 ReadyWorkspace **行数口径**（入口 + body 分列）。
- 大目录变更后：`npm run report:docs-link-debt`（若移动/新增大量 docs 链接）。

## 守门命令（每阶段）

```bash
npx tsc --noEmit
npm run check:architecture-guard
node scripts/check-transcription-lane-read-scope.mjs
npx vitest run src/pages/TranscriptionPage.structure.test.ts
```

可选：`npx vitest run src/pages/TranscriptionPage.ReadyWorkspace.runtime.test.ts` 等与转写相关的 targeted tests。

## 本文件落地记录

| 日期 | 内容 |
|------|------|
| 2026-05-09 | 建立总览；执行 Phase 2 薄 hook + Phase 3 `joinAssistantBridgeOrchestratorSliceDeps` 接线 |
| 2026-05-09 | **Phase 1**：`readyWorkspaceSurfaceOrchestratorNestedSliceInputsBuilder.ts` 组装 `layoutInput` / `waveformInput` / `overlaysInput` / `controllersInput`；`TranscriptionPage.ReadyWorkspace.body.tsx` 以 `...buildReadyWorkspaceSurfaceOrchestratorNestedSliceInputs({ … })` 接入 |
| 2026-05-09 | **Phase 4**：`readyWorkspaceAssistantSidebarRuntimePropsInputSlice.ts`（`buildReadyWorkspaceAssistantSidebarRuntimePropsInput` + voice analysis fire-and-forget）、`readyWorkspaceAssistantSidebarControllerInputHeaderSlice.ts`；`UseTranscriptionAssistantSidebarControllerInputArgs` / `HeaderArgs` 从 `useTranscriptionAssistantSidebarControllerInput.ts` 导出 |
| 2026-05-09 | **Phase 5**：`useReadyWorkspaceReadyPhaseBootstrap.ts` 聚合「统一条数同步 → 段钳制 → interaction helpers → 段 mutation/creation → unit ops → overlay 路由」前置 hook 簇；`rules.pages.mjs` body 与 ratchet 分轨；`TranscriptionPage.structure.test.ts` 以 `readTranscriptionReadyWorkspaceReadySurfaceWiring()` 覆盖 bootstrap 接线断言 |
| 2026-05-09 | **Phase 6**：`docs/architecture/code-governance-plan-2026-05-06.md` 更新 ReadyWorkspace **入口 + body + bootstrap** 行数口径（`wc -l` 快照） |
