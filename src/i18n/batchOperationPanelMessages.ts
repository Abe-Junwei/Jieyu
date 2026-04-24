import { normalizeLocale, type Locale } from './index';

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

const zhCN: BatchOperationPanelMessages = {
  overlapAdjacent: '\u4e0e\u76f8\u90bb\u53e5\u6bb5\u91cd\u53e0',
  previewNoSelection: '\u672a\u9009\u62e9\u53e5\u6bb5\uff0c\u65e0\u6cd5\u9884\u89c8\u3002',
  invalidOffsetNumber: '\u504f\u79fb\u79d2\u6570\u4e0d\u662f\u6709\u6548\u6570\u5b57\u3002',
  offsetDetail: (delta) => `\u504f\u79fb ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}s`,
  conflictNegativeTime: '\u51fa\u73b0\u8d1f\u65f6\u95f4',
  conflictDurationTooShort: '\u53e5\u6bb5\u65f6\u957f\u8fc7\u77ed',
  conflictNone: '\u65e0',
  globalBlocking: '\u5b58\u5728\u963b\u65ad\u51b2\u7a81\uff0c\u6267\u884c\u4f1a\u5931\u8d25\u3002',
  globalPreviewPass: '\u9884\u89c8\u901a\u8fc7\uff0c\u53ef\u6267\u884c\u3002',
  invalidScaleFactor: '\u7f29\u653e\u7cfb\u6570\u5fc5\u987b\u5927\u4e8e 0\u3002',
  invalidAnchorTime: '\u951a\u70b9\u65f6\u95f4\u4e0d\u662f\u6709\u6548\u6570\u5b57\u3002',
  scaleDetail: (factor, pivot) => `\u7cfb\u6570 x${factor.toFixed(3)}\uff0c\u951a\u70b9 ${pivot.toFixed(3)}s`,
  regexRequired: '\u6b63\u5219\u8868\u8fbe\u5f0f\u4e0d\u80fd\u4e3a\u7a7a\u3002',
  regexInvalid: '\u6b63\u5219\u8868\u8fbe\u5f0f\u65e0\u6548\u3002',
  sourceTextEmpty: '\u539f\u6587\u672c\u4e3a\u7a7a',
  skipped: '\u4f1a\u88ab\u8df3\u8fc7',
  matchedSegments: (count) => `\u5339\u914d\u540e\u4ec5 ${count} \u6bb5`,
  segmentedTooShort: (count) => `${count} \u6bb5\uff0c\u4f46\u5206\u7247\u8fc7\u77ed`,
  totalSegments: (count) => ` ... \u5171 ${count} \u6bb5`,
  textDetail: (textHint, hasMore) => `\u6587\u672c: ${textHint}${hasMore ? ' ...' : ''}`,
  splitPreviewReady: '\u5df2\u751f\u6210\u62c6\u5206\u9884\u89c8\u3002',
  splitPreviewEmpty: '\u6ca1\u6709\u53ef\u62c6\u5206\u6761\u76ee\u3002',
  needAtLeastTwo: '\u81f3\u5c11\u9009\u4e2d 2 \u6761',
  insufficientCount: '\u6570\u91cf\u4e0d\u8db3',
  keepAndExtend: '\u4fdd\u7559\u5e76\u6269\u5c55\u5230\u9009\u533a\u672b\u5c3e',
  mergeInto: (id) => `\u5e76\u5165 ${id}`,
  mergeDeleteAndMove: '\u8be5\u53e5\u6bb5\u4f1a\u88ab\u5220\u9664\u5e76\u8fc1\u79fb\u8bd1\u6587',
  mergeConditionNotMet: '\u5408\u5e76\u6761\u4ef6\u4e0d\u6ee1\u8db3\u3002',
  panelTitle: '\u6279\u91cf\u53e5\u6bb5\u64cd\u4f5c',
  resetLayout: '\u91cd\u7f6e\u4f4d\u7f6e\u4e0e\u5c3a\u5bf8',
  close: '\u5173\u95ed',
  selectedCount: (count) => `\u5f53\u524d\u9009\u4e2d\uff1a${count} \u4e2a\u53e5\u6bb5`,
  previewScopeLabel: '\u9884\u89c8\u8303\u56f4',
  previewScopeAria: '\u9884\u89c8\u8303\u56f4',
  previewScopeSelected: '\u4ec5\u5df2\u9009\u53e5\u6bb5',
  previewScopeLayerAll: '\u7279\u5b9a\u5c42\u5168\u90e8\u53e5\u6bb5',
  previewLayerLabel: '\u9884\u89c8\u5c42',
  previewLayerAria: '\u9884\u89c8\u5c42',
  previewCurrentLayer: '\u5f53\u524d\u5c42',
  layerAllHint: (count) => `\u5df2\u5207\u6362\u4e3a\u5c42\u7ea7\u5168\u91cf\u9884\u89c8\uff08${count} \u6761\uff09\u3002\u6267\u884c\u4ecd\u53ea\u4f5c\u7528\u4e8e\u5f53\u524d\u9009\u4e2d\u53e5\u6bb5\u3002`,
  rowPreviewTitle: '\u9010\u6761\u9884\u89c8',
  passCount: (count) => `\u901a\u8fc7 ${count}`,
  warnCount: (count) => `\u8b66\u544a ${count}`,
  blockCount: (count) => `\u963b\u65ad ${count}`,
  showAll: '\u663e\u793a\u5168\u90e8',
  showConflictsOnly: '\u53ea\u770b\u51b2\u7a81',
  tableSegmentId: '\u53e5\u6bb5 ID',
  tableSegmentText: '\u53e5\u6bb5\u5185\u5bb9',
  tableOriginal: '\u539f\u503c',
  tableNext: '\u65b0\u503c',
  tableDetail: '\u8bf4\u660e',
  tableConflict: '\u51b2\u7a81\u6807\u8bb0',
  tableJump: '\u8df3\u8f6c',
  jump: '\u8df3\u8f6c',
  noRows: '\u6682\u65e0\u53ef\u5c55\u793a\u7684\u9884\u89c8\u884c',
  tabOffset: '\u65f6\u95f4\u504f\u79fb',
  tabScale: '\u65f6\u95f4\u7f29\u653e',
  tabSplit: '\u6b63\u5219\u62c6\u5206',
  tabMerge: '\u6279\u91cf\u5408\u5e76',
  offsetSeconds: '\u504f\u79fb\u79d2\u6570\uff08\u53ef\u8d1f\u6570\uff09',
  runOffset: '\u6267\u884c\u504f\u79fb',
  scaleFactor: '\u7f29\u653e\u7cfb\u6570\uff08> 0\uff09',
  anchorTime: '\u951a\u70b9\u65f6\u95f4\uff08\u53ef\u9009\uff0c\u79d2\uff09',
  anchorPlaceholder: '\u9ed8\u8ba4\u53d6\u7b2c\u4e00\u4e2a\u9009\u4e2d\u53e5\u6bb5\u8d77\u70b9',
  runScale: '\u6267\u884c\u7f29\u653e',
  regexPattern: '\u6b63\u5219\u8868\u8fbe\u5f0f',
  regexFlags: 'Flags\uff08\u53ef\u9009\uff0c\u5982 i\uff09',
  runSplit: '\u6267\u884c\u62c6\u5206',
  mergeHint: '\u5c06\u9009\u4e2d\u53e5\u6bb5\u6309\u65f6\u95f4\u987a\u5e8f\u5408\u5e76\u4e3a\u4e00\u4e2a\u53e5\u6bb5\uff08\u5141\u8bb8\u975e\u8fde\u7eed\u9009\u62e9\uff09\u3002',
  runMerge: '\u6267\u884c\u5408\u5e76',
  shortcutHint: '\u5feb\u6377\u952e\uff1aCmd/Ctrl + Shift + B \u6253\u5f00\u6b64\u9762\u677f',
};

