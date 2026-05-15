---
title: ReadyWorkspace 数据域与壳层装配边界
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-05-10
source_of_truth: implementation
---

# ReadyWorkspace：`data`（文档域）与壳层装配边界

## 一页式装配导航（Orchestrator 顺序）

> 目标：新会话 / agent **不必先扫平铺的 `useReadyWorkspace*` 文件名**，即可按「阶段」定位改动落点。入口与行数守卫见 `docs/architecture/code-governance-plan-2026-05-06.md` §5.1。

**薄入口链**

1. `TranscriptionPage.ReadyWorkspace.tsx` — chunk 入口（仅 re-export / CSS）
2. `TranscriptionPage.ReadyWorkspace.body.tsx` — 薄 body，转发 Orchestrator
3. `TranscriptionPage.ReadyWorkspaceOrchestrator.tsx` — **编排壳**（约 200+ 行）：只串联阶段 hook + `buildReadyWorkspace*PhaseParams`，不展开大块业务

**编排壳内阶段顺序（与源码调用顺序一致）**

| 顺序 | 阶段 hook | 典型职责 |
| --- | --- | --- |
| 1 | `useReadyWorkspaceDomainShellPhase` | `data` 最小解构、编辑路由、segment scope 等域壳 |
| 2 | `useReadyWorkspacePreBootstrapChromePhase` | 时间轴读范围 / `timelineUnitViewIndex`、chrome ref（ADR 0020 相关 wiring） |
| 3 | `useReadyWorkspaceReadyPhaseBootstrap` | 段创建/变更、interaction helpers、overlay 路由等 bootstrap |
| 4 | `useReadyWorkspaceWaveformBridgePhase` | 波形桥、播放器、lasso、viewport |
| 5 | `useReadyWorkspaceSelectionAndAiPrepPhase` | 选择与 AI 侧栏前置 |
| 6 | `useReadyWorkspaceTimelineAssistantPlaybackPhase` | 参数来自 `buildReadyWorkspaceTimelineAssistantPlaybackPhaseParams` |
| 7 | `useReadyWorkspaceSidebarAndTrackPhase` | 参数来自 `buildReadyWorkspaceSidebarAndTrackPhaseParams` |
| 8 | `useReadyWorkspaceViewModelsAndSurfacePhase` | 参数来自 `buildReadyWorkspaceViewModelsSurfacePhaseParams`，产出舞台 / overlay props |

**主要产出 → 消费方（与「阶段顺序」互补）**

> 强调 **返回值 / builder 产物** 最终被谁组装或渲染；不重复「谁先调用谁」。行数刻意控制，细节以源码为准。

| 主要产出 | 消费方 |
| --- | --- |
| `TranscriptionPage.ReadyWorkspace.tsx` | Vite chunk / 路由 lazy import |
| `TranscriptionPage.ReadyWorkspace.body.tsx` | `TranscriptionPageReadyWorkspaceOrchestrator` |
| `useReadyWorkspaceDomainShellPhase` 返回值 | `pre` / `bootstrap` / `waveform` 与各 `buildReadyWorkspace*PhaseParams` |
| `useReadyWorkspacePreBootstrapChromePhase` 返回值 | `bootstrap`、`waveform`、`selectionAi`、timeline / sidebar builder |
| `useReadyWorkspaceReadyPhaseBootstrap` 返回值 | `waveform`、`selectionAi`、timeline / sidebar / view-models 链 |
| `useReadyWorkspaceWaveformBridgePhase` 返回值 | `selectionAi`、`timeline`、`sidebar`、`view-models` 各 phase |
| `useReadyWorkspaceSelectionAndAiPrepPhase` 返回值 | timeline / sidebar / view-models builder |
| `buildReadyWorkspaceTimelineAssistantPlaybackPhaseParams` | `useReadyWorkspaceTimelineAssistantPlaybackPhase` |
| `useReadyWorkspaceTimelineSyncSetup` + `buildReadyWorkspaceTimelineInteractionInput` | `useTranscriptionTimelineInteractionController`（经 timeline assistant phase 装配） |
| `buildReadyWorkspaceSidebarAndTrackPhaseParams` | `useReadyWorkspaceSidebarAndTrackPhase` |
| `useReadyWorkspaceTrackEditControllers`（在 sidebar phase 内调用；入参由 builder 装配） | 侧栏与轨道编辑 UI；再汇入 view-models 链 |
| `buildReadyWorkspaceViewModelsSurfacePhaseParams` | `useReadyWorkspaceViewModelsAndSurfacePhase` |
| `readyWorkspaceStageProps` / `readyWorkspaceOverlaysProps` / `readyWorkspaceLayoutStyle` | `TranscriptionPageReadyWorkspaceLayout` |
| `buildReadyWorkspaceConflictReviewDrawerProps` | `TranscriptionPageReadyWorkspaceLayout` 的冲突抽屉 props |

