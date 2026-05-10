---
title: ReadyWorkspace 数据域与壳层装配边界
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-05-10
source_of_truth: implementation
---

# ReadyWorkspace：`data`（文档域）与壳层装配边界

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

## 回归扫描

```bash
npm run audit:ready-workspace-timeline-host
```

检测整个 **`src/`** 中 **`(壳层字段):\\s*data.`** 的反模式（含 speaker 侧 `reloadSegments` 等）。**`npm run check:architecture-guard`** 与 **`npm test`**（CI `quality`）已串联该脚本。新增 `READY_WORKSPACE_TIMELINE_HOST_WRITE_KEYS` 中的键时，须同步更新 `scripts/audit-ready-workspace-timeline-host-from-data.mjs` 中的第一组正则。
