/**
 * @i18n-governance-exempt
 * 能力矩阵行中文文案（供 `timelineParityMatrix.ts` 引用）。
 * 与 `check:i18n-hardcoded` 约定：避免在 `src/pages/` 内堆中文 label，集中在本文件便于 baseline 归类到 `src/i18n/`。
 */
export const timelineParityMatrixRowsZh = {
  'timeline-shell-layers-count-single-source': {
    labelZh: '壳层 layersCount 单源（read model 与 timeline content VM 口径一致）',
  },
  'timeline-viewport-single-writer': {
    labelZh: '视口投影单路径（useTimelineViewport → read model / orchestrator / stage）',
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
      '纵向对读以编辑与导航为主；tier 内轨面套索链已禁（tierTimelineLassoSuppressed），对读子树点击与清选由 useLasso 排除列表与 useLasso.test.tsx 回归覆盖；与横向轨面拖建完全等价仍待阶段 F。',
  },
  'phase-f-range-preview-ssot': {
    labelZh: '阶段 F·1：语段范围拖建预览状态单一读模型 + 波形桥单 reducer 写者',
    verticalGapZh:
      '`useTranscriptionWaveformBridgeController` 内 `segmentRangeGestureWriterReducer` 统一 lasso 抬升态与 Regions `timeDrag`；编排仍只读 `segmentRangeGesturePreviewReadModel`；`useLasso` 手势实现细节可继续瘦身但已不再与 `dragPreview` 双源并行。',
  },
  'layer-link-connector': {
    labelZh: '层连接器显示',
    verticalGapZh: '纵向层头已移除无解释恒灰项；连接器与多轨对齐细节仍按产品迭代。',
  },
  'acoustic-waveform-vad': {
    labelZh: '声学相关（波形 / overlay / VAD）',
    verticalGapZh: '无宿主媒体或文献壳下统一降级；与 playableAcoustic / acousticPending 合同一致。',
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
    labelZh: 'Project Hub 时间映射与导出提示（不依赖 activeTextTimelineMode；预览公式单点）',
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
