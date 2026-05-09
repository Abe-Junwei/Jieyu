/**
 * toolCallPlanner — Tool call target resolution and clarification planning
 * Extracted from toolCallHelpers.ts
 */

import type {
  AiChatToolCall,
  AiChatToolName,
  AiClarifyCandidate,
  AiPromptContext,
  AiSessionMemory,
} from './chatDomain.types';
import type { ToolPlannerClarifyReason, ToolPlannerResult } from './toolCallHelpers.types';
import { extractSegmentSelectorFromUserText } from './segmentTextParsers';
import {
  getFirstNonEmptyString,
  getNormalizedIdList,
  hasDeleteAllSegmentsScope,
  getDeleteTargetIds,
  hasSegmentSelector,
  segmentSelectorNeedsAnchor,
  isAmbiguousLanguageTarget,
  requiresConcreteLanguageTarget,
} from './toolCallValidation';
import { resolveLanguageQuery } from '../../utils/langMapping';
import { decodeEscapedUnicode, escapedUnicodeRegExp } from '../../utils/decodeEscapedUnicode';
import { getAiToolPolicy } from '../policy/aiToolPolicyMatrix';
import {
  TOOL_STRATEGY_TABLE,
  toolSupportsSegmentSelectionTarget,
  resolveSelectionTargetPatchForTool,
} from './toolCallStrategy';

