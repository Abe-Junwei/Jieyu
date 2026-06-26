/**
 * @i18n-governance-exempt
 * 本文件为工程治理与验收矩阵代码化，非用户可见 UI 文案。
 * `labelZh` / `verticalGapZh` 字段与中文执行规划文档对齐，不进入 i18n 消息系统。
 *
 * 统一宿主下「横向壳 vs 纵向投影」能力矩阵（第二条线：深共享 / 平级验收）。
 * 与执行规划 §5.7 对齐：docs/execution/plans/模式架构与平级评估-2026-04-21.md
 *
 * `parity` 取值：full = 能力可用且与目标一致；partial = 可用但有降级或产品取舍；none = 不可用或尚未等价。
 *
 * 版本 2：§5.6 L 表第二阶段后新增 `host-vertical-projection-input` 行（纵向投影编排入参）。
 * 版本 3：§5.6 L 表第三阶段后新增 `workspace-layout-contract-version` 行（布局偏好合同版本写回）。
 * 版本 4：Greenfield 移除 `jieyu:workspace-layout-contract-version` 与矩阵对应行；纵向偏好仅 `jieyu:workspace-vertical-view` + 读时归一。
 * 版本 5：视口单写者链路（`useTimelineViewport` → read model / orchestrator / stage zoomControls）。
 * 版本 6：`OrchestratorWaveformContent` 声学条入参收敛为 `AcousticStripContract`（read model + wave/tier DOM refs）。
 * 版本 7：P2 `timelineMode` 运行时占位/写路径收敛（`mediaItemTimelineKind` + `LinguisticService` / cleanup）。
 * 版本 8：P3 Project Hub 时间映射与导出提示不再依赖 `activeTextTimelineMode`；预览公式 `timeMappingHubPreview`。
 * 版本 9：G3 `TimelineLaneDraftEditorCell` 共享壳（横向 `TimelineAnnotationItem` + 纵向对读草稿格）。
 * 版本 10：G3 草稿防抖 key 单点 `timelineDraftAutoSaveKeys`；侧栏译文行接入共享壳（`bubbleClick`）。
 * 版本 11：`g3-draft-autosave-key-helpers` 增补 `TranscriptionTimelineHorizontalMediaLanes.test.tsx` 锚点（覆盖 `MediaTranslationRow` + `timelineTranslationHostDraftAutoSaveKey`）；草稿 hook / Escape 防抖 key 与 `usesOwnSegments` 对齐验收随矩阵升版。
 * 版本 12：阶段 F 契约行 **`segment-range-gesture-single-surface`**（单一拖建/单一反馈产品层；与声学壳解耦）；锚点 `segmentRangeGestureParity.test.ts`。
 * 版本 13：前置硬化 §3.1 壳层 `layersCount` 单源矩阵行（read model 与 content VM 语义一致）。
 * 版本 14：`segment-range-gesture-single-surface` 纵向说明与「禁 tier 套索链 + useLasso 回归」实现对齐（文案-only）。
 * 版本 15：阶段 F·1 工程锚点行 **`phase-f-range-preview-ssot`**（预览状态 SSOT；parity 全 partial，见 `phaseFRangePreviewSsot.test.ts`）。
 * 版本 16：`phase-f-range-preview-ssot` 读模型贯通编排（tier `lassoRect` / 文本 `timingDragPreview`）与 `OrchestratorWaveformContent` 主波形套索渲染。
 * 版本 17：波形桥 `segmentRangeGestureWriterReducer` 单写者（lasso 预览抬升 + Regions `timeDrag` 同 reducer）；`segmentRangeGesturePreviewWriter.test.ts` 锚点。
 * 版本 18：`useSegmentRangeGesturePreviewWriter` 抽离 hooks；ReadyWorkspace 编排 timeline/annotation 头外提 `buildOrchestratorRawTimelineAnnotationCluster`。
 * 版本 19：阶段 A **`timeline-extent-single-source`**（lanes 宽度只读 `timelineExtentSec`；§3.1 RM↔VM 壳态对照测试加固）。
 * 版本 20：阶段 B **`timeline-viewport-single-writer`** 锚点扩展（`viewportFrame` 消费 + tier-primary scroll 投影）。
 * 版本 21：§3.2 link 全量择优锚点登记（`useLayerSegments.test.ts` → `layer-link-connector`）。
 * 版本 22：阶段 B overlay — `RegionActionOverlay` 接 `viewportFrame.scrollLeftPx`（`viewportFrameToScreenRange`）。
 * 版本 23：阶段 C — `acoustic-shell-chrome-map`（lanes 只消费 mapper 输出的 class）。
 * 版本 24：阶段 A2 — bridge `fitSpanSec` / viewport sizing 与 `timeline.extentSec` 同源（`readyWorkspaceTimelineExtents`）。
 * 版本 25：阶段 B2 — `useZoom` extended-document ruler batch 接 `resolveViewportFrameScrollLeftPx`；overlay/hotspot 接 `viewportFrame`。
 * 版本 26：阶段 D′ — `snapGuide` 并入 `segmentRangeGestureWriterReducer`；ReadyWorkspace 改时预览写者单源。
 * 版本 27：阶段 E — `timingEdit` 批写 patch（拖边改时 + snap 同 dispatch）；读模型 `timeRange.mode`；hostWrite 收敛为 `setTimingEditPreview`。
 * 版本 28：阶段 F — `selectionProjection` + `emptyTimeline` 读模型；`applyTimelineSelectionCommand` 写 funnel；`EmptyTimelinePolicy` 驱动空壳。
 * 版本 29：阶段 F·2 — 横向轨面 `useTimelineAnnotationHelpers` 选集写路径经 `writeTimelineSelection` → `applyTimelineSelectionCommand`。
 * 版本 30：阶段 F·3 — 波形 `useTranscriptionTimelineInteractionController` 选集写路径经同一 funnel。
 * 版本 31：阶段 B 完成 — `applyTimelineViewportScroll` 收敛 wheel/ruler/跟随写路径；阶段 D — 套索 overlay 统一组件 + 禁用 RegionsPlugin 拖选视觉。
 * 版本 32：审查修复 — `useLasso` 波形套索时间坐标回退 WS scroll-parent；轨面 segment shift/meta 经 `writeTimelineSelection`；`timeDrag` previewMode 语义修正。
 * 版本 33：阶段 B 收尾 — tier scroll 镜像经 `applyTimelineViewportScroll`；阶段 D — 子选区预览进 gesture reducer + React overlay。
 * 版本 34：阶段 D 完成 — 移除 legacy `lassoRect` / `waveLassoRect`；media lanes 直消费 `segmentRangeGesturePreviewReadModel`。
 * 版本 35：阶段 F·4 — 键盘/纵向 Tab 选集经 `writeTimelineSelection`；`selection-write-funnel` 纵向 parity 升为 full。
 */

