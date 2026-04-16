import type { LayerDocType, LayerUnitDocType } from '../db';
import { t, tf, type Locale } from '../i18n';
import type { AiChatToolCall, AiToolRiskCheckResult } from '../hooks/useAiChat';
import type { SegmentTargetDescriptor } from '../hooks/useAiToolCallHandler.segmentTargeting';
import { resolveLanguageQuery, SUPPORTED_VOICE_LANGS } from '../utils/langMapping';
import { listUniqueNonEmptyMultiLangLabels } from '../utils/multiLangLabels';

interface CreateTranscriptionAiToolRiskCheckInput {
  locale: Locale;
  units: LayerUnitDocType[];
  selectedUnit?: LayerUnitDocType;
  selectedSegmentTargetId?: string;
  segmentTargets?: SegmentTargetDescriptor[];
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  formatTime: (seconds: number) => string;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  translationTextByLayer: Map<string, Map<string, { text?: string }>>;
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

function buildDefaultSegmentTargets(
  units: LayerUnitDocType[],
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string,
): SegmentTargetDescriptor[] {
  return units.map((unit) => ({
    id: unit.id,
    kind: 'unit',
    startTime: unit.startTime,
    endTime: unit.endTime,
    text: getUnitTextForLayer(unit).trim(),
    unitId: unit.id,
  }));
}

function hasSemanticSegmentSelector(call: AiChatToolCall): boolean {
  const segmentIndex = call.arguments.segmentIndex;
  if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) {
    return true;
  }
  return typeof call.arguments.segmentPosition === 'string' && call.arguments.segmentPosition.length > 0;
}

function resolveSelectorTargets(
  call: AiChatToolCall,
  targets: SegmentTargetDescriptor[],
  selectedTargetId?: string,
): SegmentTargetDescriptor[] {
  const orderedTargets = orderSegmentTargetsByTimeline(targets);
  const segmentIndex = call.arguments.segmentIndex;
  if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) {
    return orderedTargets[segmentIndex - 1] ? [orderedTargets[segmentIndex - 1]!] : [];
  }

  if (call.arguments.segmentPosition === 'last') {
    return orderedTargets.length > 0 ? [orderedTargets[orderedTargets.length - 1]!] : [];
  }
  if (call.arguments.segmentPosition === 'penultimate') {
    return orderedTargets.length > 1 ? [orderedTargets[orderedTargets.length - 2]!] : [];
  }
  if (call.arguments.segmentPosition === 'middle') {
    return orderedTargets.length > 0 ? [orderedTargets[Math.floor((orderedTargets.length - 1) / 2)]!] : [];
  }
  if (call.arguments.segmentPosition === 'previous' || call.arguments.segmentPosition === 'next') {
    if (!selectedTargetId) return [];
    const anchorIndex = orderedTargets.findIndex((item) => item.id === selectedTargetId || item.unitId === selectedTargetId);
    if (anchorIndex < 0) return [];
    const offset = call.arguments.segmentPosition === 'previous' ? -1 : 1;
    const target = orderedTargets[anchorIndex + offset];
    return target ? [target] : [];
  }

  return [];
}

function resolveTargetSegments(
  call: AiChatToolCall,
  targets: SegmentTargetDescriptor[],
  selectedTargetId?: string,
): SegmentTargetDescriptor[] {
  if (call.arguments.allSegments === true) {
    return targets;
  }

  const requestedIds = Array.from(new Set([
    ...((Array.isArray(call.arguments.segmentIds) ? call.arguments.segmentIds : [])
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)),
  ]));
  if (requestedIds.length > 0) {
    const byId = new Map(targets.map((item) => [item.id, item] as const));
    return requestedIds.map((id) => byId.get(id)).filter((item): item is SegmentTargetDescriptor => Boolean(item));
  }

  const segmentId = String(call.arguments.segmentId ?? '').trim();
  if (segmentId) {
    const target = targets.find((item) => item.id === segmentId);
    return target ? [target] : [];
  }

  return resolveSelectorTargets(call, targets, selectedTargetId);
}