export function planToolCallTargets(
  call: AiChatToolCall,
  userText: string,
  context: AiPromptContext | null | undefined,
): ToolPlannerResult {
  const shortTerm = context?.shortTerm;
  const currentUnitId = getFirstNonEmptyString(shortTerm?.activeUnitId);
  const currentSegmentId = getFirstNonEmptyString(shortTerm?.activeSegmentUnitId);
  const selectedUnitIds = getNormalizedIdList(shortTerm?.selectedUnitIds);
  const currentAudioTimeSec =
    typeof shortTerm?.audioTimeSec === 'number' && Number.isFinite(shortTerm.audioTimeSec)
      ? shortTerm.audioTimeSec
      : undefined;
  const selectedLayerId = getFirstNonEmptyString(shortTerm?.selectedLayerId);
  const selectedLayerType = shortTerm?.selectedLayerType;
  const selectedTranslationLayerId = getFirstNonEmptyString(
    shortTerm?.selectedTranslationLayerId,
    selectedLayerType === 'translation' ? selectedLayerId : '',
  );
  const selectedTranscriptionLayerId = getFirstNonEmptyString(
    shortTerm?.selectedTranscriptionLayerId,
    selectedLayerType === 'transcription' ? selectedLayerId : '',
  );

  const nextCall: AiChatToolCall = {
    ...call,
    arguments: { ...call.arguments },
  };
  if (toolSupportsSegmentSelectionTarget(call.name)) {
    delete nextCall.arguments.unitId;
  }
  if (
    call.name === 'merge_transcription_segments' ||
    call.name === 'delete_transcription_segment'
  ) {
    delete nextCall.arguments.unitIds;
  }
  const parsedSegmentSelector = extractSegmentSelectorFromUserText(userText);
  const activeSelectionTargetPatch = resolveSelectionTargetPatchForTool(call.name, context);

  const ensureUnitId = (): string => {
    const existingSegmentId = getFirstNonEmptyString(nextCall.arguments.segmentId);
    if (existingSegmentId) {
      return existingSegmentId;
    }
    const existing = getFirstNonEmptyString(nextCall.arguments.unitId);
    if (existing) {
      if (currentUnitId && existing !== currentUnitId) {
        nextCall.arguments.unitId = currentUnitId;
        if (call.name === 'auto_gloss_segment') {
          nextCall.arguments.segmentId = currentUnitId;
        }
        return currentUnitId;
      }
      return existing;
    }
    if (currentUnitId) {
      nextCall.arguments.unitId = currentUnitId;
      if (call.name === 'auto_gloss_segment') {
        nextCall.arguments.segmentId = currentUnitId;
      }
      return currentUnitId;
    }
    return '';
  };

  const ensureSegmentScopedTarget = (): string => {
    const segmentId = getFirstNonEmptyString(activeSelectionTargetPatch?.segmentId);
    if (!segmentId) {
      return '';
    }
    const existingSegmentId = getFirstNonEmptyString(nextCall.arguments.segmentId);
    if (existingSegmentId === segmentId) {
      return existingSegmentId;
    }
    nextCall.arguments.segmentId = segmentId;
    delete nextCall.arguments.unitId;
    return segmentId;
  };

  const cf = TOOL_STRATEGY_TABLE[call.name]?.contextFill;

  if (requiresConcreteLanguageTarget(call.name)) {
    if (
      isAmbiguousLanguageTarget(nextCall.arguments.languageId) &&
      isAmbiguousLanguageTarget(nextCall.arguments.languageQuery)
    ) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-language-target' };
    }
  }

  if (call.name === 'delete_transcription_segment') {
    const hasExplicitDeleteTarget =
      getDeleteTargetIds(nextCall.arguments).length > 0 || hasSegmentSelector(nextCall.arguments);
    if (
      hasSegmentSelector(nextCall.arguments) &&
      segmentSelectorNeedsAnchor(nextCall.arguments) &&
      !currentUnitId &&
      !currentSegmentId
    ) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
    }
    const refersAllSelectedSegments =
      /(\u6240\u6709|\u5168\u90e8|\u5168\u4f53|all)/i.test(userText) &&
      /(\u53e5\u6bb5|\u5206\u6bb5|segment)/i.test(userText);

    if (!hasExplicitDeleteTarget && !hasDeleteAllSegmentsScope(nextCall.arguments)) {
      if (refersAllSelectedSegments && selectedUnitIds.length > 1) {
        nextCall.arguments.segmentIds = selectedUnitIds;
      } else if (refersAllSelectedSegments) {
        nextCall.arguments.allSegments = true;
      } else if (parsedSegmentSelector) {
        Object.assign(nextCall.arguments, parsedSegmentSelector);
        if (segmentSelectorNeedsAnchor(nextCall.arguments) && !currentUnitId && !currentSegmentId) {
          return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
        }
      } else {
        const selectedTargetPatch = resolveSelectionTargetPatchForTool(call.name, context);
        if (selectedTargetPatch?.segmentId) {
          nextCall.arguments.segmentId = selectedTargetPatch.segmentId;
        }
        const segmentId = ensureSegmentScopedTarget();
        if (!getFirstNonEmptyString(nextCall.arguments.segmentId) && !segmentId) {
          return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
        }
      }
    }

    if (
      !hasDeleteAllSegmentsScope(nextCall.arguments) &&
      getDeleteTargetIds(nextCall.arguments).length === 0 &&
      !hasSegmentSelector(nextCall.arguments)
    ) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
    }
  }

  if (call.name === 'merge_transcription_segments') {
    if (selectedUnitIds.length > 1) {
      nextCall.arguments.segmentIds = selectedUnitIds;
    }
    const hasBatchTarget = getNormalizedIdList(nextCall.arguments.segmentIds).length >= 2;
    if (!hasBatchTarget) {
      if (selectedUnitIds.length > 1) {
        nextCall.arguments.segmentIds = selectedUnitIds;
      } else {
        return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
      }
    }
  }

  if (call.name === 'merge_prev' || call.name === 'merge_next') {
    delete nextCall.arguments.segmentIndex;
    delete nextCall.arguments.segmentPosition;
    const segmentId = ensureSegmentScopedTarget();
    if (!segmentId) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
    }
  }

  if (
    cf?.unitId &&
    call.name !== 'delete_transcription_segment' &&
    call.name !== 'merge_prev' &&
    call.name !== 'merge_next'
  ) {
    if (
      !getFirstNonEmptyString(nextCall.arguments.segmentId, nextCall.arguments.unitId) &&
      !hasSegmentSelector(nextCall.arguments) &&
      parsedSegmentSelector
    ) {
      Object.assign(nextCall.arguments, parsedSegmentSelector);
      if (segmentSelectorNeedsAnchor(nextCall.arguments) && !currentUnitId && !currentSegmentId) {
        return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
      }
    }
    if (!hasSegmentSelector(nextCall.arguments)) {
      const segmentId = ensureSegmentScopedTarget();
      if (toolSupportsSegmentSelectionTarget(call.name)) {
        if (!segmentId) {
          return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
        }
      } else if (!segmentId) {
        const unitId = ensureUnitId();
        if (!unitId) {
          return { decision: 'clarify', call: nextCall, reason: 'missing-unit-target' };
        }
      }
    }
  }

  if (call.name === 'split_transcription_segment') {
    const rawSplitTime = nextCall.arguments.splitTime;
    const splitTime =
      typeof rawSplitTime === 'number' && Number.isFinite(rawSplitTime)
        ? rawSplitTime
        : currentAudioTimeSec;

    if (!(typeof splitTime === 'number' && Number.isFinite(splitTime))) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-split-position' };
    }

    nextCall.arguments.splitTime = splitTime;
  }

  if (cf?.translationLayerId) {
    const layerId = getFirstNonEmptyString(nextCall.arguments.layerId);
    if (layerId) {
      if (selectedTranslationLayerId && layerId !== selectedTranslationLayerId) {
        nextCall.arguments.layerId = selectedTranslationLayerId;
      }
    } else if (selectedTranslationLayerId) {
      nextCall.arguments.layerId = selectedTranslationLayerId;
    }
    if (!getFirstNonEmptyString(nextCall.arguments.layerId)) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-translation-layer-target' };
    }
  }

  if (cf?.linkBothLayers) {
    let transcriptionLayerId = getFirstNonEmptyString(nextCall.arguments.transcriptionLayerId);
    const transcriptionLayerKey = getFirstNonEmptyString(nextCall.arguments.transcriptionLayerKey);
    const refersCurrentLayerPair = escapedUnicodeRegExp(
      '(\\u5f53\\u524d|\\u8fd9\\u5c42|\\u8be5\\u5c42|\\u672c\\u5c42|\\u5f53\\u524d\\u5c42)',
      'i',
    ).test(userText);

    if (
      transcriptionLayerId &&
      selectedTranscriptionLayerId &&
      transcriptionLayerId !== selectedTranscriptionLayerId
    ) {
      nextCall.arguments.transcriptionLayerId = selectedTranscriptionLayerId;
      transcriptionLayerId = selectedTranscriptionLayerId;
    }
    if (
      !transcriptionLayerId &&
      !transcriptionLayerKey &&
      selectedTranscriptionLayerId &&
      refersCurrentLayerPair
    ) {
      nextCall.arguments.transcriptionLayerId = selectedTranscriptionLayerId;
    }

    let translationLayerId = getFirstNonEmptyString(
      nextCall.arguments.translationLayerId,
      nextCall.arguments.layerId,
    );
    if (
      translationLayerId &&
      selectedTranslationLayerId &&
      translationLayerId !== selectedTranslationLayerId
    ) {
      nextCall.arguments.translationLayerId = selectedTranslationLayerId;
      translationLayerId = selectedTranslationLayerId;
    }
    if (!translationLayerId && selectedTranslationLayerId && refersCurrentLayerPair) {
      nextCall.arguments.translationLayerId = selectedTranslationLayerId;
    }

    const hasTranscriptionTarget =
      getFirstNonEmptyString(
        nextCall.arguments.transcriptionLayerId,
        nextCall.arguments.transcriptionLayerKey,
      ).length > 0;
    const hasTranslationTarget =
      getFirstNonEmptyString(nextCall.arguments.translationLayerId, nextCall.arguments.layerId)
        .length > 0;
    if (!hasTranscriptionTarget || !hasTranslationTarget) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-layer-link-target' };
    }
  }

  if (cf?.layerTargetInference) {
    let layerId = getFirstNonEmptyString(nextCall.arguments.layerId);

    if (layerId) {
      const knownIds = [
        selectedLayerId,
        selectedTranscriptionLayerId,
        selectedTranslationLayerId,
      ].filter(Boolean);
      if (!knownIds.includes(layerId)) {
        nextCall.arguments = { ...nextCall.arguments };
        delete nextCall.arguments.layerId;
        layerId = '';
      }
    }

    if (!layerId) {
      const inferred = inferDeleteLayerArgumentsFromText(userText);
      nextCall.arguments = { ...nextCall.arguments, ...inferred };

      const refersCurrentLayer = escapedUnicodeRegExp(
        '(\\u5f53\\u524d|\\u8fd9\\u5c42|\\u8be5\\u5c42|\\u672c\\u5c42).*(\\u5c42)|\\u5220\\u9664\\u5f53\\u524d\\u5c42|\\u5220\\u9664\\u8fd9\\u5c42',
        'i',
      ).test(userText);
      if (refersCurrentLayer && selectedLayerId) {
        nextCall.arguments.layerId = selectedLayerId;
      }

      if (!getFirstNonEmptyString(nextCall.arguments.layerId)) {
        const inferredType = getFirstNonEmptyString(nextCall.arguments.layerType);
        const hasLanguageHint = getFirstNonEmptyString(nextCall.arguments.languageQuery).length > 0;
        if (!hasLanguageHint) {
          if (inferredType === 'transcription' && selectedTranscriptionLayerId) {
            nextCall.arguments.layerId = selectedTranscriptionLayerId;
          } else if (inferredType === 'translation' && selectedTranslationLayerId) {
            nextCall.arguments.layerId = selectedTranslationLayerId;
          }
        }
      }
    }

    const hasLayerId = getFirstNonEmptyString(nextCall.arguments.layerId).length > 0;
    const hasLayerType = getFirstNonEmptyString(nextCall.arguments.layerType).length > 0;
    const hasLanguageQuery = getFirstNonEmptyString(nextCall.arguments.languageQuery).length > 0;
    if (!hasLayerId && !(hasLayerType && hasLanguageQuery)) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-layer-target' };
    }
  }

  return { decision: 'resolved', call: nextCall };
}

