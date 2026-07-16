/**
 * @i18n-governance-exempt
 * 能力矩阵行中文文案（供 `timelineParityMatrix.ts` 引用）。
 * 与 `check:i18n-hardcoded` 约定：避免在 `src/pages/` 内堆中文 label，集中在本文件便于 baseline 归类到 `src/i18n/`。
 */
export const timelineParityMatrixRowsZh = {
  'timeline-shell-layers-count-single-source': {
    labelZh: '壳层 layersCount 单源（read model 与 timeline content VM 口径一致）',
  },
  'timeline-extent-single-source': {
    labelZh: '时间轴跨度单源（timelineExtentSec → lanes 宽度；max(文献, 声学) 显示规则）',
  },
  'timeline-viewport-single-writer': {
    labelZh:
      '视口投影单路径（useTimelineViewport → read model / orchestrator / viewportFrame 消费）',
  },
  'acoustic-shell-chrome-map': {
    labelZh: '声学壳 chrome 单映射（mapAcousticToTimelineChrome → lanes；禁止 lanes 内联拼 class）',
  },
  'host-vertical-projection-input': {
    labelZh: '纵向投影编排入参（与 workspace panel 合同解耦，§5.6 L 第二阶段）',
  },
  'segment-read-write': {
    labelZh: '语段读写（转写/翻译）',
  },
  'segment-range-gesture-single-surface': {
    labelZh: '语段范围拖建单一反馈面（波形空区 / 轨面套索 / Regions 插件收敛到同一产品状态）',
    verticalGapZh:
      '【产品拍板 2026-06-26：永久不做】纵向对读以编辑与导航为主；tier 内轨面套索链已禁（tierTimelineLassoSuppressed）。横向 waveform / textOnly 已 full；纵向 partial 为 intentional gap，非待补代码。',
  },
  'phase-f-range-preview-ssot': {
    labelZh: '阶段 F·1：语段范围拖建预览状态单一读模型 + 波形桥单 reducer 写者',
    verticalGapZh:
      '`useTranscriptionWaveformBridgeController` 内 `segmentRangeGestureWriterReducer` 统一 lasso 抬升态与 Regions `timeDrag`；阶段 E 已批写 `setTimingEditPreview`（拖边改时 + snap）；编排仍只读 `segmentRangeGesturePreviewReadModel`。',
  },
  'selection-write-funnel': {
    labelZh:
      '阶段 F·2–F·4：选集写路径单入口（applyTimelineSelectionCommand + selectionProjection 只读）',
    verticalGapZh:
      '横向轨面、波形 interaction、键盘/纵向 Tab（`useKeybindingActions.navigateUnitFromInput`）均经 `writeTimelineSelection`；`useTranscriptionDataBindings` 导出 funnel。',
  },
  'empty-timeline-policy': {
    labelZh: '阶段 F·3：空时间轴策略单点（EmptyTimelinePolicy → TimelineEmptyState / content VM）',
  },
  'layer-link-connector': {
    labelZh:
      '层连接器显示（textOnly/vertical：不要求与 waveform 轨头 SVG 等价，intentional partial）',
    verticalGapZh:
      '【产品拍板 2026-06-26：文档化 gap】纵向层头连接器 UX 不与 waveform 完全等价；segment 宿主数据路径仍走共享 resolveSegmentTimelineSourceLayer（§3.2 全量择优）。',
  },
  'acoustic-waveform-vad': {
    labelZh: '声学相关（波形 / overlay / VAD；textOnly/vertical 不暴露 VAD，intentional partial）',
    verticalGapZh:
      '【产品拍板 2026-06-26：文档化降级】无 waveform 宿主时不暴露 VAD/自动分句；轴状态条仍按 playableAcoustic / acousticPending 合同降级。',
  },
  'zoom-scroll': {
    labelZh: '缩放与滚动',
  },
  'acoustic-strip-contract': {
    labelZh: '声学条合同（AcousticStripContract：read model + wave/tier DOM refs）',
  },
  'timeline-mode-runtime-slim': {
    labelZh: 'timelineMode 运行时收敛（占位判定不显式读 document；删音/导音元数据写路径）',
  },
  'project-hub-time-mapping-modeless': {
    labelZh: 'Project Hub 时间映射与导出提示（不依赖 exportTimelineModeLabel；预览公式单点）',
  },
  'g3-lane-draft-editor-cell-shared': {
    labelZh: 'G3 lane 草稿格深共享（TimelineLaneDraftEditorCell：横向语段格 + 纵向对读）',
    verticalGapZh: '布局仍分横纵；共享编辑壳与 pointer/click 事件收口。',
  },
  'g3-draft-autosave-key-helpers': {
    labelZh: 'G3 草稿防抖保存 timer key 单点（seg / utt / tr / 纵向 pr-src·pr-seg·pr）',
  },
  'recording-layer-attachment': {
    labelZh: '录音与层音频附件',
    verticalGapZh: '纵向用例覆盖译文录音入口与显隐；宿主声学仍走统一 read model。',
  },
  'empty-state-and-copy': {
    labelZh: '空状态与引导语（中性时间轴心智）',
  },
} as const;

export type TimelineParityMatrixRowId = keyof typeof timelineParityMatrixRowsZh;
