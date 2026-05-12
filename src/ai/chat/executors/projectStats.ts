import type { AiPromptContext } from '../chatDomain.types';
import type { LocalContextToolResult } from '../localContextToolTypes';
import type { SegmentMetaDocType } from '../../../db';
import {
  normalizeUnitScope,
  normalizeProjectMetric,
  type LocalUnitScope,
} from '../localContextToolScopeNormalize';
import { buildReadModelMetaWithSource } from './readModelMeta';
import { normalizeTextValue } from './argNormalizers';
import {
  loadNormalizedUnitRows,
  filterRowsByScope,
  resolveExpectedTotalForScope,
  resolveContextTextId,
  loadScopedSegmentMetaRows,
  resolveSegmentReadQueryScope,
} from './timelineExecutors';
import { diagnoseQuality } from '../intentTools';
import { WorkspaceReadModelService } from '../../../services/WorkspaceReadModelService';
import { diagnoseProjectQuality } from '../../queries/segmentReadQueries';

function normalizeQualityMetric(
  value: unknown,
): 'untranscribed_count' | 'missing_speaker_count' | undefined {
  const normalized = normalizeProjectMetric(value);
  return normalized === 'untranscribed_count' || normalized === 'missing_speaker_count'
    ? normalized
    : undefined;
}

function resolveSnapshotScopeParams(
  context: AiPromptContext,
  scope: LocalUnitScope,
  textId: string,
): {
  scopeType: 'project' | 'media' | 'layer';
  scopeKey: string;
  qualityFilters: { textId: string; mediaId?: string; layerId?: string };
} | null {
  if (scope === 'project') {
    return {
      scopeType: 'project',
      scopeKey: textId,
      qualityFilters: { textId },
    };
  }

  const mediaId = normalizeTextValue(context.shortTerm?.currentMediaId);
  if (scope === 'current_track') {
    return mediaId
      ? {
          scopeType: 'media',
          scopeKey: mediaId,
          qualityFilters: { textId, mediaId },
        }
      : null;
  }

  const layerId = normalizeTextValue(context.shortTerm?.selectedLayerId);
  if (!layerId) return null;
  return {
    scopeType: 'layer',
    scopeKey: layerId,
    qualityFilters: {
      textId,
      ...(mediaId ? { mediaId } : {}),
      layerId,
    },
  };
}

export async function getProjectStats(
  context: AiPromptContext,
  args: Record<string, unknown>,
): Promise<LocalContextToolResult> {
  const scope = normalizeUnitScope(args.scope, 'project');
  const requestedMetric = normalizeProjectMetric(args.metric);
  const textId = resolveContextTextId(context);
  const snapshotScope = textId ? resolveSnapshotScopeParams(context, scope, textId) : null;

  if (textId && snapshotScope) {
    try {
      await WorkspaceReadModelService.rebuildForText(textId);
      const [statsRow, qualitySummary] = await Promise.all([
        WorkspaceReadModelService.getScopeStats(
          snapshotScope.scopeType,
          snapshotScope.scopeKey,
          textId,
        ),
        requestedMetric === 'untranscribed_count' || requestedMetric === 'missing_speaker_count'
          ? WorkspaceReadModelService.summarizeQuality(snapshotScope.qualityFilters)
          : Promise.resolve(null),
      ]);

      if (statsRow) {
        const unitCount = statsRow.unitCount;
        const speakerCount = statsRow.speakerCount;
        const translationLayerCount = statsRow.translationLayerCount;
        const aiConfidenceAvg = statsRow.avgAiConfidence ?? null;
        const breakdown = qualitySummary
          ? {
              ...qualitySummary.breakdown,
              currentMediaGapCount: context.longTerm?.waveformAnalysis?.gapCount ?? 0,
              waveformOverlapCount: context.longTerm?.waveformAnalysis?.overlapCount ?? 0,
              lowConfidenceRegionCount: context.longTerm?.waveformAnalysis?.lowConfidenceCount ?? 0,
            }
          : undefined;
        const value =
          requestedMetric === 'unit_count'
            ? unitCount
            : requestedMetric === 'speaker_count'
              ? speakerCount
              : requestedMetric === 'translation_layer_count'
                ? translationLayerCount
                : requestedMetric === 'ai_confidence_avg'
                  ? aiConfidenceAvg
                  : requestedMetric === 'untranscribed_count'
                    ? (qualitySummary?.breakdown.emptyTextCount ?? statsRow.untranscribedCount)
                    : requestedMetric === 'missing_speaker_count'
                      ? (qualitySummary?.breakdown.missingSpeakerCount ??
                        statsRow.missingSpeakerCount)
                      : undefined;

        return {
          ok: true,
          name: 'get_project_stats',
          result: {
            scope,
            unitCount,
            speakerCount,
            translationLayerCount,
            aiConfidenceAvg,
            ...(breakdown
              ? {
                  breakdown,
                  totalUnitsInScope: qualitySummary?.totalUnitsInScope ?? unitCount,
                  completionRate: qualitySummary?.completionRate ?? 1,
                }
              : {}),
            ...(requestedMetric ? { requestedMetric, value } : {}),
            _readModel: buildReadModelMetaWithSource(context, 'scope_stats_snapshot'),
          },
        };
      }
    } catch {
      // fall back to the in-memory timeline index path
    }
  }

  const scopedRows = filterRowsByScope(context, loadNormalizedUnitRows(context), scope);
  const unitCount = resolveExpectedTotalForScope(context, scope) ?? scopedRows.length;
  const speakerIds = new Set(
    scopedRows.map((row) => normalizeTextValue(row.speakerId)).filter((id) => id.length > 0),
  );
  const derivedSpeakerCount = speakerIds.size > 0 ? speakerIds.size : undefined;
  const speakerCount =
    scope === 'project'
      ? (context.longTerm?.projectStats?.speakerCount ?? derivedSpeakerCount)
      : derivedSpeakerCount;
  const translationLayerCount = context.longTerm?.projectStats?.translationLayerCount;
  const aiConfidenceAvg = context.longTerm?.projectStats?.aiConfidenceAvg ?? null;
  const qualityDiagnosis =
    requestedMetric === 'untranscribed_count' || requestedMetric === 'missing_speaker_count'
      ? diagnoseQuality(context, { scope, metric: requestedMetric })
      : null;
  const value =
    requestedMetric === 'unit_count'
      ? unitCount
      : requestedMetric === 'speaker_count'
        ? (speakerCount ?? null)
        : requestedMetric === 'translation_layer_count'
          ? (translationLayerCount ?? null)
          : requestedMetric === 'ai_confidence_avg'
            ? aiConfidenceAvg
            : requestedMetric === 'untranscribed_count' ||
                requestedMetric === 'missing_speaker_count'
              ? typeof qualityDiagnosis?.value === 'number'
                ? qualityDiagnosis.value
                : null
              : undefined;

  return {
    ok: true,
    name: 'get_project_stats',
    result: {
      scope,
      unitCount,
      ...(speakerCount !== undefined ? { speakerCount } : {}),
      ...(translationLayerCount !== undefined ? { translationLayerCount } : {}),
      aiConfidenceAvg,
      ...(qualityDiagnosis
        ? {
            breakdown: qualityDiagnosis.breakdown,
            totalUnitsInScope: qualityDiagnosis.totalUnitsInScope,
            completionRate: qualityDiagnosis.completionRate,
          }
        : {}),
      ...(requestedMetric ? { requestedMetric, value } : {}),
    },
  };
}

