/**
 * 统一宿主下「横向壳 vs 纵向投影」能力矩阵（第二条线：深共享 / 平级验收）。
 * 与执行规划 §5.7 对齐：docs/execution/plans/模式架构与平级评估-2026-04-21.md
 *
 * `parity` 取值：full = 能力可用且与目标一致；partial = 可用但有降级或产品取舍；none = 不可用或尚未等价。
 *
 * 版本 2：§5.6 L 表第二阶段后新增 `host-vertical-projection-input` 行（纵向投影编排入参）。
 * 版本 3：§5.6 L 表第三阶段后新增 `workspace-layout-contract-version` 行（布局偏好合同版本写回）。
 * 版本 4：Greenfield 移除 `jieyu:workspace-layout-contract-version` 与矩阵对应行；纵向偏好仅 `jieyu:workspace-vertical-view` + 读时归一。
 * 版本 5：视口单写者链路（`useTimelineViewport` → read model / orchestrator / stage zoomControls）。
 * 版本 6：`OrchestratorWaveformContent` 声学条入参收敛为 `AcousticStripContract`（read model + tier/wave refs）。
 * 版本 7：P2 `timelineMode` 运行时占位/写路径收敛（`mediaItemTimelineKind` + `LinguisticService` / cleanup）。
 * 版本 8：P3 Project Hub 时间映射与导出提示不再依赖 `activeTextTimelineMode`；预览公式 `timeMappingHubPreview`。
 * 版本 9：G3 `TimelineLaneDraftEditorCell` 共享壳（横向 `TimelineAnnotationItem` + 纵向对读草稿格）。
 * 版本 10：G3 草稿防抖 key 单点 `timelineDraftAutoSaveKeys`；侧栏译文行接入共享壳（`bubbleClick`）。
 */

export const TIMELINE_PARITY_MATRIX_VERSION = 10 as const;

export type TimelineParityShell = 'waveform' | 'textOnly' | 'vertical';

/** 与 §5.7「统一宿主目标」列一致的粗粒度状态 */
export type TimelineParityLevel = 'full' | 'partial' | 'none';

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

export const TIMELINE_PARITY_MATRIX: readonly TimelineParityRow[] = [
  {
    id: 'timeline-viewport-single-writer',
    labelZh: '视口投影单路径（useTimelineViewport → read model / orchestrator / stage）',
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/hooks/useTimelineViewport.test.ts',
      'src/pages/TranscriptionPage.structure.test.ts',
    ],
  },
  {
    id: 'host-vertical-projection-input',
    labelZh: '纵向投影编排入参（与 workspace panel 合同解耦，§5.6 L 第二阶段）',
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/pages/useTranscriptionTimelineContentViewModel.test.tsx',
    ],
  },
  {
    id: 'segment-read-write',
    labelZh: '语段读写（转写/翻译）',
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/components/TranscriptionTimelineVerticalView.test.tsx',
      'src/components/TranscriptionTimelineHorizontalMediaLanes.test.tsx',
    ],
  },
  {
    id: 'layer-link-connector',
    labelZh: '层连接器显示',
    parity: { waveform: 'full', textOnly: 'partial', vertical: 'partial' },
    verticalGapZh: '纵向层头已移除无解释恒灰项；连接器与多轨对齐细节仍按产品迭代。',
    testAnchors: [
      'src/components/TimelineLaneHeader.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.test.tsx',
    ],
  },
  {
    id: 'acoustic-waveform-vad',
    labelZh: '声学相关（波形 / overlay / VAD）',
    parity: { waveform: 'full', textOnly: 'partial', vertical: 'partial' },
    verticalGapZh: '无宿主媒体或文献壳下统一降级；与 playableAcoustic / acousticPending 合同一致。',
    testAnchors: [
      'src/utils/timelineAxisStatus.test.ts',
      'src/components/transcription/TimelineAxisStatusStrip.test.tsx',
    ],
  },
  {
    id: 'zoom-scroll',
    labelZh: '缩放与滚动',
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/hooks/useZoom.test.ts',
      'src/hooks/useTimelineViewport.test.ts',
    ],
  },
  {
    id: 'acoustic-strip-contract',
    labelZh: '声学条合同（AcousticStripContract：read model + wave/tier DOM refs）',
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/pages/TranscriptionPage.structure.test.ts',
    ],
  },
  {
    id: 'timeline-mode-runtime-slim',
    labelZh: 'timelineMode 运行时收敛（占位判定不显式读 document；删音/导音元数据写路径）',
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/utils/mediaItemTimelineKind.test.ts',
      'src/services/LinguisticService.test.ts',
    ],
  },
  {
    id: 'project-hub-time-mapping-modeless',
    labelZh: 'Project Hub 时间映射与导出提示（不依赖 activeTextTimelineMode；预览公式单点）',
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/components/transcription/LeftRailProjectHub.test.tsx',
      'src/utils/timeMappingHubPreview.test.ts',
    ],
  },
  {
    id: 'g3-lane-draft-editor-cell-shared',
    labelZh: 'G3 lane 草稿格深共享（TimelineLaneDraftEditorCell：横向语段格 + 纵向对读）',
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    verticalGapZh: '布局仍分横纵；共享编辑壳与 pointer/click 事件收口。',
    testAnchors: [
      'src/components/transcription/TimelineLaneDraftEditorCell.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.test.tsx',
    ],
  },
  {
    id: 'g3-draft-autosave-key-helpers',
    labelZh: 'G3 草稿防抖保存 timer key 单点（seg / utt / tr / 纵向 pr-src·pr-seg·pr）',
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/utils/timelineDraftAutoSaveKeys.test.ts',
      'src/hooks/useTimelineLaneTextDraftAutosave.test.tsx',
      'src/components/TranscriptionTimelineTextTranslationItem.test.tsx',
      'src/components/TranscriptionTimelineVerticalView.test.tsx',
    ],
  },
  {
    id: 'recording-layer-attachment',
    labelZh: '录音与层音频附件',
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    verticalGapZh: '纵向用例覆盖译文录音入口与显隐；宿主声学仍走统一 read model。',
    testAnchors: [
      'src/components/TranscriptionTimelineVerticalView.test.tsx',
      'src/hooks/useTranscriptionUnitActions.test.tsx',
    ],
  },
  {
    id: 'empty-state-and-copy',
    labelZh: '空状态与引导语（中性时间轴心智）',
    parity: { waveform: 'full', textOnly: 'full', vertical: 'full' },
    testAnchors: [
      'src/pages/TranscriptionPage.TimelineEmptyState.test.tsx',
    ],
  },
] as const;
