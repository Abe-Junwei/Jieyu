import type { LayerDocType, UtteranceDocType } from '../db';
import type { AiChatToolCall } from './useAiChat';
import { layerMatchesLanguage, parseLayerHintFromOpaqueId } from './useAiToolCallHandler.helpers';

export interface SegmentTargetDescriptor {
  id: string;
  kind: 'utterance' | 'segment';
  startTime: number;
  endTime: number;
  text: string;
  utteranceId?: string;
}

interface PendingToolCallPreparationContext {
  utterances: UtteranceDocType[];
  selectedUnit?: UtteranceDocType;
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  segmentTargets?: SegmentTargetDescriptor[];
  selectedSegmentTargetId?: string;
}

function orderSegmentTargetsByTimeline(targets: SegmentTargetDescriptor[]): SegmentTargetDescriptor[] {
  return [...targets].sort((left, right) => {
    const startDiff = Number(left.startTime) - Number(right.startTime);
    if (startDiff !== 0) return startDiff;
    const endDiff = Number(left.endTime) - Number(right.endTime);
    if (endDiff !== 0) return endDiff;
    return left.id.localeCompare(right.id);
  });
}

function buildDefaultSegmentTargets(utterances: UtteranceDocType[]): SegmentTargetDescriptor[] {
  return utterances.map((utterance) => ({
    id: utterance.id,
    kind: 'utterance',
    startTime: utterance.startTime,
    endTime: utterance.endTime,
    text: '',
    utteranceId: utterance.id,
  }));
}

function resolveSegmentTargets(context: PendingToolCallPreparationContext): SegmentTargetDescriptor[] {
  if (Array.isArray(context.segmentTargets) && context.segmentTargets.length > 0) {
    return context.segmentTargets;
  }
  return buildDefaultSegmentTargets(context.utterances);
}

function resolveRequestedTarget(
  call: AiChatToolCall,
  targets: SegmentTargetDescriptor[],
  selectedTargetId?: string,
): SegmentTargetDescriptor | null {
  const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
  if (requestedSegmentId.length > 0) {
    return targets.find((item) => item.id === requestedSegmentId) ?? null;
  }

  const orderedTargets = orderSegmentTargetsByTimeline(targets);
  const segmentIndex = call.arguments.segmentIndex;
  if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) {
    return orderedTargets[segmentIndex - 1] ?? null;
  }

  if (call.arguments.segmentPosition === 'last') {
    return orderedTargets.length > 0 ? orderedTargets[orderedTargets.length - 1] ?? null : null;
  }
  if (call.arguments.segmentPosition === 'penultimate') {
    return orderedTargets.length > 1 ? orderedTargets[orderedTargets.length - 2] ?? null : null;
  }
  if (call.arguments.segmentPosition === 'middle') {
    if (orderedTargets.length === 0) return null;
    return orderedTargets[Math.floor((orderedTargets.length - 1) / 2)] ?? null;
  }
  if (call.arguments.segmentPosition === 'previous' || call.arguments.segmentPosition === 'next') {
    if (!selectedTargetId) return null;
    const anchorIndex = orderedTargets.findIndex((item) => item.id === selectedTargetId || item.utteranceId === selectedTargetId);
    if (anchorIndex < 0) return null;
    const offset = call.arguments.segmentPosition === 'previous' ? -1 : 1;
    return orderedTargets[anchorIndex + offset] ?? null;
  }

  return null;
}

function materializeSegmentTargetCall(
  call: AiChatToolCall,
  context: PendingToolCallPreparationContext,
): AiChatToolCall {
  if (![
    'create_transcription_segment',
    'split_transcription_segment',
    'delete_transcription_segment',
    'set_transcription_text',
    'set_translation_text',
    'clear_translation_segment',
  ].includes(call.name)) {
    return call;
  }

  const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
  const hasSelectorTarget = typeof call.arguments.segmentIndex === 'number' || typeof call.arguments.segmentPosition === 'string';
  if (requestedSegmentId.length > 0) {
    return call;
  }

  const nextArguments: Record<string, unknown> = { ...call.arguments };
  delete nextArguments.utteranceId;
  delete nextArguments.utteranceIds;
  const segmentTargets = resolveSegmentTargets(context);
  if (call.name === 'delete_transcription_segment' && call.arguments.allSegments === true) {
    const orderedTargets = orderSegmentTargetsByTimeline(segmentTargets);
    if (orderedTargets.length === 0) {
      return call;
    }
    const segmentIds = orderedTargets.map((item) => item.id);
    delete nextArguments.allSegments;
    if (segmentIds.length > 0) nextArguments.segmentIds = segmentIds;
    return {
      ...call,
      arguments: nextArguments,
    };
  }

  const selectedTargetId = context.selectedSegmentTargetId ?? context.selectedUnit?.id;
  const target = resolveRequestedTarget(call, segmentTargets, selectedTargetId)
    ?? (!hasSelectorTarget && selectedTargetId
      ? segmentTargets.find((item) => item.id === selectedTargetId || item.utteranceId === selectedTargetId) ?? null
      : null);
  if (!target) return call;

  delete nextArguments.segmentIndex;
  delete nextArguments.segmentPosition;
  nextArguments.segmentId = target.id;
  delete nextArguments.utteranceId;
  return {
    ...call,
    arguments: nextArguments,
  };
}

function materializeDeleteLayerCall(
  call: AiChatToolCall,
  context: PendingToolCallPreparationContext,
): AiChatToolCall {
  if (call.name !== 'delete_layer') return call;

  const requestedLayerId = String(call.arguments.layerId ?? '').trim();
  const allLayers = [...context.transcriptionLayers, ...context.translationLayers];
  if (requestedLayerId) {
    if (allLayers.some((layer) => layer.id === requestedLayerId)) return call;
    const hint = parseLayerHintFromOpaqueId(requestedLayerId);
    if (!hint) return call;
    const pool = hint.layerType === 'translation' ? context.translationLayers : context.transcriptionLayers;
    const matched = pool.filter((layer) => layerMatchesLanguage(layer, hint.languageQuery));
    if (matched.length !== 1) return call;
    return {
      ...call,
      arguments: {
        layerId: matched[0]!.id,
      },
    };
  }

  const layerType = String(call.arguments.layerType ?? '').trim().toLowerCase();
  const languageQuery = String(call.arguments.languageQuery ?? '').trim();
  if (!layerType || !languageQuery) return call;
  const pool = layerType === 'translation'
    ? context.translationLayers
    : layerType === 'transcription'
      ? context.transcriptionLayers
      : [];
  const matched = pool.filter((layer) => layerMatchesLanguage(layer, languageQuery));
  if (matched.length !== 1) return call;
  return {
    ...call,
    arguments: {
      layerId: matched[0]!.id,
    },
  };
}

export function materializePendingToolCallTargets(
  call: AiChatToolCall,
  context: PendingToolCallPreparationContext,
): AiChatToolCall {
  const segmentMaterialized = materializeSegmentTargetCall(call, context);
  return materializeDeleteLayerCall(segmentMaterialized, context);
}