import type { TimelineParityMatrixRowId } from '../i18n/messages';
import { timelineParityMatrixRowsZh } from '../i18n/messages';

export const TIMELINE_PARITY_MATRIX_VERSION = 35 as const;

type TimelineParityShell = 'waveform' | 'textOnly' | 'vertical';

/** 与 §5.7「统一宿主目标」列一致的粗粒度状态 */
type TimelineParityLevel = 'full' | 'partial' | 'none';

export interface TimelineParityRow {
  /** 稳定机器 id，供测试与 CI 引用 */
  id: string;
  /** 人类可读标题（中文，与规划表「能力」列对应） */
  labelZh: string;
  parity: Record<TimelineParityShell, TimelineParityLevel>;
  /** 纵向与横向未完全等价时的说明（可空） */
  verticalGapZh?: string;
  /**
   * 现有回归锚点：相对仓库根的 vitest 文件路径。
   * 新增能力时优先补锚点，再视情况加专用用例。
   */
  testAnchors: readonly string[];
}

function rowParts(
  id: TimelineParityMatrixRowId,
): Pick<TimelineParityRow, 'labelZh'> & Partial<Pick<TimelineParityRow, 'verticalGapZh'>> {
  const r = timelineParityMatrixRowsZh[id];
  return 'verticalGapZh' in r
    ? { labelZh: r.labelZh, verticalGapZh: r.verticalGapZh }
    : { labelZh: r.labelZh };
}

