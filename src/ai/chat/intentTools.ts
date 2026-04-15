import type { AiPromptContext } from './chatDomain.types';
import type { TimelineUnitView } from '../../hooks/timelineUnitView';

export interface IntentToolResult {
  count: number;
  items: Array<Record<string, unknown>>;
  suggestion?: string;
  meta?: Record<string, unknown>;
}

function getUnits(context: AiPromptContext): TimelineUnitView[] {
  const rows = context.shortTerm?.localUnitIndex;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is TimelineUnitView => Boolean(
    row && typeof row.id === 'string' && row.id.trim().length > 0
      && typeof row.layerId === 'string',
  ));
}

function normalizeIntentLimit(value: unknown, fallback: number, max: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(max, Math.max(1, Math.floor(value)));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(max, Math.max(1, Math.floor(parsed)));
    }
  }
  return fallback;
}

function statusOf(unit: TimelineUnitView): string {
  const text = typeof unit.text === 'string' ? unit.text.trim() : '';
  return unit.annotationStatus?.trim().toLowerCase() || (text.length > 0 ? 'transcribed' : 'raw');
}

function summarizeByLayer(units: ReadonlyArray<TimelineUnitView>): Array<{ layerId: string; count: number }> {
  const counts = new Map<string, number>();
  for (const unit of units) {
    counts.set(unit.layerId, (counts.get(unit.layerId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([layerId, count]) => ({ layerId, count }))
    .sort((left, right) => (right.count !== left.count ? right.count - left.count : left.layerId.localeCompare(right.layerId)));
}

export function findIncompleteUnits(context: AiPromptContext, args: Record<string, unknown>): IntentToolResult {
  const limit = normalizeIntentLimit(args.limit, 12, 50);
  const incompleteUnits = getUnits(context)
    .filter((unit) => statusOf(unit) !== 'verified')
    .sort((left, right) => left.startTime - right.startTime);
  const items = incompleteUnits
    .slice(0, limit)
    .map((unit) => ({
      id: unit.id,
      kind: unit.kind,
      ...(unit.layerRole ? { layerRole: unit.layerRole } : {}),
      ...(unit.parentUtteranceId ? { parentUtteranceId: unit.parentUtteranceId } : {}),
      layerId: unit.layerId,
      mediaId: unit.mediaId,
      text: unit.text,
      status: statusOf(unit),
    }));
  return {
    count: items.length,
    items,
    suggestion: items.length > 0 ? 'Prioritize verified transcription on current media before cross-layer polishing.' : 'No incomplete units detected.',
    meta: {
      totalIncomplete: incompleteUnits.length,
      byLayer: summarizeByLayer(incompleteUnits),
      referringCount: incompleteUnits.filter((unit) => unit.layerRole === 'referring').length,
    },
  };
}

export function diagnoseQuality(context: AiPromptContext): IntentToolResult {
  const units = getUnits(context);
  const missingSpeaker = units.filter((unit) => !unit.speakerId);
  const emptyText = units.filter((unit) => (typeof unit.text === 'string' ? unit.text.trim().length : 0) === 0);
  const wa = context.longTerm?.waveformAnalysis;
  const items = [
    { category: 'missing_speaker', count: missingSpeaker.length },
    { category: 'empty_text', count: emptyText.length },
    { category: 'current_media_gaps', count: wa?.gapCount ?? 0 },
    { category: 'waveform_overlap', count: wa?.overlapCount ?? 0 },
    { category: 'low_confidence_regions', count: wa?.lowConfidenceCount ?? 0 },
  ].filter((item) => item.count > 0);
  return {
    count: items.length,
    items,
    suggestion: items.length > 0 ? 'Use find_incomplete_units to inspect concrete targets before editing.' : 'No obvious quality issues detected.',
    meta: {
      byLayer: {
        missingSpeaker: summarizeByLayer(missingSpeaker),
        emptyText: summarizeByLayer(emptyText),
      },
    },
  };
}

export function suggestNextAction(context: AiPromptContext): IntentToolResult {
  const diagnosis = diagnoseQuality(context);
  const incomplete = findIncompleteUnits(context, { limit: 3 });
  const items: Array<Record<string, unknown>> = [];
  if (incomplete.count > 0) {
    items.push({ priority: 1, action: 'review_incomplete_units', count: incomplete.count });
  }
  if (diagnosis.items.length > 0) {
    items.push({ priority: 2, action: 'fix_quality_issues', issues: diagnosis.items });
  }
  if (items.length === 0) {
    items.push({ priority: 1, action: 'continue_current_selection' });
  }
  return {
    count: items.length,
    items,
    suggestion: 'Follow the smallest high-signal batch first to reduce context churn.',
  };
}

const BATCH_APPLY_CHUNK_SIZE = 24;
const BATCH_APPLY_MAX_PREVIEW_ITEMS = 64;

export function batchApply(context: AiPromptContext, args: Record<string, unknown>): IntentToolResult {
  const rawIds = Array.isArray(args.unitIds) ? args.unitIds.filter((item): item is string => typeof item === 'string') : [];
  const unitIds = rawIds.map((id) => id.trim()).filter((id) => id.length > 0);
  const action = typeof args.action === 'string' ? args.action.trim() : '';
  const unitsById = new Map(getUnits(context).map((unit) => [unit.id, unit] as const));

  const chunkSize = BATCH_APPLY_CHUNK_SIZE;
  const chunkCount = unitIds.length === 0 ? 0 : Math.ceil(unitIds.length / chunkSize);

  const matchedUnits: TimelineUnitView[] = [];
  const seen = new Set<string>();
  for (const id of unitIds) {
    const hit = unitsById.get(id);
    if (hit && !seen.has(id)) {
      seen.add(id);
      matchedUnits.push(hit);
    }
  }
  const unresolvedUnitIds = [...new Set(unitIds.filter((id) => !unitsById.has(id)))];
  const allItems = matchedUnits.map((unit) => ({
    id: unit.id,
    kind: unit.kind,
    action,
    preview: `Would apply ${action || 'update'} to ${unit.id}`,
  }));
  const previewTruncated = allItems.length > BATCH_APPLY_MAX_PREVIEW_ITEMS;
  const items = previewTruncated ? allItems.slice(0, BATCH_APPLY_MAX_PREVIEW_ITEMS) : allItems;

  return {
    count: items.length,
    items,
    suggestion: items.length > 0
      ? 'Route batch_apply through preview-confirm before executing.'
      : unresolvedUnitIds.length > 0 && unitIds.length > 0
        ? 'No matching units for batch_apply; check unitIds against list_units / get_unit_detail.'
        : 'No matching units for batch_apply.',
    meta: {
      requestedUnitIdCount: unitIds.length,
      matchedUnitIdCount: matchedUnits.length,
      chunkSize,
      chunkCount,
      ...(previewTruncated
        ? { previewTruncated: true, previewItemCap: BATCH_APPLY_MAX_PREVIEW_ITEMS }
        : {}),
      ...(unresolvedUnitIds.length > 0 ? { unresolvedUnitIds } : {}),
      byLayer: summarizeByLayer(matchedUnits),
    },
  };
}
