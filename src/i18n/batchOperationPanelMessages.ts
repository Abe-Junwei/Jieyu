import { normalizeLocale, t, tf, type Locale } from './index';

export type BatchOperationPanelMessages = {
  overlapAdjacent: string;
  previewNoSelection: string;
  invalidOffsetNumber: string;
  offsetDetail: (delta: number) => string;
  conflictNegativeTime: string;
  conflictDurationTooShort: string;
  conflictNone: string;
  globalBlocking: string;
  globalPreviewPass: string;
  invalidScaleFactor: string;
  invalidAnchorTime: string;
  scaleDetail: (factor: number, pivot: number) => string;
  regexRequired: string;
  regexInvalid: string;
  sourceTextEmpty: string;
  skipped: string;
  matchedSegments: (count: number) => string;
  segmentedTooShort: (count: number) => string;
  totalSegments: (count: number) => string;
  textDetail: (textHint: string, hasMore: boolean) => string;
  splitPreviewReady: string;
  splitPreviewEmpty: string;
  needAtLeastTwo: string;
  insufficientCount: string;
  keepAndExtend: string;
  mergeInto: (id: string) => string;
  mergeDeleteAndMove: string;
  mergeConditionNotMet: string;
  panelTitle: string;
  resetLayout: string;
  close: string;
  selectedCount: (count: number) => string;
  previewScopeLabel: string;
  previewScopeAria: string;
  previewScopeSelected: string;
  previewScopeLayerAll: string;
  previewLayerLabel: string;
  previewLayerAria: string;
  previewCurrentLayer: string;
  layerAllHint: (count: number) => string;
  rowPreviewTitle: string;
  passCount: (count: number) => string;
  warnCount: (count: number) => string;
  blockCount: (count: number) => string;
  showAll: string;
  showConflictsOnly: string;
  tableSegmentId: string;
  tableSegmentText: string;
  tableOriginal: string;
  tableNext: string;
  tableDetail: string;
  tableConflict: string;
  tableJump: string;
  jump: string;
  noRows: string;
  tabOffset: string;
  tabScale: string;
  tabSplit: string;
  tabMerge: string;
  offsetSeconds: string;
  runOffset: string;
  scaleFactor: string;
  anchorTime: string;
  anchorPlaceholder: string;
  runScale: string;
  regexPattern: string;
  regexFlags: string;
  runSplit: string;
  mergeHint: string;
  runMerge: string;
  shortcutHint: string;
};