export const TIMELINE_PARITY_MATRIX: readonly TimelineParityRow[] = [
  {
    id: 'timeline-shell-layers-count-single-source',
    ...rowParts('timeline-shell-layers-count-single-source'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/pages/timelineReadModel.test.ts',
      'src/pages/useTranscriptionTimelineContentViewModel.test.tsx',
      'src/pages/TranscriptionPage.structure.test.ts',
    ],
  },
  {
    id: 'timeline-extent-single-source',
    ...rowParts('timeline-extent-single-source'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/utils/timelineExtent.test.ts',
      'src/pages/readyWorkspaceTimelineExtents.test.ts',
      'src/pages/timelineReadModel.test.ts',
      'src/components/TranscriptionTimelineHorizontalMediaLanes.test.tsx',
      'src/pages/transcriptionReadyWorkspaceOrchestratorInput.test.ts',
      'src/pages/TranscriptionPage.structure.test.ts',
    ],
  },
  {
    id: 'timeline-viewport-single-writer',
    ...rowParts('timeline-viewport-single-writer'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/hooks/transcription/useTimelineViewport.test.ts',
      'src/utils/viewportFrameToDocRange.test.ts',
      'src/utils/viewportFrameToScreenRange.test.ts',
      'src/utils/resolveViewportFrameScrollLeftPx.test.ts',
      'src/utils/applyTimelineViewportScroll.test.ts',
      'src/utils/waveformScrollParentScrollPx.test.ts',
      'src/hooks/ui/useZoom.test.ts',
      'src/pages/waveformBridgeTierScrollSync.test.ts',
      'src/hooks/ui/useLasso.test.tsx',
      'src/pages/TranscriptionPage.structure.test.ts',
    ],
  },
  {
    id: 'acoustic-shell-chrome-map',
    ...rowParts('acoustic-shell-chrome-map'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/utils/mapAcousticToTimelineChrome.test.ts',
      'src/pages/TranscriptionTimelineWorkspaceHost.test.tsx',
      'src/pages/TranscriptionPage.structure.test.ts',
    ],
  },
  {
    id: 'host-vertical-projection-input',
    ...rowParts('host-vertical-projection-input'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: ['src/pages/useTranscriptionTimelineContentViewModel.test.tsx'],
  },
  {
    id: 'segment-read-write',
    ...rowParts('segment-read-write'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/components/TranscriptionTimelineVerticalView.suite-a.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-b.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-c.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-d.test.tsx',
      'src/components/TranscriptionTimelineHorizontalMediaLanes.test.tsx',
    ],
  },
  {
    id: 'segment-range-gesture-single-surface',
    ...rowParts('segment-range-gesture-single-surface'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'partial' },
    testAnchors: [
      'src/pages/timelineParityMatrix.test.ts',
      'src/pages/segmentRangeGestureParity.test.ts',
      'src/pages/TranscriptionPage.structure.test.ts',
      'src/hooks/ui/useLasso.test.tsx',
      'src/components/transcription/SegmentRangeLassoPreviewOverlay.tsx',
    ],
  },
  {
    id: 'phase-f-range-preview-ssot',
    ...rowParts('phase-f-range-preview-ssot'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/pages/phaseFRangePreviewSsot.test.ts',
      'src/utils/segmentRangeGesturePreviewReadModel.test.ts',
      'src/utils/segmentRangeGesturePreviewWriter.test.ts',
      'src/hooks/transcription/useSegmentRangeGesturePreviewWriter.test.ts',
      'src/pages/segmentRangeGestureParity.test.ts',
      'src/pages/timelineParityMatrix.test.ts',
    ],
  },
  {
    id: 'selection-write-funnel',
    ...rowParts('selection-write-funnel'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/pages/phaseFSelectionAndEmptyPolicy.test.ts',
      'src/utils/applyTimelineSelectionCommand.test.ts',
      'src/utils/timelineSelectionProjection.test.ts',
      'src/pages/timelineReadModel.test.ts',
      'src/hooks/transcription/useTimelineAnnotationHelpers.test.tsx',
      'src/pages/useTranscriptionTimelineInteractionController.test.tsx',
      'src/hooks/ui/useKeybindingActions.test.tsx',
      'src/pages/TranscriptionPage.structure.test.ts',
    ],
  },
  {
    id: 'empty-timeline-policy',
    ...rowParts('empty-timeline-policy'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/pages/phaseFSelectionAndEmptyPolicy.test.ts',
      'src/utils/emptyTimelinePolicy.test.ts',
      'src/pages/TranscriptionPage.TimelineEmptyState.test.tsx',
      'src/pages/useTranscriptionTimelineContentViewModel.test.tsx',
    ],
  },
  {
    id: 'layer-link-connector',
    ...rowParts('layer-link-connector'),
    parity: { waveform: 'full', textOnly: 'partial', vertical: 'partial' },
    testAnchors: [
      'src/hooks/layer/useLayerSegments.test.ts',
      'src/components/TimelineLaneHeader.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-a.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-b.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-c.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-d.test.tsx',
    ],
  },
  {
    id: 'acoustic-waveform-vad',
    ...rowParts('acoustic-waveform-vad'),
    parity: { waveform: 'full', textOnly: 'partial', vertical: 'partial' },
    testAnchors: [
      'src/utils/timelineAxisStatus.test.ts',
      'src/components/transcription/TimelineAxisStatusStrip.test.tsx',
    ],
  },
  {
    id: 'zoom-scroll',
    ...rowParts('zoom-scroll'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/hooks/ui/useZoom.test.ts',
      'src/hooks/transcription/useTimelineViewport.test.ts',
    ],
  },
  {
    id: 'acoustic-strip-contract',
    ...rowParts('acoustic-strip-contract'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: ['src/pages/TranscriptionPage.structure.test.ts'],
  },
  {
    id: 'timeline-mode-runtime-slim',
    ...rowParts('timeline-mode-runtime-slim'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/utils/mediaItemTimelineKind.test.ts',
      'src/services/LinguisticService.test.ts',
    ],
  },
  {
    id: 'project-hub-time-mapping-modeless',
    ...rowParts('project-hub-time-mapping-modeless'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/components/transcription/LeftRailProjectHub.test.tsx',
      'src/utils/timeMappingHubPreview.test.ts',
    ],
  },
  {
    id: 'g3-lane-draft-editor-cell-shared',
    ...rowParts('g3-lane-draft-editor-cell-shared'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/components/transcription/TimelineLaneDraftEditorCell.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-a.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-b.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-c.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-d.test.tsx',
    ],
  },
  {
    id: 'g3-draft-autosave-key-helpers',
    ...rowParts('g3-draft-autosave-key-helpers'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/utils/timelineDraftAutoSaveKeys.test.ts',
      'src/hooks/transcription/useTimelineLaneTextDraftAutosave.test.tsx',
      'src/components/TranscriptionTimelineHorizontalMediaLanes.test.tsx',
      'src/components/TranscriptionTimelineTextTranslationItem.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-a.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-b.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-c.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-d.test.tsx',
    ],
  },
  {
    id: 'recording-layer-attachment',
    ...rowParts('recording-layer-attachment'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/components/TranscriptionTimelineVerticalView.suite-a.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-b.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-c.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.suite-d.test.tsx',
      'src/hooks/transcription/useTranscriptionUnitActions.test.tsx',
    ],
  },
  {
    id: 'empty-state-and-copy',
    ...rowParts('empty-state-and-copy'),
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: ['src/pages/TranscriptionPage.TimelineEmptyState.test.tsx'],
  },
];