export function extractClarifyLanguagePatch(userText: string): Record<string, string> | null {
  const trimmed = userText
    .trim()
    .replace(escapedUnicodeRegExp('[\\u7684\\u90a3\\u4e2a\\u5427]$', 'g'), '')
    .trim();
  if (!trimmed || trimmed.length > 20) return null;
  const resolved = resolveLanguageQuery(trimmed);
  if (!resolved) return null;
  return { languageId: resolved, languageQuery: trimmed };
}

export function extractClarifySplitPositionPatch(
  userText: string,
  context: AiPromptContext | null | undefined,
): Record<string, number | string> | null {
  if (
    !escapedUnicodeRegExp(
      '^(\\u8fd9\\u91cc|\\u6b64\\u5904|\\u5728\\u8fd9\\u91cc|\\u5728\\u6b64\\u5904|\\u5c31\\u8fd9\\u91cc|\\u5c31\\u6b64\\u5904)$',
      'i',
    ).test(userText.trim())
  )
    return null;
  const audioTimeSec = context?.shortTerm?.audioTimeSec;
  if (typeof audioTimeSec !== 'number' || !Number.isFinite(audioTimeSec)) return null;
  const targetPatch = resolveSelectionTargetPatchForTool('split_transcription_segment', context);
  if (!targetPatch) return null;
  return { ...targetPatch, splitTime: audioTimeSec };
}