**时间轴交互与 `data` 边界**

- `useReadyWorkspaceTimelineSyncSetup` 汇总 **`domainWrite` + `hostWrite`** 交给 `buildReadyWorkspaceTimelineInteractionInput`（见上文「装配纪律」）。**禁止**在 setup 内写 `data.setSubSelectionRange` 等壳层 API。

## 实质

`TranscriptionPageReadyWorkspace` 收到的 `data` 来自 **`useTranscriptionData` / `useTranscriptionDataBindings`**，只覆盖 **文档与协作域 API**（units、layers、选择、持久化写路径、`snapGuide` / `setSnapGuide` 等）。

**波形视口、右键菜单、时间轴缩放、段落重载** 等状态与回调由 **其它专用 hook** 持有（波形桥、`useTranscriptionUIState`、`useReadyWorkspaceSegmentScope`、`useTranscriptionSegmentBridgeController` 等）。

若在组装 **`useTranscriptionTimelineInteractionController`**（经 `buildReadyWorkspaceTimelineInteractionInput`）时，把后者误写成 **`data.xxx`**，而 `xxx` 从未出现在 `useTranscriptionDataBindings` 的 return 上，则运行期为 **`undefined`**，首次调用即 **`… is not a function`**。

## 装配纪律（必须遵守）

1. **凡写入 `interactionInput` 的字段**：先判定归属 **文档域 (`data`)** 还是 **壳层 / 波形 / 段落读模型**；**禁止**用 `data` 冒充壳层 API。
2. **时间轴交互的「壳层写切片」**：在类型上拆为 **`domainWrite` + `hostWrite`**（见 `transcriptionReadyWorkspaceTimelineInteractionInputBuilder.ts`），`hostWrite` 只能在页面侧从对应 hook **显式传入**，不得从 `data` 读取。
3. **同类控制器**（例如 `useTranscriptionSpeakerController` 经 `useReadyWorkspaceTrackEditControllers`）：`reloadSegments`、`layerAction`、`recordTimelineEdit` 等与 **`data` 不同源** 的，**同样**必须显式入参，勿写 `data.reloadSegments` 等。

## 相关代码入口

- `src/pages/useReadyWorkspaceTimelineSyncSetup.ts` — 汇总 `domainWrite` / `hostWrite` 并调用 builder。
- `src/pages/transcriptionReadyWorkspaceTimelineInteractionInputBuilder.ts` — `hostWrite` 键集与类型定义。
- `src/pages/useReadyWorkspaceTrackEditControllers.ts` — Speaker 等控制器与段落域的显式入参。
- `src/pages/readyWorkspaceSurfaceSliceContracts.ts` — **Phase B** 表面嵌套 slice 合同（overlays / waveform / `layout`↔`BuildReadyWorkspaceLayoutStyleInputFromProps` / controllers 含 stage 所需的 `handleOpenSpeakerManagementPanel`）；`useReadyWorkspaceSurfaceProps.tsx` 消费。

## 回归扫描

```bash
npm run audit:ready-workspace-timeline-host
```

检测整个 **`src/`** 中 **`(壳层字段):\\s*data.`** 的反模式（含 speaker 侧 `reloadSegments` 等）。**`npm run check:architecture-guard`** 与 **`npm test`**（CI `quality`）已串联该脚本。新增 `READY_WORKSPACE_TIMELINE_HOST_WRITE_KEYS` 中的键时，须同步更新 `scripts/audit-ready-workspace-timeline-host-from-data.mjs` 中的第一组正则。
