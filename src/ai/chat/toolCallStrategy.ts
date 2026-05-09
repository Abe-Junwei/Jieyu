/**
 * toolCallStrategy — Tool strategy registry and configuration
 * Extracted from toolCallHelpers.ts
 */

import type { AiChatToolName, AiPromptContext } from './chatDomain.types';
import { getAiToolSegmentExecutionToolNames } from '../policy/aiToolPolicyMatrix';
import {
  describeDeleteSegmentSelectorTarget,
  getDeleteTargetIds,
  getFirstNonEmptyString,
  getNormalizedIdList,
  hasDeleteAllSegmentsScope,
  validateArgId,
  validateArgLayerCreate,
  validateArgNumeric,
  validateArgText,
  validateDeleteLayerArgs,
  validateDeleteSegmentArgs,
  validateLinkLayerArgs,
  validateOptionalSegmentTargetArgs,
  validateSegmentTargetArgs,
  validateSplitSegmentArgs,
} from './toolCallValidation';

export interface ToolContextFillSpec {
  unitId?: boolean;
  translationLayerId?: boolean;
  linkBothLayers?: boolean;
  layerTargetInference?: boolean;
}

export interface ToolStrategy {
  label: string;
  contextFill?: ToolContextFillSpec;
  validateArgs?: (args: Record<string, unknown>) => string | null;
  riskSpec?: {
    summary: (args: Record<string, unknown>) => string;
    preview: string[];
  };
}

export const SEGMENT_SELECTION_COMPATIBLE_TOOLS: ReadonlySet<AiChatToolName> = new Set([
  ...getAiToolSegmentExecutionToolNames(),
  'merge_prev',
  'merge_next',
]);

export function toolSupportsSegmentSelectionTarget(callName: AiChatToolName): boolean {
  return SEGMENT_SELECTION_COMPATIBLE_TOOLS.has(callName);
}

export function resolveSelectionTargetPatchForTool(
  callName: AiChatToolName,
  context: AiPromptContext | null | undefined,
): Record<string, string> | null {
  const short = context?.shortTerm;
  const activeUnitId = getFirstNonEmptyString(short?.activeUnitId);
  const activeSegmentUnitId = getFirstNonEmptyString(short?.activeSegmentUnitId);
  const selectedUnitKind = short?.selectedUnitKind;

  if (toolSupportsSegmentSelectionTarget(callName)) {
    if (
      (selectedUnitKind === 'segment' || activeSegmentUnitId.length > 0) &&
      activeSegmentUnitId.length > 0
    ) {
      return { segmentId: activeSegmentUnitId };
    }
    return null;
  }
  if (activeUnitId.length > 0) {
    return { unitId: activeUnitId };
  }
  return null;
}