export function hasResolvableSelectionTargetForTool(
  callName: AiChatToolName,
  context: AiPromptContext | null | undefined,
): boolean {
  const short = context?.shortTerm;
  const selectedUnitIds = getNormalizedIdList(short?.selectedUnitIds);
  const selectedLayerId = getFirstNonEmptyString(short?.selectedLayerId);
  const selectedLayerType = short?.selectedLayerType;
  const selectedTranslationLayerId = getFirstNonEmptyString(
    short?.selectedTranslationLayerId,
    selectedLayerType === 'translation' ? selectedLayerId : '',
  );
  const selectedTranscriptionLayerId = getFirstNonEmptyString(
    short?.selectedTranscriptionLayerId,
    selectedLayerType === 'transcription' ? selectedLayerId : '',
  );
  const selectionTargetPatch = resolveSelectionTargetPatchForTool(callName, context);
  const policy = getAiToolPolicy(callName);

  if (policy.targetKind === 'segment' && policy.requiresExplicitTarget) {
    if (callName === 'merge_transcription_segments') {
      return selectedUnitIds.length > 1;
    }
    if (callName === 'set_translation_text' || callName === 'clear_translation_segment') {
      return selectionTargetPatch !== null && selectedTranslationLayerId.length > 0;
    }
    if (callName === 'delete_transcription_segment' && selectedUnitIds.length > 1) {
      return true;
    }
    return selectionTargetPatch !== null;
  }
  if (policy.targetKind === 'layer' && policy.requiresExplicitTarget) {
    return selectedLayerId.length > 0;
  }
  if (policy.targetKind === 'layer_link' && policy.requiresExplicitTarget) {
    return selectedTranscriptionLayerId.length > 0 && selectedTranslationLayerId.length > 0;
  }
  return false;
}