export function createTranscriptionAiToolRiskCheck({
  locale,
  units,
  selectedUnit,
  selectedSegmentTargetId,
  segmentTargets,
  transcriptionLayers,
  translationLayers,
  formatTime,
  getUnitTextForLayer,
  translationTextByLayer,
}: CreateTranscriptionAiToolRiskCheckInput) {
  const resolvedSegmentTargets = Array.isArray(segmentTargets) && segmentTargets.length > 0
    ? segmentTargets
    : buildDefaultSegmentTargets(units, getUnitTextForLayer);

  return (call: AiChatToolCall): AiToolRiskCheckResult | null => {
    if (call.name === 'delete_layer') {
      const layerId = String(call.arguments.layerId ?? '').trim();
      if (layerId) {
        const exists = transcriptionLayers.some((layer) => layer.id === layerId)
          || translationLayers.some((layer) => layer.id === layerId);
        if (!exists) {
          return {
            requiresConfirmation: false,
            riskSummary: tf(locale, 'transcription.aiTool.layer.targetNotFound', { layerId }),
            impactPreview: [],
          };
        }
      } else {
        const layerType = String(call.arguments.layerType ?? '').trim().toLowerCase();
        const languageQuery = String(call.arguments.languageQuery ?? '').trim();
        if (layerType && languageQuery) {
          const pool = layerType === 'translation' ? translationLayers
            : layerType === 'transcription' ? transcriptionLayers : [];
          const code = resolveLanguageQuery(languageQuery);
          const matchTokens = [languageQuery.toLowerCase(), ...(code ? [code] : [])];
          const entry = code ? SUPPORTED_VOICE_LANGS.flatMap((group) => group.langs).find((lang) => lang.code === code) : undefined;
          if (entry) {
            entry.label.split(/\s*\/\s*/).forEach((part) => matchTokens.push(part.trim().toLowerCase()));
          }
          const matched = pool.filter((layer) => {
            const fields = [layer.languageId, layer.key, ...listUniqueNonEmptyMultiLangLabels(layer.name)]
              .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
              .map((value) => value.trim().toLowerCase());
            return matchTokens.some((token) => fields.some((field) => field.includes(token) || token.includes(field)));
          });
          const layerTypeLabel = layerType === 'translation'
            ? t(locale, 'transcription.aiTool.layer.typeTranslation')
            : t(locale, 'transcription.aiTool.layer.typeTranscription');
          if (matched.length === 0) {
            return {
              requiresConfirmation: false,
              riskSummary: tf(locale, 'transcription.aiTool.layer.noMatchByLanguage', {
                languageQuery,
                layerType: layerTypeLabel,
              }),
              impactPreview: [],
            };
          }
          if (matched.length > 1) {
            return {
              requiresConfirmation: false,
              riskSummary: tf(locale, 'transcription.aiTool.layer.multipleMatchByLanguage', {
                layerType: layerTypeLabel,
              }),
              impactPreview: [],
            };
          }
        }
      }
      return null;
    }

    if (call.name !== 'delete_transcription_segment') {
      return null;
    }

    const targetSegments = resolveTargetSegments(
      call,
      resolvedSegmentTargets,
      selectedSegmentTargetId ?? selectedUnit?.id,
    );
    if (targetSegments.length === 0) {
      if (call.arguments.allSegments === true) {
        return {
          requiresConfirmation: false,
          riskSummary: t(locale, 'transcription.aiTool.segment.deleteAllNoTargets'),
          impactPreview: [],
        };
      }
      if (hasSemanticSegmentSelector(call)) {
        return {
          requiresConfirmation: false,
          riskSummary: t(locale, 'transcription.aiTool.segment.deleteTargetNotResolvable'),
          impactPreview: [],
        };
      }
      return null;
    }

    const sortedByTime = orderSegmentTargetsByTimeline(resolvedSegmentTargets);
    const targetUnitIds = new Set(targetSegments
      .filter((item) => item.kind === 'unit')
      .map((item) => item.unitId ?? item.id));
    const firstTarget = targetSegments[0]!;
    const lastTarget = targetSegments[targetSegments.length - 1]!;
    const timeRange = `${formatTime(firstTarget.startTime)}-${formatTime(lastTarget.endTime)}`;
    const transcriptionPreviews = targetSegments
      .map((item) => item.text.trim())
      .filter((item) => item.length > 0);
    const translationEntryCountWithContent = Array.from(translationTextByLayer.values()).reduce((count, layerMap) => {
      for (const targetId of targetUnitIds) {
        if (layerMap.get(targetId)?.text?.trim()) count += 1;
      }
      return count;
    }, 0);

    if (transcriptionPreviews.length === 0 && translationEntryCountWithContent === 0) {
      return { requiresConfirmation: false };
    }

    if (targetSegments.length === 1) {
      const targetSegment = targetSegments[0]!;
      const rowIndex = Math.max(0, sortedByTime.findIndex((item) => item.id === targetSegment.id)) + 1;
      const transcriptionPreview = transcriptionPreviews[0]
        ? (transcriptionPreviews[0]!.length > 18 ? `${transcriptionPreviews[0]!.slice(0, 18)}...` : transcriptionPreviews[0]!)
        : t(locale, 'transcription.ai.segment.noTranscriptionText');

      return {
        requiresConfirmation: true,
        riskSummary: tf(locale, 'transcription.ai.segment.deleteRiskSummary', { rowIndex, timeRange }),
        impactPreview: [
          tf(locale, 'transcription.ai.segment.deleteImpactContent', { preview: transcriptionPreview }),
          tf(locale, 'transcription.ai.segment.deleteImpactRelation', { count: translationEntryCountWithContent }),
          t(locale, 'transcription.ai.segment.deleteImpactUndo'),
        ],
      };
    }

    const combinedPreview = transcriptionPreviews.length > 0
      ? transcriptionPreviews.slice(0, 2).join(' / ')
      : t(locale, 'transcription.ai.segment.noTranscriptionText');

    return {
      requiresConfirmation: true,
      riskSummary: tf(locale, 'transcription.ai.segment.deleteBatchRiskSummary', {
        count: targetSegments.length,
        timeRange,
      }),
      impactPreview: [
        tf(locale, 'transcription.ai.segment.deleteBatchImpactScope', {
          count: targetSegments.length,
          preview: combinedPreview.length > 48 ? `${combinedPreview.slice(0, 48)}...` : combinedPreview,
        }),
        tf(locale, 'transcription.ai.segment.deleteBatchImpactRelation', { count: translationEntryCountWithContent }),
        t(locale, 'transcription.ai.segment.deleteImpactUndo'),
      ],
    };
  };
}