export const TOOL_STRATEGY_TABLE: Record<AiChatToolName, ToolStrategy> = {
  create_transcription_segment: {
    label: '\\u521b\\u5efa\\u53e5\\u6bb5',
    contextFill: { unitId: true },
    validateArgs: validateSegmentTargetArgs,
  },
  split_transcription_segment: {
    label: '\\u5207\\u5206\\u53e5\\u6bb5',
    contextFill: { unitId: true },
    validateArgs: (args) => validateSegmentTargetArgs(args) ?? validateSplitSegmentArgs(args),
  },
  merge_transcription_segments: {
    label: '\\u5408\\u5e76\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: (args) => {
      const segmentIds = getNormalizedIdList(args.segmentIds);
      return segmentIds.length >= 2
        ? null
        : '\\u7f3a\\u5c11\\u81f3\\u5c11 2 \\u4e2a\\u76ee\\u6807\\u53e5\\u6bb5';
    },
  },
  delete_transcription_segment: {
    label: '\\u5220\\u9664\\u53e5\\u6bb5',
    contextFill: { unitId: true },
    validateArgs: validateDeleteSegmentArgs,
    riskSpec: {
      summary: (args) => {
        if (hasDeleteAllSegmentsScope(args)) {
          return '\\u5c06\\u5220\\u9664\\u5f53\\u524d\\u9875\\u9762\\u7684\\u5168\\u90e8\\u53e5\\u6bb5';
        }
        const selectorTarget = describeDeleteSegmentSelectorTarget(args);
        if (selectorTarget) {
          return `\\u5c06\\u5220\\u9664 1 \\u6761\\u53e5\\u6bb5（\\u76ee\\u6807：${selectorTarget}）`;
        }
        const targetIds = getDeleteTargetIds(args);
        const targetCount = Math.max(1, targetIds.length);
        const target = targetIds[0] ?? 'current-segment';
        return targetCount > 1
          ? `\\u5c06\\u5220\\u9664 ${targetCount} \\u6761\\u53e5\\u6bb5`
          : `\\u5c06\\u5220\\u9664 1 \\u6761\\u53e5\\u6bb5（\\u76ee\\u6807：${target}）`;
      },
      preview: [
        '\\u8be5\\u53e5\\u6bb5\\u7684\\u65f6\\u95f4\\u8303\\u56f4\\u4e0e\\u8f6c\\u5199\\u6587\\u672c\\u4f1a\\u88ab\\u6e05\\u9664',
        '\\u53ef\\u901a\\u8fc7\\u64a4\\u9500（Undo）\\u6062\\u590d',
        '\\u5173\\u8054\\u7ffb\\u8bd1\\u53ef\\u80fd\\u53d8\\u4e3a\\u7a7a\\u5f15\\u7528',
      ],
    },
  },
  clear_translation_segment: {
    label: '\\u6e05\\u7a7a\\u7ffb\\u8bd1',
    contextFill: { unitId: true, translationLayerId: true },
    validateArgs: (args) => validateSegmentTargetArgs(args) ?? validateArgId(args, 'layerId', true),
  },
  set_transcription_text: {
    label: '\\u5199\\u5165\\u8f6c\\u5199',
    contextFill: { unitId: true },
    validateArgs: (args) => validateArgText(args) ?? validateSegmentTargetArgs(args),
  },
  set_translation_text: {
    label: '\\u5199\\u5165\\u7ffb\\u8bd1',
    contextFill: { unitId: true, translationLayerId: true },
    validateArgs: (args) =>
      validateArgText(args) ??
      validateSegmentTargetArgs(args) ??
      validateArgId(args, 'layerId', true),
  },
  create_transcription_layer: {
    label: '\\u521b\\u5efa\\u8f6c\\u5199\\u5c42',
    validateArgs: (args) => validateArgLayerCreate(args, false),
  },
  create_translation_layer: {
    label: '\\u521b\\u5efa\\u7ffb\\u8bd1\\u5c42',
    validateArgs: (args) => validateArgLayerCreate(args, true),
  },
  delete_layer: {
    label: '\\u5220\\u9664\\u5c42',
    contextFill: { layerTargetInference: true },
    validateArgs: validateDeleteLayerArgs,
    riskSpec: {
      summary: (args) => {
        const layerId = typeof args.layerId === 'string' ? args.layerId.trim() : '';
        const layerType = typeof args.layerType === 'string' ? args.layerType.trim() : '';
        const languageQuery =
          typeof args.languageQuery === 'string' ? args.languageQuery.trim() : '';
        const typeLabel =
          layerType === 'transcription'
            ? '\\u8f6c\\u5199\\u5c42'
            : layerType === 'translation'
              ? '\\u7ffb\\u8bd1\\u5c42'
              : '\\u5c42';
        if (languageQuery) {
          return `\\u5c06\\u5220\\u9664\\u6574\\u5c42\\u6570\\u636e（\\u76ee\\u6807：${languageQuery}${typeLabel}${layerId ? `，ID：${layerId}` : ''}）`;
        }
        const layerLabel = layerId || 'current-layer';
        return `\\u5c06\\u5220\\u9664\\u6574\\u5c42\\u6570\\u636e（\\u76ee\\u6807\\u5c42：${layerLabel}）`;
      },
      preview: [
        '\\u8be5\\u5c42\\u4e0b\\u7684\\u6587\\u672c\\u4f1a\\u88ab\\u4e00\\u5e76\\u79fb\\u9664',
        '\\u53ef\\u901a\\u8fc7\\u64a4\\u9500（Undo）\\u6062\\u590d',
        '\\u4e0e\\u8be5\\u5c42\\u76f8\\u5173\\u7684\\u94fe\\u63a5/\\u5bf9\\u9f50\\u5173\\u7cfb\\u53ef\\u80fd\\u5931\\u6548',
      ],
    },
  },
  link_translation_layer: {
    label: '\\u5173\\u8054\\u7ffb\\u8bd1\\u5c42',
    contextFill: { linkBothLayers: true },
    validateArgs: validateLinkLayerArgs,
  },
  unlink_translation_layer: {
    label: '\\u89e3\\u9664\\u7ffb\\u8bd1\\u5c42\\u5173\\u8054',
    contextFill: { linkBothLayers: true },
    validateArgs: validateLinkLayerArgs,
  },
  add_host: {
    label: 'add_host',
    contextFill: { linkBothLayers: true },
    validateArgs: validateLinkLayerArgs,
  },
  remove_host: {
    label: 'remove_host',
    contextFill: { linkBothLayers: true },
    validateArgs: validateLinkLayerArgs,
  },
  switch_preferred_host: {
    label: 'switch_preferred_host',
    contextFill: { linkBothLayers: true },
    validateArgs: validateLinkLayerArgs,
  },
  auto_gloss_unit: {
    label: '\\u81ea\\u52a8\\u8bcd\\u6c47\\u6807\\u6ce8',
    contextFill: { unitId: true },
    validateArgs: validateSegmentTargetArgs,
  },
  set_token_pos: {
    label: '\\u8bbe\\u7f6e\\u8bcd\\u6027',
    contextFill: { unitId: true },
    validateArgs: (args) => validateArgId(args, 'unitId', false),
  },
  set_token_gloss: {
    label: '\\u8bbe\\u7f6e\\u8bcd\\u6c47\\u6807\\u6ce8',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'tokenId', true),
  },
  propose_changes: {
    label: '\\u9884\\u89c8 AI \\u53d8\\u66f4',
    contextFill: {},
    validateArgs: () => null,
    riskSpec: {
      summary: (args) => {
        const raw = args.changes;
        const n = Array.isArray(raw) ? raw.length : 0;
        return n > 0
          ? `\\u5c06\\u5e94\\u7528 ${n} \\u9879\\u7ed3\\u6784\\u5316\\u53d8\\u66f4\\uff08\\u9700\\u786e\\u8ba4\\uff09`
          : '\\u5c06\\u5e94\\u7528\\u6279\\u91cf\\u7ed3\\u6784\\u5316\\u53d8\\u66f4\\uff08\\u9700\\u786e\\u8ba4\\uff09';
      },
      preview: [
        '\\u786e\\u8ba4\\u540e\\u4f1a\\u6309\\u5e8f\\u6267\\u884c\\u5b50\\u5de5\\u5177\\u8c03\\u7528',
        '\\u6bcf\\u4e2a\\u5b50\\u64cd\\u4f5c\\u901a\\u5e38\\u4f1a\\u4ea7\\u751f\\u72ec\\u7acb\\u64a4\\u9500\\u70b9',
        '\\u82e5\\u65f6\\u8f74/\\u9009\\u533a\\u5df2\\u53d8\\uff0c\\u95e8\\u63a7\\u53ef\\u80fd\\u963b\\u6b62\\u786e\\u8ba4',
      ],
    },
  },
  play_pause: { label: '\\u64ad\\u653e/\\u6682\\u505c', contextFill: {}, validateArgs: () => null },
  undo: { label: '\\u64a4\\u9500', contextFill: {}, validateArgs: () => null },
  redo: { label: '\\u91cd\\u505a', contextFill: {}, validateArgs: () => null },
  search_segments: {
    label: '\\u641c\\u7d22\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: (args) => validateArgText({ text: args.query }),
  },
  toggle_notes: {
    label: '\\u5207\\u6362\\u5907\\u6ce8',
    contextFill: {},
    validateArgs: () => null,
  },
  mark_segment: {
    label: '\\u6807\\u8bb0\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: () => null,
  },
  delete_segment: {
    label: '\\u5220\\u9664\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: () => null,
  },
  auto_gloss_segment: {
    label: '\\u81ea\\u52a8\\u6807\\u6ce8',
    contextFill: { unitId: true },
    validateArgs: (args) =>
      validateArgId(args, 'segmentId', false) ?? validateArgId(args, 'unitId', false),
  },
  nav_to_segment: {
    label: '\\u5bfc\\u822a\\u5230\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: (args) => validateArgNumeric(args, 'segmentIndex', true),
  },
  nav_to_time: {
    label: '\\u5bfc\\u822a\\u5230\\u65f6\\u95f4',
    contextFill: {},
    validateArgs: (args) => validateArgNumeric(args, 'timeSeconds', true),
  },
  focus_segment: {
    label: '\\u805a\\u7126\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'segmentId', true),
  },
  zoom_to_segment: {
    label: '\\u7f29\\u653e\\u81f3\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'segmentId', true),
  },
  split_at_time: {
    label: '\\u65f6\\u95f4\\u70b9\\u5206\\u5272',
    contextFill: {},
    validateArgs: (args) => validateArgNumeric(args, 'timeSeconds', true),
  },
  merge_prev: {
    label: '\\u5408\\u5e76\\u4e0a\\u4e00\\u4e2a',
    contextFill: { unitId: true },
    validateArgs: validateOptionalSegmentTargetArgs,
  },
  merge_next: {
    label: '\\u5408\\u5e76\\u4e0b\\u4e00\\u4e2a',
    contextFill: { unitId: true },
    validateArgs: validateOptionalSegmentTargetArgs,
  },
  get_current_segment: {
    label: '\\u83b7\\u53d6\\u5f53\\u524d\\u53e5\\u6bb5',
    contextFill: {},
    validateArgs: () => null,
  },
  get_project_summary: {
    label: '\\u83b7\\u53d6\\u9879\\u76ee\\u6458\\u8981',
    contextFill: {},
    validateArgs: () => null,
  },
  get_recent_history: {
    label: '\\u83b7\\u53d6\\u6700\\u8fd1\\u5386\\u53f2',
    contextFill: {},
    validateArgs: () => null,
  },
};