export function buildClarifyCandidates(
  callName: AiChatToolName,
  reason: ToolPlannerClarifyReason | undefined,
  context: AiPromptContext | null | undefined,
  sessionMemory?: AiSessionMemory,
): AiClarifyCandidate[] {
  const short = context?.shortTerm;
  const selectedLayerId = getFirstNonEmptyString(short?.selectedLayerId);
  const selectedLayerType = short?.selectedLayerType;
  const selectedTranslationLayerId = getFirstNonEmptyString(
    short?.selectedTranslationLayerId,
    selectedLayerType === 'translation' ? selectedLayerId : '',
  );
  const selectedTranscriptionLayerId = getFirstNonEmptyString(
    short?.selectedTranscriptionLayerId,
    selectedLayerType === 'transcription' ? selectedLayerId : '',
  );

  const candidates: AiClarifyCandidate[] = [];
  if (reason === 'missing-unit-target') {
    const selectionTargetPatch = resolveSelectionTargetPatchForTool(callName, context);
    if (selectionTargetPatch?.segmentId) {
      candidates.push({
        key: '1',
        label: `\\u5f53\\u524d\\u9009\\u4e2d\\u53e5\\u6bb5（${selectionTargetPatch.segmentId}）`,
        argsPatch: selectionTargetPatch,
      });
    }
  }
  if (reason === 'missing-layer-target' && selectedLayerId) {
    candidates.push({
      key: '1',
      label: `\\u5f53\\u524d\\u9009\\u4e2d\\u5c42（${selectedLayerId}）`,
      argsPatch: { layerId: selectedLayerId },
    });
  }
  if (reason === 'missing-translation-layer-target' && selectedTranslationLayerId) {
    candidates.push({
      key: '1',
      label: `\\u5f53\\u524d\\u9009\\u4e2d\\u7ffb\\u8bd1\\u5c42（${selectedTranslationLayerId}）`,
      argsPatch: { layerId: selectedTranslationLayerId },
    });
  }
  if (
    reason === 'missing-layer-link-target' &&
    selectedTranscriptionLayerId &&
    selectedTranslationLayerId
  ) {
    candidates.push({
      key: '1',
      label: `\\u5f53\\u524d\\u9009\\u4e2d\\u5c42\\u5bf9（${selectedTranscriptionLayerId} -> ${selectedTranslationLayerId}）`,
      argsPatch: {
        transcriptionLayerId: selectedTranscriptionLayerId,
        translationLayerId: selectedTranslationLayerId,
      },
    });
  }
  if (reason === 'missing-language-target' && callName === 'create_transcription_layer') {
    const lastLang = sessionMemory?.preferences?.lastLanguage ?? sessionMemory?.lastLanguage;
    if (lastLang && lastLang !== 'zho' && lastLang !== 'eng') {
      candidates.push({
        key: `${candidates.length}`,
        label: `\\u4e0a\\u6b21\\u4f7f\\u7528（${lastLang}）`,
        argsPatch: { languageId: lastLang },
      });
    }
    candidates.push({
      key: `${candidates.length}`,
      label: '\\u521b\\u5efa\\u4e2d\\u6587\\u8f6c\\u5199\\u5c42（zho）',
      argsPatch: { languageId: 'zho' },
    });
    candidates.push({
      key: `${candidates.length}`,
      label: '\\u521b\\u5efa\\u82f1\\u6587\\u8f6c\\u5199\\u5c42（eng）',
      argsPatch: { languageId: 'eng' },
    });
  }
  return candidates.map((candidate) => ({
    ...candidate,
    label: decodeEscapedUnicode(candidate.label),
  }));
}

function inferDeleteLayerArgumentsFromText(userText: string): Partial<AiChatToolCall['arguments']> {
  const normalizedText = userText.trim();
  if (!normalizedText) return {};

  let layerType: 'translation' | 'transcription' | undefined;
  if (
    escapedUnicodeRegExp('(\\u7ffb\\u8bd1\\u5c42|\\u8bd1\\u6587\\u5c42)', 'i').test(normalizedText)
  )
    layerType = 'translation';
  if (
    escapedUnicodeRegExp(
      '(\\u8f6c\\u5199\\u5c42|\\u8f6c\\u5f55\\u5c42|\\u542c\\u5199\\u5c42)',
      'i',
    ).test(normalizedText)
  )
    layerType = 'transcription';

  const languageQueryMatch = normalizedText.match(
    escapedUnicodeRegExp(
      '\\u5220\\u9664\\s*(.+?)\\s*(?:\\u7ffb\\u8bd1\\u5c42|\\u8bd1\\u6587\\u5c42|\\u8f6c\\u5199\\u5c42|\\u8f6c\\u5f55\\u5c42|\\u542c\\u5199\\u5c42|\\u5c42)',
      'i',
    ),
  );
  const languageQuery = languageQueryMatch?.[1]?.trim();

  const result: Partial<AiChatToolCall['arguments']> = {};
  if (layerType) result.layerType = layerType;
  if (languageQuery) result.languageQuery = languageQuery;
  return result;
}
