---
title: ADR-0005 转写时间轴统一宿主（横向壳合并）
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-22
source_of_truth: decision-record
---

# ADR-0005 转写时间轴统一宿主（横向壳合并）

## Status

Accepted。本 ADR 记录 **2026-04 起** 转写主时间轴在**横向**上的壳层合并决策，作为 [ADR-0004](./0004-logical-timeline-acoustic-media-lifecycle.md) 的**实现阶段补充**（不推翻 0004 的主存坐标与媒体生命周期语义）。

## Context

历史上横向存在 **`waveform` 壳（`TranscriptionTimelineHorizontalMediaLanes`）** 与 **`text-only` 壳（`TranscriptionTimelineTextOnly`）** 两套实现，props 与行为易分叉。纵向对读（`TranscriptionTimelineVerticalView`）另走第三路径。

## Decision

1. **单一横向入口**：仅 [`TranscriptionTimelineWorkspaceHost`](../../src/pages/TranscriptionTimelineWorkspaceHost.tsx) 允许在运行时挂载 `TranscriptionTimelineHorizontalMediaLanes`；`resolveTimelineShellMode` 返回 `waveform` 或 `text-only` 时，**均**渲染该组件（声学可播与否由编排层与 WaveSurfer 区域处理）。
2. **移除 `TranscriptionTimelineTextOnly` 组件实现**：其独占 UI 已合并；纵向编排所需 props 类型收敛为 [`TranscriptionTimelineWorkspacePanelProps`](../../src/pages/transcriptionTimelineWorkspacePanelTypes.ts)。
3. **解码中视觉**：`shell === 'text-only' && acousticPending` 时，由 `HorizontalMediaLanes` 的 `acousticShellPending` 在根容器追加 `timeline-content-text-only timeline-content-acoustic-pending` class，延续 ADR-0004 阶段 2 的「解码中」提示语义。
4. **门禁**：[`scripts/check-timeline-single-host-entry.mjs`](../../scripts/check-timeline-single-host-entry.mjs) 禁止在宿主外直接引用 `TranscriptionTimelineHorizontalMediaLanes` JSX/import，并禁止 `TranscriptionTimelineTextOnly` 回流。

## Consequences

- 旧文档中指向 `TranscriptionTimelineTextOnly.tsx` 的路径需逐步改为「统一宿主 + `HorizontalMediaLanes`」或本 ADR。
- 纯「文献虚拟列表」独有交互若与多轨 DOM 仍有差异，应在 `HorizontalMediaLanes` 内用 props 分支表达，而非恢复第二横向组件树。

## Relation to ADR-0004

- **0004** 继续约束：`timelineMode`、`logicalDurationSec`、`timeMapping`、删音/占位与主存坐标。
- **0005** 仅约束 **横向 React 挂载拓扑** 与壳枚举到组件的映射，不改变 0004 的数据语义。