/**
 * segment_meta 优先路径：查找未完成语段 | Snapshot-first path for finding incomplete units
 */
export async function findIncompleteUnitsWithSnapshots(
  context: AiPromptContext,
  args: Record<string, unknown>,
): Promise<LocalContextToolResult | null> {
  const rows = await loadScopedSegmentMetaRows(context, 'current_scope');
  if (!rows || rows.length === 0) return null;

  const limit =
    typeof args.limit === 'number' && Number.isFinite(args.limit)
      ? Math.min(50, Math.max(1, Math.floor(args.limit)))
      : 12;

  const incomplete = rows
    .filter((row) => {
      const status = row.annotationStatus?.trim().toLowerCase() ?? '';
      if (status === 'verified') return false;
      return true;
    })
    .sort((a, b) => a.startTime - b.startTime);

  const items = incomplete.slice(0, limit).map((row) => ({
    id: row.segmentId,
    kind: row.unitKind ?? 'segment',
    layerId: row.layerId,
    mediaId: row.mediaId,
    text: row.text,
    status: row.annotationStatus?.trim().toLowerCase() || (row.hasText ? 'transcribed' : 'raw'),
  }));

  // 按 layerId 汇总 | Summarize by layer
  const layerCounts = new Map<string, number>();
  for (const row of incomplete) {
    layerCounts.set(row.layerId, (layerCounts.get(row.layerId) ?? 0) + 1);
  }
  const byLayer = Array.from(layerCounts.entries())
    .map(([layerId, count]) => ({ layerId, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.layerId.localeCompare(b.layerId)));

  return {
    ok: true,
    name: 'find_incomplete_units',
    result: {
      count: items.length,
      items,
      suggestion:
        items.length > 0
          ? 'Prioritize verified transcription on current media before cross-layer polishing.'
          : 'No incomplete units detected.',
      meta: {
        totalIncomplete: incomplete.length,
        byLayer,
      },
      _readModel: buildReadModelMetaWithSource(context, 'segment_meta'),
    },
  };
}

/**
 * segment_meta 优先路径：校验 batchApply unitIds | Snapshot-first validation for batch_apply unitIds
 */
export async function batchApplyWithSnapshots(
  context: AiPromptContext,
  args: Record<string, unknown>,
): Promise<LocalContextToolResult | null> {
  const rows = await loadScopedSegmentMetaRows(context, 'current_scope');
  if (!rows || rows.length === 0) return null;

  const rawIds = Array.isArray(args.unitIds)
    ? args.unitIds.filter((item): item is string => typeof item === 'string')
    : [];
  const unitIds = rawIds.map((id) => id.trim()).filter((id) => id.length > 0);
  const action = typeof args.action === 'string' ? args.action.trim() : '';

  const rowsById = new Map(rows.map((row) => [row.segmentId, row] as const));

  const CHUNK_SIZE = 24;
  const MAX_PREVIEW = 64;

  const matchedRows: SegmentMetaDocType[] = [];
  const seen = new Set<string>();
  for (const id of unitIds) {
    const hit = rowsById.get(id);
    if (hit && !seen.has(id)) {
      seen.add(id);
      matchedRows.push(hit);
    }
  }
  const unresolvedUnitIds = [...new Set(unitIds.filter((id) => !rowsById.has(id)))];

  const allItems = matchedRows.map((row) => ({
    id: row.segmentId,
    kind: row.unitKind ?? 'segment',
    action,
    preview: `Would apply ${action || 'update'} to ${row.segmentId}`,
  }));
  const previewTruncated = allItems.length > MAX_PREVIEW;
  const items = previewTruncated ? allItems.slice(0, MAX_PREVIEW) : allItems;

  // 按 layerId 汇总 | Summarize by layer
  const layerCounts = new Map<string, number>();
  for (const row of matchedRows) {
    layerCounts.set(row.layerId, (layerCounts.get(row.layerId) ?? 0) + 1);
  }
  const byLayer = Array.from(layerCounts.entries())
    .map(([layerId, count]) => ({ layerId, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.layerId.localeCompare(b.layerId)));

  return {
    ok: true,
    name: 'batch_apply',
    result: {
      count: items.length,
      items,
      suggestion:
        items.length > 0
          ? 'Route batch_apply through preview-confirm before executing.'
          : unresolvedUnitIds.length > 0 && unitIds.length > 0
            ? 'No matching units for batch_apply; check unitIds against list_units / get_unit_detail.'
            : 'No matching units for batch_apply.',
      meta: {
        requestedUnitIdCount: unitIds.length,
        matchedUnitIdCount: matchedRows.length,
        chunkSize: CHUNK_SIZE,
        chunkCount: unitIds.length === 0 ? 0 : Math.ceil(unitIds.length / CHUNK_SIZE),
        ...(previewTruncated ? { previewTruncated: true, previewItemCap: MAX_PREVIEW } : {}),
        ...(unresolvedUnitIds.length > 0 ? { unresolvedUnitIds } : {}),
        byLayer,
      },
      _readModel: buildReadModelMetaWithSource(context, 'segment_meta'),
    },
  };
}

export async function diagnoseQualityWithSnapshots(
  context: AiPromptContext,
  args: Record<string, unknown> = {},
): Promise<LocalContextToolResult | null> {
  const scope = normalizeUnitScope(args.scope, 'project');
  const requestedMetric = normalizeQualityMetric(args.metric);
  const textId = resolveContextTextId(context);
  const snapshotScope = textId ? resolveSnapshotScopeParams(context, scope, textId) : null;
  if (!textId || !snapshotScope) return null;

  try {
    await WorkspaceReadModelService.rebuildForText(textId);
    const summary = await WorkspaceReadModelService.summarizeQuality(snapshotScope.qualityFilters);
    const facadeDiagnosis = await diagnoseProjectQuality(
      resolveSegmentReadQueryScope(context, scope) ?? { textId },
    ).catch(() => null);
    const wa = context.longTerm?.waveformAnalysis;
    const translationLayerCount = facadeDiagnosis?.summary.translationLayers ?? 0;
    const breakdown = {
      emptyTextCount: summary.breakdown.emptyTextCount,
      missingSpeakerCount: summary.breakdown.missingSpeakerCount,
      translationLayerCount,
      currentMediaGapCount: wa?.gapCount ?? 0,
      waveformOverlapCount: wa?.overlapCount ?? 0,
      lowConfidenceRegionCount: wa?.lowConfidenceCount ?? 0,
    };
    const value =
      requestedMetric === 'untranscribed_count'
        ? summary.breakdown.emptyTextCount
        : requestedMetric === 'missing_speaker_count'
          ? summary.breakdown.missingSpeakerCount
          : undefined;

    return {
      ok: true,
      name: 'diagnose_quality',
      result: {
        count: summary.count,
        items: summary.items,
        suggestion:
          summary.count > 0
            ? 'Use find_incomplete_units to inspect concrete targets before editing.'
            : (facadeDiagnosis?.recommendations[0] ?? 'No obvious quality issues detected.'),
        meta: {
          scope,
          ...(requestedMetric ? { requestedMetric } : {}),
          ...(value !== undefined ? { value } : {}),
          breakdown,
          totalUnitsInScope: summary.totalUnitsInScope,
          completionRate: summary.completionRate,
        },
        ...(requestedMetric ? { requestedMetric } : {}),
        ...(value !== undefined ? { value } : {}),
        scope,
        breakdown,
        totalUnitsInScope: summary.totalUnitsInScope,
        completionRate: summary.completionRate,
        _readModel: buildReadModelMetaWithSource(context, 'segment_quality_snapshot'),
      },
    };
  } catch {
    return null;
  }
}