export function getBatchOperationPanelMessages(locale: Locale): BatchOperationPanelMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  return {
    overlapAdjacent: t(normalizedLocale, 'msg.batchOp.overlapAdjacent'),
    previewNoSelection: t(normalizedLocale, 'msg.batchOp.previewNoSelection'),
    invalidOffsetNumber: t(normalizedLocale, 'msg.batchOp.invalidOffsetNumber'),
    offsetDetail: (delta) => tf(normalizedLocale, 'msg.batchOp.offsetDetail', { sign: delta >= 0 ? '+' : '', delta: delta.toFixed(3) }),
    conflictNegativeTime: t(normalizedLocale, 'msg.batchOp.conflictNegativeTime'),
    conflictDurationTooShort: t(normalizedLocale, 'msg.batchOp.conflictDurationTooShort'),
    conflictNone: t(normalizedLocale, 'msg.batchOp.conflictNone'),
    globalBlocking: t(normalizedLocale, 'msg.batchOp.globalBlocking'),
    globalPreviewPass: t(normalizedLocale, 'msg.batchOp.globalPreviewPass'),
    invalidScaleFactor: t(normalizedLocale, 'msg.batchOp.invalidScaleFactor'),
    invalidAnchorTime: t(normalizedLocale, 'msg.batchOp.invalidAnchorTime'),
    scaleDetail: (factor, pivot) => tf(normalizedLocale, 'msg.batchOp.scaleDetail', { factor: factor.toFixed(3), pivot: pivot.toFixed(3) }),
    regexRequired: t(normalizedLocale, 'msg.batchOp.regexRequired'),
    regexInvalid: t(normalizedLocale, 'msg.batchOp.regexInvalid'),
    sourceTextEmpty: t(normalizedLocale, 'msg.batchOp.sourceTextEmpty'),
    skipped: t(normalizedLocale, 'msg.batchOp.skipped'),
    matchedSegments: (count) => tf(normalizedLocale, 'msg.batchOp.matchedSegments', { count }),
    segmentedTooShort: (count) => tf(normalizedLocale, 'msg.batchOp.segmentedTooShort', { count }),
    totalSegments: (count) => tf(normalizedLocale, 'msg.batchOp.totalSegments', { count }),
    textDetail: (textHint, hasMore) => tf(normalizedLocale, 'msg.batchOp.textDetail', { textHint, ellipsis: hasMore ? ' ...' : '' }),
    splitPreviewReady: t(normalizedLocale, 'msg.batchOp.splitPreviewReady'),
    splitPreviewEmpty: t(normalizedLocale, 'msg.batchOp.splitPreviewEmpty'),
    needAtLeastTwo: t(normalizedLocale, 'msg.batchOp.needAtLeastTwo'),
    insufficientCount: t(normalizedLocale, 'msg.batchOp.insufficientCount'),
    keepAndExtend: t(normalizedLocale, 'msg.batchOp.keepAndExtend'),
    mergeInto: (id) => tf(normalizedLocale, 'msg.batchOp.mergeInto', { id }),
    mergeDeleteAndMove: t(normalizedLocale, 'msg.batchOp.mergeDeleteAndMove'),
    mergeConditionNotMet: t(normalizedLocale, 'msg.batchOp.mergeConditionNotMet'),
    panelTitle: t(normalizedLocale, 'msg.batchOp.panelTitle'),
    resetLayout: t(normalizedLocale, 'msg.batchOp.resetLayout'),
    close: t(normalizedLocale, 'msg.batchOp.close'),
    selectedCount: (count) => tf(normalizedLocale, 'msg.batchOp.selectedCount', { count }),
    previewScopeLabel: t(normalizedLocale, 'msg.batchOp.previewScopeLabel'),
    previewScopeAria: t(normalizedLocale, 'msg.batchOp.previewScopeAria'),
    previewScopeSelected: t(normalizedLocale, 'msg.batchOp.previewScopeSelected'),
    previewScopeLayerAll: t(normalizedLocale, 'msg.batchOp.previewScopeLayerAll'),
    previewLayerLabel: t(normalizedLocale, 'msg.batchOp.previewLayerLabel'),
    previewLayerAria: t(normalizedLocale, 'msg.batchOp.previewLayerAria'),
    previewCurrentLayer: t(normalizedLocale, 'msg.batchOp.previewCurrentLayer'),
    layerAllHint: (count) => tf(normalizedLocale, 'msg.batchOp.layerAllHint', { count }),
    rowPreviewTitle: t(normalizedLocale, 'msg.batchOp.rowPreviewTitle'),
    passCount: (count) => tf(normalizedLocale, 'msg.batchOp.passCount', { count }),
    warnCount: (count) => tf(normalizedLocale, 'msg.batchOp.warnCount', { count }),
    blockCount: (count) => tf(normalizedLocale, 'msg.batchOp.blockCount', { count }),
    showAll: t(normalizedLocale, 'msg.batchOp.showAll'),
    showConflictsOnly: t(normalizedLocale, 'msg.batchOp.showConflictsOnly'),
    tableSegmentId: t(normalizedLocale, 'msg.batchOp.tableSegmentId'),
    tableSegmentText: t(normalizedLocale, 'msg.batchOp.tableSegmentText'),
    tableOriginal: t(normalizedLocale, 'msg.batchOp.tableOriginal'),
    tableNext: t(normalizedLocale, 'msg.batchOp.tableNext'),
    tableDetail: t(normalizedLocale, 'msg.batchOp.tableDetail'),
    tableConflict: t(normalizedLocale, 'msg.batchOp.tableConflict'),
    tableJump: t(normalizedLocale, 'msg.batchOp.tableJump'),
    jump: t(normalizedLocale, 'msg.batchOp.jump'),
    noRows: t(normalizedLocale, 'msg.batchOp.noRows'),
    tabOffset: t(normalizedLocale, 'msg.batchOp.tabOffset'),
    tabScale: t(normalizedLocale, 'msg.batchOp.tabScale'),
    tabSplit: t(normalizedLocale, 'msg.batchOp.tabSplit'),
    tabMerge: t(normalizedLocale, 'msg.batchOp.tabMerge'),
    offsetSeconds: t(normalizedLocale, 'msg.batchOp.offsetSeconds'),
    runOffset: t(normalizedLocale, 'msg.batchOp.runOffset'),
    scaleFactor: t(normalizedLocale, 'msg.batchOp.scaleFactor'),
    anchorTime: t(normalizedLocale, 'msg.batchOp.anchorTime'),
    anchorPlaceholder: t(normalizedLocale, 'msg.batchOp.anchorPlaceholder'),
    runScale: t(normalizedLocale, 'msg.batchOp.runScale'),
    regexPattern: t(normalizedLocale, 'msg.batchOp.regexPattern'),
    regexFlags: t(normalizedLocale, 'msg.batchOp.regexFlags'),
    runSplit: t(normalizedLocale, 'msg.batchOp.runSplit'),
    mergeHint: t(normalizedLocale, 'msg.batchOp.mergeHint'),
    runMerge: t(normalizedLocale, 'msg.batchOp.runMerge'),
    shortcutHint: t(normalizedLocale, 'msg.batchOp.shortcutHint'),
  };
}