const enUS: BatchOperationPanelMessages = {
  overlapAdjacent: 'Overlaps adjacent segment',
  previewNoSelection: 'No segment selected; preview is unavailable.',
  invalidOffsetNumber: 'Offset seconds is not a valid number.',
  offsetDetail: (delta) => `Offset ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}s`,
  conflictNegativeTime: 'Negative time generated',
  conflictDurationTooShort: 'Segment duration is too short',
  conflictNone: 'None',
  globalBlocking: 'Blocking conflicts detected; execution will fail.',
  globalPreviewPass: 'Preview passed, ready to execute.',
  invalidScaleFactor: 'Scale factor must be greater than 0.',
  invalidAnchorTime: 'Anchor time is not a valid number.',
  scaleDetail: (factor, pivot) => `Factor x${factor.toFixed(3)}, anchor ${pivot.toFixed(3)}s`,
  regexRequired: 'Regex pattern cannot be empty.',
  regexInvalid: 'Regex pattern is invalid.',
  sourceTextEmpty: 'Source text is empty',
  skipped: 'Will be skipped',
  matchedSegments: (count) => `Only ${count} segment(s) after split`,
  segmentedTooShort: (count) => `${count} segments, but fragments are too short`,
  totalSegments: (count) => ` ... total ${count} segments`,
  textDetail: (textHint, hasMore) => `Text: ${textHint}${hasMore ? ' ...' : ''}`,
  splitPreviewReady: 'Split preview generated.',
  splitPreviewEmpty: 'No splittable entries.',
  needAtLeastTwo: 'Select at least 2 segments',
  insufficientCount: 'Insufficient count',
  keepAndExtend: 'Keep and extend to end of selection',
  mergeInto: (id) => `Merge into ${id}`,
  mergeDeleteAndMove: 'This segment will be deleted and translation moved',
  mergeConditionNotMet: 'Merge conditions are not met.',
  panelTitle: 'Batch Segment Operations',
  resetLayout: 'Reset position and size',
  close: 'Close',
  selectedCount: (count) => `Selected: ${count} segment(s)`,
  previewScopeLabel: 'Preview scope',
  previewScopeAria: 'Preview scope',
  previewScopeSelected: 'Selected segments only',
  previewScopeLayerAll: 'All segments in target layer',
  previewLayerLabel: 'Preview layer',
  previewLayerAria: 'Preview layer',
  previewCurrentLayer: 'Current layer',
  layerAllHint: (count) => `Switched to full-layer preview (${count} entries). Execution still applies only to selected segments.`,
  rowPreviewTitle: 'Row preview',
  passCount: (count) => `Pass ${count}`,
  warnCount: (count) => `Warn ${count}`,
  blockCount: (count) => `Block ${count}`,
  showAll: 'Show all',
  showConflictsOnly: 'Conflicts only',
  tableSegmentId: 'Segment ID',
  tableSegmentText: 'Segment text',
  tableOriginal: 'Original',
  tableNext: 'New',
  tableDetail: 'Detail',
  tableConflict: 'Conflict',
  tableJump: 'Jump',
  jump: 'Jump',
  noRows: 'No preview rows to display',
  tabOffset: 'Time offset',
  tabScale: 'Time scale',
  tabSplit: 'Regex split',
  tabMerge: 'Batch merge',
  offsetSeconds: 'Offset seconds (negative allowed)',
  runOffset: 'Apply offset',
  scaleFactor: 'Scale factor (> 0)',
  anchorTime: 'Anchor time (optional, sec)',
  anchorPlaceholder: 'Default: first selected segment start',
  runScale: 'Apply scale',
  regexPattern: 'Regex pattern',
  regexFlags: 'Flags (optional, e.g. i)',
  runSplit: 'Run split',
  mergeHint: 'Merge selected segments in timeline order into one segment (non-contiguous selection allowed).',
  runMerge: 'Run merge',
  shortcutHint: 'Shortcut: Cmd/Ctrl + Shift + B to open this panel',
};

export function getBatchOperationPanelMessages(locale: Locale): BatchOperationPanelMessages {
  return normalizeLocale(locale) === 'zh-CN' ? zhCN : enUS;
}
