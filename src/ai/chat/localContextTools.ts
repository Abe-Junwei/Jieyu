import type { TimelineUnitView } from '../../hooks/timelineUnitView';
import type { AiLocalToolReadModelMeta, AiPromptContext } from './chatDomain.types';
import { extractJsonCandidates } from './toolCallSchemas';
import { batchApply, diagnoseQuality, findIncompleteUnits, suggestNextAction } from './intentTools';
import { getDb, type LayerUnitStatus, type NoteCategory, type SegmentMetaDocType } from '../../db';
import { listUtteranceTextsByUtterance } from '../../services/LayerSegmentationTextService';
import { SegmentMetaService } from '../../services/SegmentMetaService';
import { WorkspaceReadModelService } from '../../services/WorkspaceReadModelService';
import type { UtteranceSelfCertainty } from '../../utils/utteranceSelfCertainty';
import {
  AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS1,
  AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS2,
  AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS,
  AI_AGENT_LOOP_PAYLOAD_SHRINK_MAX_STEPS,
  AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS,
  AI_LOCAL_TOOL_RESULT_CHAR_BUDGET,
} from '../../hooks/useAiChat.config';
import { createMetricTags, recordMetric } from '../../observability/metrics';
import { buildLocalToolReadModelMeta } from './localContextToolReadModelMeta';
import {
  createListUnitsSnapshot,
  getListUnitsSnapshot,
  LIST_UNITS_SNAPSHOT_ROW_THRESHOLD,
  type ListUnitsSnapshotRow,
} from './localContextListUnitsSnapshotStore';

export type LocalContextToolName =
  | 'get_current_selection'
  | 'get_project_stats'
  | 'get_waveform_analysis'
  | 'get_acoustic_summary'
  | 'find_incomplete_units'
  | 'diagnose_quality'
  | 'batch_apply'
  | 'suggest_next_action'
  | 'list_units'
  | 'search_units'
  | 'get_unit_detail'
  | 'get_unit_linguistic_memory';

export interface LocalContextToolCall {
  name: LocalContextToolName;
  arguments: Record<string, unknown>;
}

export interface LocalContextToolResult {
  ok: boolean;
  name: LocalContextToolName;
  result: unknown;
  error?: string;
}

const LOCAL_CONTEXT_TOOL_NAMES = new Set<LocalContextToolName>([
  'get_current_selection',
  'get_project_stats',
  'get_waveform_analysis',
  'get_acoustic_summary',
  'find_incomplete_units',
  'diagnose_quality',
  'batch_apply',
  'suggest_next_action',
  'list_units',
  'search_units',
  'get_unit_detail',
  'get_unit_linguistic_memory',
]);

/**
 * Legacy local-tool names kept for older prompts / model outputs.
 * Metrics: `ai.local_tool_alias_usage` records each alias hit; do not add new aliases without an ADR.
 * Sunset: remove once audit shows zero alias usage for several releases.
 */
const LEGACY_LOCAL_CONTEXT_TOOL_ALIAS_MAP = {
  list_utterances: 'list_units',
  search_utterances: 'search_units',
  get_utterance_detail: 'get_unit_detail',
  get_utterance_linguistic_memory: 'get_unit_linguistic_memory',
} as const satisfies Record<string, LocalContextToolName>;

type ResolvedLocalToolName = {
  name: LocalContextToolName;
  usedAlias: boolean;
  rawName: string;
};

function normalizeToolName(name: string): ResolvedLocalToolName | null {
  const normalized = name.trim().toLowerCase();
  if (LOCAL_CONTEXT_TOOL_NAMES.has(normalized as LocalContextToolName)) {
    return { name: normalized as LocalContextToolName, usedAlias: false, rawName: normalized };
  }
  const aliased = LEGACY_LOCAL_CONTEXT_TOOL_ALIAS_MAP[normalized as keyof typeof LEGACY_LOCAL_CONTEXT_TOOL_ALIAS_MAP];
  if (aliased) {
    return { name: aliased, usedAlias: true, rawName: normalized };
  }
  return null;
}

function recordLocalToolAliasUsage(aliasName: string, canonicalName: LocalContextToolName): void {
  recordMetric({
    id: 'ai.local_tool_alias_usage',
    value: 1,
    tags: createMetricTags('localContextTools', {
      aliasName,
      canonicalName,
    }),
  });
}

function toToolCallCandidate(rawText: string): { name: string; arguments: Record<string, unknown> } | null {
  const candidates = extractJsonCandidates(rawText);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const holder = (typeof parsed.tool_call === 'object' && parsed.tool_call !== null)
        ? parsed.tool_call as Record<string, unknown>
        : parsed;

      const rawName = typeof holder.name === 'string' ? holder.name : null;
      if (!rawName) continue;
      const rawArgs = holder.arguments;
      const args = typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
        ? rawArgs as Record<string, unknown>
        : {};
      return { name: rawName, arguments: args };
    } catch {
      continue;
    }
  }
  return null;
}

function toToolCallCandidates(rawText: string): LocalContextToolCall[] {
  const candidates = extractJsonCandidates(rawText);
  const parsedCalls: LocalContextToolCall[] = [];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const rawBatch = parsed.tool_calls;
      if (Array.isArray(rawBatch)) {
        for (const item of rawBatch) {
          if (!item || typeof item !== 'object') continue;
          const holder = item as Record<string, unknown>;
          const rawName = typeof holder.name === 'string' ? holder.name : '';
          const normalized = normalizeToolName(rawName);
          if (!normalized) continue;
          if (normalized.usedAlias) {
            recordLocalToolAliasUsage(normalized.rawName, normalized.name);
          }
          const rawArgs = holder.arguments;
          const args = typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
            ? rawArgs as Record<string, unknown>
            : {};
          parsedCalls.push({ name: normalized.name, arguments: args });
        }
      }
    } catch {
      continue;
    }
  }

  if (parsedCalls.length > 0) return parsedCalls;
  const single = parseLocalContextToolCallFromText(rawText);
  return single ? [single] : [];
}

export function parseLocalContextToolCallFromText(rawText: string): LocalContextToolCall | null {
  const candidate = toToolCallCandidate(rawText);
  if (!candidate) return null;
  const normalized = normalizeToolName(candidate.name);
  if (!normalized) return null;
  if (normalized.usedAlias) {
    recordLocalToolAliasUsage(normalized.rawName, normalized.name);
  }
  return {
    name: normalized.name,
    arguments: candidate.arguments,
  };
}

export function parseLocalContextToolCallsFromText(rawText: string): LocalContextToolCall[] {
  return toToolCallCandidates(rawText);
}

function normalizeTextValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLimit(value: unknown, fallback = 5): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(20, Math.max(1, Math.floor(value)));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(20, Math.max(1, Math.floor(parsed)));
    }
  }
  return fallback;
}

/** Non-snapshot list caps offset (small in-memory index). Snapshot paging uses `LIST_UNITS_SNAPSHOT_OFFSET_MAX`. */
const LIST_UNITS_DEFAULT_OFFSET_MAX = 500;
const LIST_UNITS_SNAPSHOT_OFFSET_MAX = 10_000_000;

function normalizeOffset(value: unknown, fallback = 0, maxOffset = LIST_UNITS_DEFAULT_OFFSET_MAX): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(maxOffset, Math.max(0, Math.floor(value)));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(maxOffset, Math.max(0, Math.floor(parsed)));
    }
  }
  return fallback;
}

function normalizeBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

type LocalUnitScope = 'project' | 'current_track' | 'current_scope';

function normalizeUnitScope(value: unknown, fallback: LocalUnitScope = 'project'): LocalUnitScope {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return fallback;
  if (normalized === 'project' || normalized === 'global' || normalized === 'all') return 'project';
  if (normalized === 'current_track' || normalized === 'current-track' || normalized === 'track' || normalized === 'current_audio' || normalized === 'current-audio') return 'current_track';
  if (normalized === 'current_scope' || normalized === 'current-scope' || normalized === 'scope' || normalized === 'current') return 'current_scope';
  return fallback;
}

function filterRowsByScope(context: AiPromptContext, rows: NormalizedUnitRow[], scope: LocalUnitScope): NormalizedUnitRow[] {
  if (scope === 'project') return rows;

  let scoped = rows;
  const currentMediaId = normalizeTextValue(context.shortTerm?.currentMediaId);
  if (currentMediaId.length > 0) {
    const onCurrentMedia = scoped.filter((row) => normalizeTextValue(row.mediaId) === currentMediaId);
    scoped = onCurrentMedia;
  }

  if (scope === 'current_scope') {
    const selectedLayerId = normalizeTextValue(context.shortTerm?.selectedLayerId);
    if (selectedLayerId.length > 0) {
      const onSelectedLayer = scoped.filter((row) => normalizeTextValue(row.layerId) === selectedLayerId);
      scoped = onSelectedLayer;
    }
  }

  return scoped;
}

function resolveExpectedTotalForScope(context: AiPromptContext, scope: LocalUnitScope): number | undefined {
  const projectTotal = context.longTerm?.projectStats?.unitCount ?? context.shortTerm?.projectUnitCount;
  if (scope === 'project') {
    return typeof projectTotal === 'number' && Number.isFinite(projectTotal) ? projectTotal : undefined;
  }

  if (scope === 'current_track') {
    const currentTrackTotal = context.shortTerm?.currentMediaUnitCount;
    return typeof currentTrackTotal === 'number' && Number.isFinite(currentTrackTotal)
      ? currentTrackTotal
      : undefined;
  }

  const currentScopeTotal = context.shortTerm?.currentScopeUnitCount;
  if (typeof currentScopeTotal === 'number' && Number.isFinite(currentScopeTotal)) return currentScopeTotal;
  const currentTrackTotal = context.shortTerm?.currentMediaUnitCount;
  return typeof currentTrackTotal === 'number' && Number.isFinite(currentTrackTotal)
    ? currentTrackTotal
    : undefined;
}

interface NormalizedUnitRow {
  id: string;
  kind: 'utterance' | 'segment';
  layerId: string;
  textId?: string;
  mediaId?: string;
  startTime: number;
  endTime: number;
  transcription: string;
  speakerId?: string;
  annotationStatus?: string;
}

function normalizedUnitRowsFromContext(context: AiPromptContext): NormalizedUnitRow[] | null {
  const rows = context.shortTerm?.localUnitIndex;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.map((row) => {
    const legacy = row as TimelineUnitView & { transcription?: string };
    return {
      id: row.id,
      kind: row.kind,
      layerId: row.layerId,
      ...(row.textId !== undefined ? { textId: row.textId } : {}),
      ...(row.mediaId !== undefined ? { mediaId: row.mediaId } : {}),
      startTime: row.startTime,
      endTime: row.endTime,
      transcription: row.text ?? legacy.transcription ?? '',
      ...(row.speakerId !== undefined ? { speakerId: row.speakerId } : {}),
      ...(row.annotationStatus !== undefined ? { annotationStatus: row.annotationStatus } : {}),
    };
  });
}

function loadNormalizedUnitRows(context: AiPromptContext): NormalizedUnitRow[] {
  const fromContext = normalizedUnitRowsFromContext(context);
  if (fromContext) return fromContext;
  return [];
}

function buildReadModelMetaWithSource(
  context: AiPromptContext,
  source: AiLocalToolReadModelMeta['source'],
): AiLocalToolReadModelMeta {
  return {
    ...buildLocalToolReadModelMeta(context),
    ...(source ? { source } : {}),
  };
}

function resolveSegmentMetaScopeParams(
  context: AiPromptContext,
  scope: LocalUnitScope,
): { layerId: string; mediaId: string } | null {
  if (scope !== 'current_scope') return null;
  const layerId = normalizeTextValue(context.shortTerm?.selectedLayerId);
  const mediaId = normalizeTextValue(context.shortTerm?.currentMediaId);
  if (layerId.length === 0 || mediaId.length === 0) return null;
  return { layerId, mediaId };
}

function mapSegmentMetaRows(rows: readonly SegmentMetaDocType[]): NormalizedUnitRow[] {
  return rows.map((row) => ({
    id: row.segmentId,
    kind: row.unitKind ?? 'segment',
    layerId: row.layerId,
    ...(row.textId ? { textId: row.textId } : {}),
    ...(row.mediaId ? { mediaId: row.mediaId } : {}),
    startTime: row.startTime,
    endTime: row.endTime,
    transcription: row.text,
    ...(row.effectiveSpeakerId ? { speakerId: row.effectiveSpeakerId } : {}),
    ...(row.annotationStatus ? { annotationStatus: row.annotationStatus } : {}),
  }));
}

async function loadScopedSegmentMetaRows(
  context: AiPromptContext,
  scope: LocalUnitScope,
): Promise<SegmentMetaDocType[] | null> {
  const scopeParams = resolveSegmentMetaScopeParams(context, scope);
  if (!scopeParams) return null;
  try {
    return await SegmentMetaService.rebuildForLayerMedia(scopeParams.layerId, scopeParams.mediaId);
  } catch {
    try {
      return await SegmentMetaService.listByLayerMedia(scopeParams.layerId, scopeParams.mediaId);
    } catch {
      return null;
    }
  }
}

function normalizeProjectMetric(value: unknown): 'unit_count' | 'speaker_count' | 'translation_layer_count' | 'ai_confidence_avg' | 'untranscribed_count' | 'missing_speaker_count' | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'unit_count' || normalized === 'unitcount' || normalized === 'unit' || normalized === 'units') return 'unit_count';
  if (normalized === 'speaker_count' || normalized === 'speakercount' || normalized === 'speaker' || normalized === 'speakers') return 'speaker_count';
  if (normalized === 'translation_layer_count' || normalized === 'translationlayercount' || normalized === 'translation_layers' || normalized === 'layers') return 'translation_layer_count';
  if (normalized === 'ai_confidence_avg' || normalized === 'confidence' || normalized === 'avg_confidence') return 'ai_confidence_avg';
  if (normalized === 'untranscribed_count' || normalized === 'untranscribed' || normalized === 'unfinished' || normalized === 'remaining') return 'untranscribed_count';
  if (normalized === 'missing_speaker_count' || normalized === 'missing_speaker' || normalized === 'speaker_missing') return 'missing_speaker_count';
  return undefined;
}

function normalizeQualityMetric(value: unknown): 'untranscribed_count' | 'missing_speaker_count' | undefined {
  const normalized = normalizeProjectMetric(value);
  return normalized === 'untranscribed_count' || normalized === 'missing_speaker_count'
    ? normalized
    : undefined;
}

function resolveContextTextId(context: AiPromptContext): string | undefined {
  const directRows = loadNormalizedUnitRows(context);
  const directTextId = directRows.find((row) => normalizeTextValue(row.textId).length > 0)?.textId;
  return normalizeTextValue(directTextId) || undefined;
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

async function getProjectStats(context: AiPromptContext, args: Record<string, unknown>): Promise<LocalContextToolResult> {
  const scope = normalizeUnitScope(args.scope, 'project');
  const requestedMetric = normalizeProjectMetric(args.metric);
  const textId = resolveContextTextId(context);
  const snapshotScope = textId ? resolveSnapshotScopeParams(context, scope, textId) : null;

  if (textId && snapshotScope) {
    try {
      await WorkspaceReadModelService.rebuildForText(textId);
      const [statsRow, qualitySummary] = await Promise.all([
        WorkspaceReadModelService.getScopeStats(snapshotScope.scopeType, snapshotScope.scopeKey, textId),
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
        const value = requestedMetric === 'unit_count'
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
                    ? (qualitySummary?.breakdown.missingSpeakerCount ?? statsRow.missingSpeakerCount)
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
    scopedRows
      .map((row) => normalizeTextValue(row.speakerId))
      .filter((id) => id.length > 0),
  );
  const derivedSpeakerCount = speakerIds.size > 0 ? speakerIds.size : undefined;
  const speakerCount = scope === 'project'
    ? (context.longTerm?.projectStats?.speakerCount ?? derivedSpeakerCount)
    : derivedSpeakerCount;
  const translationLayerCount = context.longTerm?.projectStats?.translationLayerCount;
  const aiConfidenceAvg = context.longTerm?.projectStats?.aiConfidenceAvg ?? null;
  const qualityDiagnosis = (requestedMetric === 'untranscribed_count' || requestedMetric === 'missing_speaker_count')
    ? diagnoseQuality(context, { scope, metric: requestedMetric })
    : null;
  const value = requestedMetric === 'unit_count'
    ? unitCount
    : requestedMetric === 'speaker_count'
      ? (speakerCount ?? null)
      : requestedMetric === 'translation_layer_count'
        ? (translationLayerCount ?? null)
        : requestedMetric === 'ai_confidence_avg'
          ? aiConfidenceAvg
          : requestedMetric === 'untranscribed_count' || requestedMetric === 'missing_speaker_count'
            ? (typeof qualityDiagnosis?.value === 'number' ? qualityDiagnosis.value : null)
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

async function diagnoseQualityWithSnapshots(
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
    const wa = context.longTerm?.waveformAnalysis;
    const breakdown = {
      emptyTextCount: summary.breakdown.emptyTextCount,
      missingSpeakerCount: summary.breakdown.missingSpeakerCount,
      currentMediaGapCount: wa?.gapCount ?? 0,
      waveformOverlapCount: wa?.overlapCount ?? 0,
      lowConfidenceRegionCount: wa?.lowConfidenceCount ?? 0,
    };
    const value = requestedMetric === 'untranscribed_count'
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
        suggestion: summary.count > 0
          ? 'Use find_incomplete_units to inspect concrete targets before editing.'
          : 'No obvious quality issues detected.',
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

async function searchUnits(context: AiPromptContext, args: Record<string, unknown>): Promise<LocalContextToolResult> {
  const scope = normalizeUnitScope(args.scope, 'project');
  const query = normalizeTextValue(args.query);
  const limit = normalizeLimit(args.limit);
  const speakerId = normalizeTextValue(args.speakerId) || undefined;
  const noteCategory = normalizeTextValue(args.noteCategory) || undefined;
  const selfCertainty = normalizeTextValue(args.selfCertainty) || undefined;
  const annotationStatus = normalizeTextValue(args.annotationStatus) || undefined;
  const hasText = typeof args.hasText === 'boolean' ? args.hasText : undefined;
  const hasStructuredFilter = Boolean(speakerId || noteCategory || selfCertainty || annotationStatus || typeof hasText === 'boolean');

  const segmentMetaScope = resolveSegmentMetaScopeParams(context, scope);
  if (segmentMetaScope && (query.length > 0 || hasStructuredFilter)) {
    try {
      await SegmentMetaService.rebuildForLayerMedia(segmentMetaScope.layerId, segmentMetaScope.mediaId);
      const rows = await SegmentMetaService.searchSegmentMeta({
        layerId: segmentMetaScope.layerId,
        mediaId: segmentMetaScope.mediaId,
        ...(query.length > 0 ? { query } : {}),
        ...(speakerId ? { speakerId } : {}),
        ...(noteCategory ? { noteCategory: noteCategory as NoteCategory } : {}),
        ...(selfCertainty ? { selfCertainty: selfCertainty as UtteranceSelfCertainty } : {}),
        ...(annotationStatus ? { annotationStatus: annotationStatus as LayerUnitStatus } : {}),
        ...(typeof hasText === 'boolean' ? { hasText } : {}),
        limit,
      });
      const matches = mapSegmentMetaRows(rows);
      if (matches.length > 0 || loadNormalizedUnitRows(context).length === 0) {
        return {
          ok: true,
          name: 'search_units',
          result: {
            scope,
            query,
            count: matches.length,
            matches,
            _readModel: buildReadModelMetaWithSource(context, 'segment_meta'),
          },
        };
      }
    } catch {
      // fall through to timeline snapshot lookup
    }
  }

  if (query.length === 0) {
    const listFallback = await listUnits(context, args);
    return {
      ok: listFallback.ok,
      name: 'search_units',
      result: listFallback.ok
        ? {
          mode: 'list_fallback',
          ...(listFallback.result as Record<string, unknown>),
        }
        : listFallback.result,
      ...(listFallback.error ? { error: listFallback.error } : {}),
    };
  }

  const allRows = loadNormalizedUnitRows(context);
  if (allRows.length === 0) {
    return { ok: false, name: 'search_units', result: null, error: 'data_loading' };
  }
  const rows = filterRowsByScope(context, allRows, scope);
  if (rows.length === 0) {
    return {
      ok: true,
      name: 'search_units',
      result: {
        scope,
        query,
        count: 0,
        matches: [],
      },
    };
  }
  const lowered = query.toLowerCase();

  const matches = rows
    .filter((row) => row.transcription.toLowerCase().includes(lowered))
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, limit);

  return {
    ok: true,
    name: 'search_units',
    result: {
      scope,
      query,
      count: matches.length,
      matches,
    },
  };
}

function sortNormalizedUnitRows(rows: NormalizedUnitRow[], sort: 'time_asc' | 'time_desc'): NormalizedUnitRow[] {
  return [...rows].sort((a, b) => (sort === 'time_desc' ? b.startTime - a.startTime : a.startTime - b.startTime));
}

function buildListUnitsPageResult(
  context: AiPromptContext,
  rowsUnsorted: NormalizedUnitRow[],
  args: Record<string, unknown>,
  scope: LocalUnitScope,
  opts: { resultHandle?: string; snapshotPaging?: boolean; readModelSource?: AiLocalToolReadModelMeta['source'] },
): LocalContextToolResult {
  const limit = normalizeLimit(args.limit, 8);
  const offsetMax = opts.snapshotPaging || opts.resultHandle
    ? LIST_UNITS_SNAPSHOT_OFFSET_MAX
    : LIST_UNITS_DEFAULT_OFFSET_MAX;
  const offset = normalizeOffset(args.offset, 0, offsetMax);
  const sort = normalizeTextValue(args.sort).toLowerCase() === 'time_desc' ? 'time_desc' : 'time_asc';
  const normalized = sortNormalizedUnitRows(rowsUnsorted, sort);
  const matches = normalized.slice(offset, offset + limit);
  const expectedTotal = resolveExpectedTotalForScope(context, scope);
  if (typeof expectedTotal === 'number' && Number.isFinite(expectedTotal) && normalized.length !== expectedTotal) {
    if (import.meta.env.DEV) {
      console.warn('[timeline_unit_count_mismatch]', { tool: 'list_units', total: normalized.length, expectedTotal });
    }
    recordMetric({
      id: 'ai.timeline_unit_count_mismatch',
      value: 1,
      tags: createMetricTags('localContextTools', {
        source: 'list_units',
        scope,
        total: normalized.length,
        expectedTotal,
      }),
    });
  }

  const result: Record<string, unknown> = {
    scope,
    count: matches.length,
    total: normalized.length,
    offset,
    limit,
    sort,
    matches,
    ...(opts.readModelSource ? { _readModel: buildReadModelMetaWithSource(context, opts.readModelSource) } : {}),
  };
  if (opts.resultHandle) {
    result.resultHandle = opts.resultHandle;
  }
  if (opts.snapshotPaging) {
    result.snapshotPaging = true;
  }
  return {
    ok: true,
    name: 'list_units',
    result: result,
  };
}

async function listUnits(context: AiPromptContext, args: Record<string, unknown>): Promise<LocalContextToolResult> {
  let scope = normalizeUnitScope(args.scope, 'project');
  const handleArg = normalizeTextValue(args.resultHandle);
  if (handleArg.length > 0) {
    const entry = getListUnitsSnapshot(handleArg);
    if (!entry) {
      return { ok: false, name: 'list_units', result: null, error: 'invalid_or_expired_handle' };
    }
    scope = entry.scope ?? scope;
    const ctxEpoch = context.shortTerm?.timelineReadModelEpoch;
    if (
      typeof entry.epoch === 'number'
      && Number.isFinite(entry.epoch)
      && typeof ctxEpoch === 'number'
      && Number.isFinite(ctxEpoch)
      && entry.epoch !== ctxEpoch
    ) {
      return { ok: false, name: 'list_units', result: null, error: 'stale_list_handle' };
    }
    return buildListUnitsPageResult(context, entry.rows as NormalizedUnitRow[], args, scope, {
      resultHandle: handleArg,
      snapshotPaging: true,
    });
  }

  const scopedSegmentMetaRows = await loadScopedSegmentMetaRows(context, scope);
  if (scopedSegmentMetaRows && (scopedSegmentMetaRows.length > 0 || loadNormalizedUnitRows(context).length === 0)) {
    const rows = mapSegmentMetaRows(scopedSegmentMetaRows);
    return buildListUnitsPageResult(context, rows, args, scope, { readModelSource: 'segment_meta' });
  }

  const allRows = loadNormalizedUnitRows(context);
  if (allRows.length === 0) {
    return { ok: false, name: 'list_units', result: null, error: 'data_loading' };
  }
  const rows = filterRowsByScope(context, allRows, scope);
  if (rows.length === 0) {
    return buildListUnitsPageResult(context, rows, args, scope, {});
  }

  if (rows.length > LIST_UNITS_SNAPSHOT_ROW_THRESHOLD) {
    const epoch = context.shortTerm?.timelineReadModelEpoch;
    const newHandle = createListUnitsSnapshot(
      rows as ListUnitsSnapshotRow[],
      typeof epoch === 'number' && Number.isFinite(epoch) ? epoch : undefined,
      scope,
    );
    recordMetric({
      id: 'ai.list_units_snapshot_created',
      value: 1,
      tags: createMetricTags('localContextTools', {
        rowCount: rows.length,
      }),
    });
    return buildListUnitsPageResult(context, rows, args, scope, {
      resultHandle: newHandle,
      snapshotPaging: true,
    });
  }

  return buildListUnitsPageResult(context, rows, args, scope, {});
}

async function getUnitDetail(args: Record<string, unknown>, context: AiPromptContext): Promise<LocalContextToolResult> {
  const scope = normalizeUnitScope(args.scope, 'project');
  const unitId = normalizeTextValue(args.unitId);
  if (unitId.length === 0) {
    return {
      ok: false,
      name: 'get_unit_detail',
      result: null,
      error: 'unitId is required',
    };
  }

  const scopedSegmentMetaRows = await loadScopedSegmentMetaRows(context, scope);
  if (scopedSegmentMetaRows) {
    const hit = scopedSegmentMetaRows.find((row) => row.segmentId === unitId || row.id === unitId);
    if (hit) {
      return {
        ok: true,
        name: 'get_unit_detail',
        result: {
          scope,
          id: hit.segmentId,
          kind: hit.unitKind ?? 'segment',
          layerId: hit.layerId,
          textId: hit.textId,
          mediaId: hit.mediaId,
          startTime: hit.startTime,
          endTime: hit.endTime,
          ...(hit.effectiveSpeakerId ? { speakerId: hit.effectiveSpeakerId } : {}),
          ...(hit.annotationStatus ? { annotationStatus: hit.annotationStatus } : {}),
          transcription: hit.text,
          _readModel: buildReadModelMetaWithSource(context, 'segment_meta'),
        },
      };
    }
  }

  const localRows = normalizedUnitRowsFromContext(context);
  if (localRows) {
    const scopedRows = filterRowsByScope(context, localRows, scope);
    const hit = scopedRows.find((r) => r.id === unitId);
    if (hit) {
      return {
        ok: true,
        name: 'get_unit_detail',
        result: {
          scope,
          id: hit.id,
          kind: hit.kind,
          layerId: hit.layerId,
          textId: hit.textId,
          mediaId: hit.mediaId,
          startTime: hit.startTime,
          endTime: hit.endTime,
          speakerId: hit.speakerId,
          annotationStatus: hit.annotationStatus,
          transcription: hit.transcription,
        },
      };
    }
    if (scope !== 'project' && localRows.some((row) => row.id === unitId)) {
      return { ok: false, name: 'get_unit_detail', result: null, error: `unit not found in scope: ${scope}` };
    }
  }
  return { ok: false, name: 'get_unit_detail', result: null, error: `unit not found: ${unitId}` };
}

type LinguisticMemoryNoteTargetType = 'utterance' | 'translation' | 'token' | 'morpheme';

interface LinguisticMemoryNoteView {
  id: string;
  category?: string;
  content: Record<string, string>;
  updatedAt: string;
}

function mapLayerType(value: unknown): 'transcription' | 'translation' | 'unknown' {
  if (value === 'transcription' || value === 'translation') return value;
  return 'unknown';
}

function mapLinguisticMemoryNoteRows(rows: Array<Record<string, unknown>>): LinguisticMemoryNoteView[] {
  return rows
    .map((row) => {
      const content = row.content;
      if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
      return {
        id: String(row.id ?? ''),
        ...(typeof row.category === 'string' ? { category: row.category } : {}),
        content: content as Record<string, string>,
        updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
      };
    })
    .filter((row): row is LinguisticMemoryNoteView => row !== null)
    .sort((a, b) => {
      if (a.updatedAt === b.updatedAt) return a.id.localeCompare(b.id);
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
}

async function listNotesByTarget(
  db: Awaited<ReturnType<typeof getDb>>,
  targetType: LinguisticMemoryNoteTargetType,
  targetId: string,
): Promise<LinguisticMemoryNoteView[]> {
  if (targetId.trim().length === 0) return [];
  const rows = await db.dexie.user_notes.where('[targetType+targetId]').equals([targetType, targetId]).toArray();
  return mapLinguisticMemoryNoteRows(rows as unknown as Array<Record<string, unknown>>);
}

async function getUnitLinguisticMemory(args: Record<string, unknown>, context: AiPromptContext): Promise<LocalContextToolResult> {
  const scope = normalizeUnitScope(args.scope, 'project');
  const unitId = normalizeTextValue(args.unitId);
  if (unitId.length === 0) {
    return {
      ok: false,
      name: 'get_unit_linguistic_memory',
      result: null,
      error: 'unitId is required',
    };
  }

  const includeNotes = normalizeBoolean(args.includeNotes, true);
  const includeMorphemes = normalizeBoolean(args.includeMorphemes, true);
  const localRows = normalizedUnitRowsFromContext(context);
  const scopedRows = localRows ? filterRowsByScope(context, localRows, scope) : null;
  if (scope !== 'project' && localRows && scopedRows && !scopedRows.some((row) => row.id === unitId)) {
    return {
      ok: false,
      name: 'get_unit_linguistic_memory',
      result: null,
      error: `unit not found in scope: ${scope}`,
    };
  }
  const localHit = localRows?.find((row) => row.id === unitId);

  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch {
    return {
      ok: false,
      name: 'get_unit_linguistic_memory',
      result: null,
      error: 'database_unavailable',
    };
  }

  const [
    layerUnit,
    utteranceTexts,
    tokenRowsRaw,
    morphemeRowsRaw,
  ] = await Promise.all([
    db.dexie.layer_units.get(unitId),
    listUtteranceTextsByUtterance(db, unitId),
    db.dexie.utterance_tokens.where('unitId').equals(unitId).toArray(),
    includeMorphemes
      ? db.dexie.utterance_morphemes.where('unitId').equals(unitId).toArray()
      : Promise.resolve([]),
  ]);

  const hasAnyData = Boolean(
    localHit
    || layerUnit
    || utteranceTexts.length > 0
    || tokenRowsRaw.length > 0
    || morphemeRowsRaw.length > 0,
  );
  if (!hasAnyData) {
    return {
      ok: false,
      name: 'get_unit_linguistic_memory',
      result: null,
      error: `unit not found: ${unitId}`,
    };
  }

  const tokenRows = [...tokenRowsRaw].sort((a, b) => a.tokenIndex - b.tokenIndex);
  const morphemeRows = [...morphemeRowsRaw].sort((a, b) => {
    if (a.tokenId === b.tokenId) return a.morphemeIndex - b.morphemeIndex;
    return a.tokenId.localeCompare(b.tokenId);
  });

  const layerIds = [...new Set(utteranceTexts.map((row) => row.layerId).filter((id) => typeof id === 'string' && id.length > 0))];
  const layerRows = layerIds.length > 0
    ? (await db.collections.layers.findByIndexAnyOf('id', layerIds)).map((doc) => doc.toJSON())
    : [];
  const layerTypeById = new Map(
    layerRows.map((layer) => [layer.id, mapLayerType(layer.layerType)]),
  );

  const utteranceNotes = includeNotes
    ? await listNotesByTarget(db, 'utterance', unitId)
    : [];

  const translationNoteRows = includeNotes
    ? await Promise.all(
      utteranceTexts.map(async (row) => ({
        textId: row.id,
        notes: await listNotesByTarget(db, 'translation', row.id),
      })),
    )
    : [];
  const translationNotesByTextId = new Map(
    translationNoteRows.map((entry) => [entry.textId, entry.notes]),
  );

  const tokenNoteRows = includeNotes
    ? await Promise.all(
      tokenRows.map(async (row) => ({
        tokenId: row.id,
        notes: await listNotesByTarget(db, 'token', row.id),
      })),
    )
    : [];
  const tokenNotesById = new Map(tokenNoteRows.map((entry) => [entry.tokenId, entry.notes]));

  const morphemeNoteRows = includeNotes
    ? await Promise.all(
      morphemeRows.map(async (row) => ({
        morphemeId: row.id,
        notes: await listNotesByTarget(db, 'morpheme', row.id),
      })),
    )
    : [];
  const morphemeNotesById = new Map(morphemeNoteRows.map((entry) => [entry.morphemeId, entry.notes]));

  const morphemesByTokenId = new Map<string, Array<Record<string, unknown>>>();
  if (includeMorphemes) {
    for (const row of morphemeRows) {
      const list = morphemesByTokenId.get(row.tokenId) ?? [];
      list.push({
        id: row.id,
        morphemeIndex: row.morphemeIndex,
        form: row.form,
        ...(row.gloss !== undefined ? { gloss: row.gloss } : {}),
        ...(row.pos !== undefined ? { pos: row.pos } : {}),
        ...(row.lexemeId !== undefined ? { lexemeId: row.lexemeId } : {}),
        ...(includeNotes ? { notes: morphemeNotesById.get(row.id) ?? [] } : {}),
      });
      morphemesByTokenId.set(row.tokenId, list);
    }
  }

  const tokens = tokenRows.map((row) => ({
    id: row.id,
    tokenIndex: row.tokenIndex,
    form: row.form,
    ...(row.gloss !== undefined ? { gloss: row.gloss } : {}),
    ...(row.pos !== undefined ? { pos: row.pos } : {}),
    ...(row.lexemeId !== undefined ? { lexemeId: row.lexemeId } : {}),
    ...(includeNotes ? { notes: tokenNotesById.get(row.id) ?? [] } : {}),
    ...(includeMorphemes ? { morphemes: morphemesByTokenId.get(row.id) ?? [] } : {}),
  }));

  const layerTexts = utteranceTexts.map((row) => {
    const layerType = layerTypeById.get(row.layerId) ?? 'unknown';
    return {
      id: row.id,
      layerId: row.layerId,
      layerType,
      ...(row.text !== undefined ? { text: row.text } : {}),
      modality: row.modality,
      sourceType: row.sourceType,
      updatedAt: row.updatedAt,
      ...(includeNotes ? { notes: translationNotesByTextId.get(row.id) ?? [] } : {}),
    };
  });

  const transcriptions = layerTexts.filter((row) => row.layerType === 'transcription');
  const translations = layerTexts.filter((row) => row.layerType === 'translation');
  const fallbackTranscription = transcriptions.find((row) => typeof row.text === 'string' && row.text.trim().length > 0)?.text;

  const tokenWithPosCount = tokens.filter((row) => typeof row.pos === 'string' && row.pos.trim().length > 0).length;
  const tokenWithGlossCount = tokens.filter((row) => row.gloss !== undefined).length;
  const morphemeWithPosCount = includeMorphemes
    ? morphemeRows.filter((row) => typeof row.pos === 'string' && row.pos.trim().length > 0).length
    : 0;
  const morphemeWithGlossCount = includeMorphemes
    ? morphemeRows.filter((row) => row.gloss !== undefined).length
    : 0;

  return {
    ok: true,
    name: 'get_unit_linguistic_memory',
    result: {
      unit: {
        id: unitId,
        ...(localHit?.kind !== undefined
          ? { kind: localHit.kind }
          : layerUnit?.unitType !== undefined
            ? { kind: layerUnit.unitType }
            : {}),
        ...(localHit?.layerId !== undefined
          ? { layerId: localHit.layerId }
          : layerUnit?.layerId !== undefined
            ? { layerId: layerUnit.layerId }
            : {}),
        ...(localHit?.textId !== undefined
          ? { textId: localHit.textId }
          : layerUnit?.textId !== undefined
            ? { textId: layerUnit.textId }
            : {}),
        ...(localHit?.mediaId !== undefined
          ? { mediaId: localHit.mediaId }
          : layerUnit?.mediaId !== undefined
            ? { mediaId: layerUnit.mediaId }
            : {}),
        ...(localHit?.startTime !== undefined
          ? { startTime: localHit.startTime }
          : layerUnit?.startTime !== undefined
            ? { startTime: layerUnit.startTime }
            : {}),
        ...(localHit?.endTime !== undefined
          ? { endTime: localHit.endTime }
          : layerUnit?.endTime !== undefined
            ? { endTime: layerUnit.endTime }
            : {}),
        transcription: localHit?.transcription ?? fallbackTranscription ?? '',
        ...(localHit?.speakerId !== undefined ? { speakerId: localHit.speakerId } : {}),
        ...(localHit?.annotationStatus !== undefined ? { annotationStatus: localHit.annotationStatus } : {}),
        ...(includeNotes ? { notes: utteranceNotes } : {}),
      },
      sentence: {
        primaryTranscription: localHit?.transcription ?? fallbackTranscription ?? '',
        transcriptions,
        translations,
        layerTexts,
      },
      tokens,
      coverage: {
        translationCount: translations.length,
        tokenCount: tokens.length,
        tokenWithPosCount,
        tokenWithGlossCount,
        ...(includeMorphemes
          ? {
              morphemeCount: morphemeRows.length,
              morphemeWithPosCount,
              morphemeWithGlossCount,
            }
          : {}),
      },
      options: {
        scope,
        includeNotes,
        includeMorphemes,
      },
    },
  };
}

function attachReadModelToToolPayload(context: AiPromptContext, result: unknown): unknown {
  const meta = buildLocalToolReadModelMeta(context);
  if (result === null) {
    return { _readModel: meta };
  }
  if (typeof result !== 'object' || Array.isArray(result)) {
    return result;
  }
  const body = result as Record<string, unknown>;
  if (body._readModel !== undefined) {
    return result;
  }
  return { ...body, _readModel: meta };
}

function finalizeLocalContextToolResult(context: AiPromptContext, out: LocalContextToolResult): LocalContextToolResult {
  if (!out.ok) {
    return out;
  }
  return {
    ...out,
    result: attachReadModelToToolPayload(context, out.result),
  };
}

export async function executeLocalContextToolCall(
  call: LocalContextToolCall,
  context: AiPromptContext | null,
  callCountRef: { current: number },
  maxCalls = 20,
): Promise<LocalContextToolResult> {
  if (!context) {
    return {
      ok: false,
      name: call.name,
      result: null,
      error: 'context is unavailable',
    };
  }

  if (callCountRef.current >= maxCalls) {
    return {
      ok: false,
      name: call.name,
      result: null,
      error: 'local tool call limit exceeded',
    };
  }
  callCountRef.current += 1;

  let out: LocalContextToolResult;
  switch (call.name) {
    case 'get_current_selection': {
      const { localUnitIndex: _stripped, ...visibleShortTerm } = context.shortTerm ?? {};
      out = {
        ok: true,
        name: call.name,
        result: {
          ...visibleShortTerm,
          ...(context.longTerm?.projectStats?.unitCount !== undefined
            ? { projectUnitCount: context.longTerm.projectStats.unitCount }
            : context.longTerm?.projectStats?.utteranceCount !== undefined
              ? { projectUnitCount: context.longTerm.projectStats.utteranceCount }
              : {}),
        },
      };
      break;
    }
    case 'get_project_stats':
      out = await getProjectStats(context, call.arguments);
      break;
    case 'get_waveform_analysis':
      out = { ok: true, name: call.name, result: context.longTerm?.waveformAnalysis ?? null };
      break;
    case 'get_acoustic_summary':
      out = { ok: true, name: call.name, result: context.longTerm?.acousticSummary ?? null };
      break;
    case 'find_incomplete_units':
      out = { ok: true, name: call.name, result: findIncompleteUnits(context, call.arguments) };
      break;
    case 'diagnose_quality': {
      const snapshotResult = await diagnoseQualityWithSnapshots(context, call.arguments);
      out = snapshotResult ?? { ok: true, name: call.name, result: diagnoseQuality(context, call.arguments) };
      break;
    }
    case 'batch_apply':
      out = { ok: true, name: call.name, result: batchApply(context, call.arguments) };
      break;
    case 'suggest_next_action':
      out = { ok: true, name: call.name, result: suggestNextAction(context) };
      break;
    case 'list_units':
      out = {
        ...(await listUnits(context, call.arguments)),
        name: call.name,
      };
      break;
    case 'search_units':
      out = {
        ...(await searchUnits(context, call.arguments)),
        name: call.name,
      };
      break;
    case 'get_unit_detail':
      out = {
        ...(await getUnitDetail(call.arguments, context)),
        name: call.name,
      };
      break;
    case 'get_unit_linguistic_memory':
      out = {
        ...(await getUnitLinguisticMemory(call.arguments, context)),
        name: call.name,
      };
      break;
    default:
      return {
        ok: false,
        name: call.name,
        result: null,
        error: `unsupported local context tool: ${call.name}`,
      };
  }

  return finalizeLocalContextToolResult(context, out);
}

export async function executeLocalContextToolCallsBatch(
  calls: LocalContextToolCall[],
  context: AiPromptContext | null,
  callCountRef: { current: number },
  maxCalls = 20,
): Promise<LocalContextToolResult[]> {
  const results: LocalContextToolResult[] = [];
  for (const call of calls) {
    const result = await executeLocalContextToolCall(call, context, callCountRef, maxCalls);
    results.push(result);
  }
  return results;
}

/** @see AI_LOCAL_TOOL_RESULT_CHAR_BUDGET in `useAiChat.config.ts` */
export const LOCAL_TOOL_RESULT_CHAR_BUDGET = AI_LOCAL_TOOL_RESULT_CHAR_BUDGET;

const TOOL_RESULT_TRUNCATION_WARNING = '\n\nNote: some internal details were omitted because the result was too long. 如需更具体结果，请告诉我缩小查询范围。';

function applyLocalToolResultCharBudget(
  payload: string,
  meta: { scope: 'single' | 'batch' | 'agent_loop'; toolName?: string },
): { limitedPayload: string; truncated: boolean } {
  const truncated = payload.length > LOCAL_TOOL_RESULT_CHAR_BUDGET;
  if (truncated) {
    recordMetric({
      id: 'ai.local_tool_result_truncated',
      value: 1,
      tags: createMetricTags('localContextTools', {
        scope: meta.scope,
        ...(meta.toolName !== undefined ? { toolName: meta.toolName } : {}),
        payloadChars: payload.length,
      }),
    });
  }
  const limitedPayload = truncated
    ? `${payload.slice(0, LOCAL_TOOL_RESULT_CHAR_BUDGET)}...`
    : payload;
  return { limitedPayload, truncated };
}

function isZhLocale(locale?: string): boolean {
  return (locale ?? '').toLowerCase().startsWith('zh');
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isSpeakerCountQuestion(userText?: string): boolean {
  return /(speaker|speakers|说话人|发言人)/i.test(userText ?? '');
}

function humanizeScope(scope: unknown, locale?: string): string {
  const normalized = normalizeUnitScope(scope, 'project');
  const zh = isZhLocale(locale);
  switch (normalized) {
    case 'current_track':
      return zh ? '当前音频' : 'the current audio';
    case 'current_scope':
      return zh ? '当前范围' : 'the current scope';
    case 'project':
    default:
      return zh ? '整个项目' : 'the whole project';
  }
}

function summarizeCurrentSelectionResult(body: Record<string, unknown>, locale?: string, userText?: string): string {
  const zh = isZhLocale(locale);
  const currentTrackCount = asFiniteNumber(body.currentMediaUnitCount);
  const currentScopeCount = asFiniteNumber(body.currentScopeUnitCount);
  const projectCount = asFiniteNumber(body.projectUnitCount);

  if (isSpeakerCountQuestion(userText)) {
    const knownBits: string[] = [];
    if (currentTrackCount !== undefined) {
      knownBits.push(zh ? `当前音频里有 ${currentTrackCount} 条语段` : `the current audio has ${currentTrackCount} segments`);
    }
    if (projectCount !== undefined && projectCount !== currentTrackCount) {
      knownBits.push(zh ? `整个项目共有 ${projectCount} 条语段` : `the whole project has ${projectCount} segments`);
    }
    const knownSummary = knownBits.length > 0
      ? (zh ? `我先确认到这些上下文：${knownBits.join('；')}。` : `I confirmed this context first: ${knownBits.join('; ')}.`)
      : (zh ? '我先确认了当前上下文。' : 'I checked the current context first.');
    return zh
      ? `${knownSummary}不过这一步还没有直接的说话人统计。你是想问当前音频，还是整个项目的说话人数？`
      : `${knownSummary} This step does not include a direct speaker count yet. Do you mean the current audio or the whole project speaker count?`;
  }

  const details: string[] = [];
  if (currentTrackCount !== undefined) details.push(zh ? `当前音频共有 ${currentTrackCount} 条语段` : `${currentTrackCount} segments are on the current audio`);
  if (currentScopeCount !== undefined) details.push(zh ? `当前范围共有 ${currentScopeCount} 条语段` : `${currentScopeCount} segments are in the current scope`);
  if (projectCount !== undefined && projectCount !== currentTrackCount) details.push(zh ? `整个项目共有 ${projectCount} 条语段` : `${projectCount} segments exist in the whole project`);

  if (details.length === 0) {
    return zh ? '我已读取当前上下文。' : 'I checked the current context.';
  }
  return zh
    ? `我已读取当前上下文：${details.join('；')}。`
    : `I checked the current context: ${details.join('; ')}.`;
}

function summarizeProjectStatsResult(body: Record<string, unknown>, locale?: string, userText?: string): string {
  const zh = isZhLocale(locale);
  const scopeLabel = humanizeScope(body.scope, locale);
  const metric = normalizeProjectMetric(body.requestedMetric);
  const unitCount = asFiniteNumber(body.unitCount);
  const speakerCount = asFiniteNumber(body.speakerCount);
  const translationLayerCount = asFiniteNumber(body.translationLayerCount);
  const aiConfidenceAvg = typeof body.aiConfidenceAvg === 'number' && Number.isFinite(body.aiConfidenceAvg)
    ? body.aiConfidenceAvg
    : undefined;

  if (metric === 'speaker_count' || isSpeakerCountQuestion(userText)) {
    if (speakerCount !== undefined) {
      return zh
        ? `我查到${scopeLabel}共有 ${speakerCount} 位说话人。`
        : `I found ${speakerCount} speakers in ${scopeLabel}.`;
    }
    return zh
      ? `我已查看${scopeLabel}的统计，但目前还没有可直接确认的说话人人数。你可以告诉我是当前音频还是整个项目。`
      : `I checked the stats for ${scopeLabel}, but there is no confirmed speaker count yet. You can tell me whether you mean the current audio or the whole project.`;
  }

  if (metric === 'unit_count' && unitCount !== undefined) {
    return zh
      ? `${scopeLabel}目前共有 ${unitCount} 条语段。`
      : `${scopeLabel} currently has ${unitCount} segments.`;
  }

  if (metric === 'untranscribed_count') {
    const value = asFiniteNumber(body.value);
    if (value !== undefined) {
      return zh
        ? `${scopeLabel}还有 ${value} 条未转写语段。`
        : `There are ${value} untranscribed segments in ${scopeLabel}.`;
    }
  }

  if (metric === 'missing_speaker_count') {
    const value = asFiniteNumber(body.value);
    if (value !== undefined) {
      return zh
        ? `${scopeLabel}还有 ${value} 条语段缺少说话人。`
        : `There are ${value} segments missing speakers in ${scopeLabel}.`;
    }
  }

  const bits: string[] = [];
  if (speakerCount !== undefined) bits.push(zh ? `${speakerCount} 位说话人` : `${speakerCount} speakers`);
  if (unitCount !== undefined) bits.push(zh ? `${unitCount} 条语段` : `${unitCount} segments`);
  if (translationLayerCount !== undefined) bits.push(zh ? `${translationLayerCount} 个翻译层` : `${translationLayerCount} translation layers`);
  if (aiConfidenceAvg !== undefined) bits.push(zh ? `平均置信度 ${aiConfidenceAvg.toFixed(3)}` : `average confidence ${aiConfidenceAvg.toFixed(3)}`);

  if (bits.length === 0) {
    return zh ? `我已读取${scopeLabel}的统计信息。` : `I checked the stats for ${scopeLabel}.`;
  }
  return zh
    ? `我已读取${scopeLabel}的统计：${bits.join('，')}。`
    : `I checked the stats for ${scopeLabel}: ${bits.join(', ')}.`;
}

function summarizeListLikeResult(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  const body = asObjectRecord(result.result);
  const scopeLabel = humanizeScope(body?.scope, locale);
  const count = asFiniteNumber(body?.count) ?? asFiniteNumber(body?.total) ?? 0;
  const query = typeof body?.query === 'string' ? body.query.trim() : '';

  if (result.name === 'search_units' && query) {
    return zh
      ? `我在${scopeLabel}里找到了 ${count} 条与“${query}”相关的语段。`
      : `I found ${count} matching segments for “${query}” in ${scopeLabel}.`;
  }
  return zh
    ? `我已查看${scopeLabel}的语段，共找到 ${count} 条。`
    : `I checked the segments in ${scopeLabel} and found ${count}.`;
}

function summarizeDetailResult(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  const body = asObjectRecord(result.result);
  const unitId = typeof body?.id === 'string' ? body.id : '';
  const startTime = asFiniteNumber(body?.startTime);
  const endTime = asFiniteNumber(body?.endTime);
  const timeLabel = startTime !== undefined && endTime !== undefined
    ? `${startTime.toFixed(1)}s–${endTime.toFixed(1)}s`
    : '';
  if (result.name === 'get_unit_linguistic_memory') {
    const coverage = asObjectRecord(body?.coverage);
    const translationCount = asFiniteNumber(coverage?.translationCount) ?? 0;
    const tokenCount = asFiniteNumber(coverage?.tokenCount) ?? 0;
    return zh
      ? `我已读取语段 ${unitId || ''}${timeLabel ? `（${timeLabel}）` : ''} 的语言学信息，包含 ${translationCount} 条译文、${tokenCount} 个词项。`
      : `I loaded the linguistic details for segment ${unitId || ''}${timeLabel ? ` (${timeLabel})` : ''}, including ${translationCount} translations and ${tokenCount} tokens.`;
  }
  return zh
    ? `我已定位到语段 ${unitId || ''}${timeLabel ? `（${timeLabel}）` : ''}。`
    : `I located segment ${unitId || ''}${timeLabel ? ` (${timeLabel})` : ''}.`;
}

function isUntranscribedQuestion(userText?: string): boolean {
  return /(未转写|未完成转写|空文本|还没转写|还剩|剩余|unfinished|untranscribed|remaining)/i.test(userText ?? '');
}

function isMissingSpeakerQuestion(userText?: string): boolean {
  return /(缺少说话人|未标说话人|missing\s+speaker|speaker\s+missing)/i.test(userText ?? '');
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function findCategoryCount(body: Record<string, unknown>, category: string): number | undefined {
  const items = Array.isArray(body.items) ? body.items : [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (row.category === category) {
      return asFiniteNumber(row.count);
    }
  }
  return undefined;
}

function summarizeDiagnoseQualityResult(body: Record<string, unknown>, locale?: string, userText?: string): string {
  const zh = isZhLocale(locale);
  const meta = asObject(body.meta);
  const scopeLabel = humanizeScope(body.scope ?? meta?.scope, locale);
  const metric = normalizeProjectMetric(body.requestedMetric ?? meta?.requestedMetric);
  const breakdown = asObject(body.breakdown) ?? asObject(meta?.breakdown);
  const valueFromPayload = asFiniteNumber(body.value) ?? asFiniteNumber(meta?.value);
  const untranscribedCount = valueFromPayload
    ?? asFiniteNumber(breakdown?.emptyTextCount)
    ?? findCategoryCount(body, 'empty_text');
  const missingSpeakerCount = valueFromPayload
    ?? asFiniteNumber(breakdown?.missingSpeakerCount)
    ?? findCategoryCount(body, 'missing_speaker');

  if (metric === 'untranscribed_count' || (metric === undefined && isUntranscribedQuestion(userText))) {
    if (untranscribedCount !== undefined) {
      return zh
        ? `${scopeLabel}还有 ${untranscribedCount} 条未转写语段。`
        : `There are ${untranscribedCount} untranscribed segments in ${scopeLabel}.`;
    }
  }

  if (metric === 'missing_speaker_count' || (metric === undefined && isMissingSpeakerQuestion(userText))) {
    if (missingSpeakerCount !== undefined) {
      return zh
        ? `${scopeLabel}还有 ${missingSpeakerCount} 条语段缺少说话人。`
        : `There are ${missingSpeakerCount} segments missing speakers in ${scopeLabel}.`;
    }
  }

  const issueCount = asFiniteNumber(body.count) ?? 0;
  if (issueCount === 0) {
    return zh
      ? `${scopeLabel}目前没有明显质量问题。`
      : `There are no obvious quality issues in ${scopeLabel}.`;
  }
  return zh
    ? `我已检查${scopeLabel}的质量问题，共发现 ${issueCount} 类异常。`
    : `I checked quality issues in ${scopeLabel} and found ${issueCount} categories.`;
}

function summarizeLocalContextToolResult(
  result: LocalContextToolResult,
  locale?: string,
  userText?: string,
): string {
  const zh = isZhLocale(locale);
  if (!result.ok) {
    const reason = result.error ?? 'unknown_error';
    return zh
      ? `我尝试读取相关上下文，但这一步没有成功：${reason}。请再说明一下你想查询当前音频、当前范围，还是整个项目。`
      : `I tried to read the relevant context, but this step did not succeed: ${reason}. Please tell me whether you mean the current audio, the current scope, or the whole project.`;
  }

  const body = asObjectRecord(result.result);
  switch (result.name) {
    case 'get_current_selection':
      return summarizeCurrentSelectionResult(body ?? {}, locale, userText);
    case 'get_project_stats':
      return summarizeProjectStatsResult(body ?? {}, locale, userText);
    case 'list_units':
    case 'search_units':
      return summarizeListLikeResult(result, locale);
    case 'get_unit_detail':
    case 'get_unit_linguistic_memory':
      return summarizeDetailResult(result, locale);
    case 'diagnose_quality':
      return summarizeDiagnoseQualityResult(body ?? {}, locale, userText);
    case 'get_waveform_analysis':
      return zh ? '我已读取当前音频的波形分析信息。' : 'I checked the waveform analysis for the current audio.';
    case 'get_acoustic_summary':
      return zh ? '我已读取当前选中范围的声学摘要。' : 'I checked the acoustic summary for the current selection.';
    default:
      return zh ? '我已完成这一步本地查询。' : 'I completed this local lookup.';
  }
}

export function formatLocalContextToolResultMessage(
  result: LocalContextToolResult,
  locale: string = 'en-US',
  userText = '',
): string {
  const payload = result.ok
    ? JSON.stringify(result.result, null, 2)
    : JSON.stringify({ error: result.error ?? 'unknown_error', result: result.result }, null, 2);
  const { truncated } = applyLocalToolResultCharBudget(payload, {
    scope: 'single',
    toolName: result.name,
  });
  const summary = summarizeLocalContextToolResult(result, locale, userText);
  return truncated ? `${summary}${TOOL_RESULT_TRUNCATION_WARNING}` : summary;
}

export function formatLocalContextToolBatchResultMessage(
  results: LocalContextToolResult[],
  locale: string = 'en-US',
  userText = '',
): string {
  const payload = JSON.stringify(results, null, 2);
  const { truncated } = applyLocalToolResultCharBudget(payload, { scope: 'batch' });
  const zh = isZhLocale(locale);
  const successCount = results.filter((item) => item.ok).length;
  const failedCount = results.length - successCount;
  const detail = results
    .slice(0, 2)
    .map((item) => summarizeLocalContextToolResult(item, locale, userText).replace(/[。.]$/, ''))
    .join(zh ? '；' : '; ');
  let summary = zh
    ? `我已完成 ${results.length} 项本地查询${detail ? `：${detail}。` : '。'}`
    : `I completed ${results.length} local lookups${detail ? `: ${detail}.` : '.'}`;
  if (failedCount > 0) {
    summary += zh
      ? ` 其中 ${failedCount} 项还需要进一步确认。`
      : ` ${failedCount} of them still need clarification.`;
  }
  return truncated ? `${summary}${TOOL_RESULT_TRUNCATION_WARNING}` : summary;
}

function cloneLocalToolResultsForAgentLoop(results: LocalContextToolResult[]): LocalContextToolResult[] {
  return JSON.parse(JSON.stringify(results)) as LocalContextToolResult[];
}

function agentLoopContinuationPayloadJson(
  cappedUserRequest: string,
  results: LocalContextToolResult[],
  step: number,
): string {
  return JSON.stringify({
    type: 'local_tool_result',
    step,
    originalUserRequest: cappedUserRequest,
    results,
  });
}

function truncateMatchTranscriptionsForAgentLoop(results: LocalContextToolResult[]): boolean {
  let changed = false;
  for (const item of results) {
    if (!item.ok || item.result === null || typeof item.result !== 'object' || Array.isArray(item.result)) continue;
    const body = item.result as Record<string, unknown>;
    const matches = body.matches;
    if (!Array.isArray(matches)) continue;
    for (const m of matches) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      const row = m as Record<string, unknown>;
      const t = row.transcription;
      if (typeof t === 'string' && t.length > AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS) {
        row.transcription = `${t.slice(0, AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS)}…`;
        changed = true;
      }
    }
  }
  return changed;
}

function popLongestMatchesRowForAgentLoop(results: LocalContextToolResult[]): boolean {
  let bestIdx = -1;
  let bestLen = -1;
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i]!;
    if (!item.ok || item.result === null || typeof item.result !== 'object' || Array.isArray(item.result)) continue;
    const matches = (item.result as Record<string, unknown>).matches;
    if (Array.isArray(matches) && matches.length > bestLen) {
      bestLen = matches.length;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestLen <= 0) return false;
  const matches = (results[bestIdx]!.result as Record<string, unknown>).matches as unknown[];
  matches.pop();
  return true;
}

function truncateDeepStringsForAgentLoop(value: unknown, maxLen: number): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const el of value) truncateDeepStringsForAgentLoop(el, maxLen);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > maxLen) {
      obj[key] = `${v.slice(0, maxLen)}…`;
    } else {
      truncateDeepStringsForAgentLoop(v, maxLen);
    }
  }
}

/**
 * Fits `local_tool_result` JSON (agent loop continuation) under {@link LOCAL_TOOL_RESULT_CHAR_BUDGET}
 * while keeping valid JSON: trim `matches[].transcription`, drop tail `matches`, then deep-string trim.
 * Records `ai.local_tool_result_truncated` when any shrink was applied.
 */
export function buildAgentLoopContinuationToolPayload(
  originalUserText: string,
  localToolResults: LocalContextToolResult[],
  step: number,
  charBudget = LOCAL_TOOL_RESULT_CHAR_BUDGET,
): { payloadJson: string; truncated: boolean; originalPayloadChars: number; cappedUserRequest: string } {
  const cappedUserRequest = originalUserText.length <= AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS
    ? originalUserText
    : `${originalUserText.slice(0, AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS)}…`;
  const userRequestWasCapped = cappedUserRequest !== originalUserText;

  const working = cloneLocalToolResultsForAgentLoop(localToolResults);
  const originalPayloadChars = agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length;
  if (originalPayloadChars <= charBudget) {
    if (userRequestWasCapped) {
      recordMetric({
        id: 'ai.local_tool_result_truncated',
        value: 1,
        tags: createMetricTags('localContextTools', {
          scope: 'agent_loop',
          payloadChars: originalPayloadChars,
        }),
      });
    }
    return {
      payloadJson: agentLoopContinuationPayloadJson(cappedUserRequest, working, step),
      truncated: userRequestWasCapped,
      originalPayloadChars,
      cappedUserRequest,
    };
  }

  let truncated = userRequestWasCapped;
  let steps = 0;
  while (
    agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length > charBudget
    && steps < AI_AGENT_LOOP_PAYLOAD_SHRINK_MAX_STEPS
  ) {
    steps += 1;
    truncated = true;
    if (truncateMatchTranscriptionsForAgentLoop(working)) continue;
    if (popLongestMatchesRowForAgentLoop(working)) continue;
    break;
  }

  if (agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length > charBudget) {
    truncated = true;
    truncateDeepStringsForAgentLoop(working, AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS1);
  }
  if (agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length > charBudget) {
    truncateDeepStringsForAgentLoop(working, AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS2);
  }

  const finalJson = agentLoopContinuationPayloadJson(cappedUserRequest, working, step);
  if (finalJson.length > charBudget) {
    truncated = true;
    const minimal: LocalContextToolResult[] = working.map((r) => ({
      ok: r.ok,
      name: r.name,
      result: r.ok ? { _agentLoopPayloadTooLarge: true, tool: r.name } : r.result,
      ...(r.error !== undefined ? { error: r.error } : {}),
    }));
    const fallbackJson = agentLoopContinuationPayloadJson(cappedUserRequest, minimal, step);
    recordMetric({
      id: 'ai.local_tool_result_truncated',
      value: 1,
      tags: createMetricTags('localContextTools', {
        scope: 'agent_loop',
        payloadChars: originalPayloadChars,
      }),
    });
    return { payloadJson: fallbackJson, truncated, originalPayloadChars, cappedUserRequest };
  }

  if (truncated) {
    recordMetric({
      id: 'ai.local_tool_result_truncated',
      value: 1,
      tags: createMetricTags('localContextTools', {
        scope: 'agent_loop',
        payloadChars: originalPayloadChars,
      }),
    });
  }

  return { payloadJson: finalJson, truncated, originalPayloadChars, cappedUserRequest };
}

export function buildLocalContextToolGuide(): string {
  return [
    'Query tools (auto-executed, use freely even for questions — preferred over guessing):',
    '- Successful tool JSON includes `_readModel`: { timelineReadModelEpoch?, unitIndexComplete, capturedAtMs, indexRowCount? } — system metadata for snapshot freshness; do not treat as transcript content.',
    '- list_units(arguments:{"limit":8,"offset":0,"sort":"time_asc","scope":"current_scope|current_track|project","resultHandle":"..."}): Scoped list; returns {scope,total,count,offset,limit,sort,matches,_readModel}. When total rows exceed 50, response includes resultHandle + snapshotPaging:true — reuse the same resultHandle with offset/limit for additional pages until the handle expires (~15m) or timeline epoch changes (then stale_list_handle; call list_units again without resultHandle).',
    '- search_units(arguments:{"query":"...","limit":5,"scope":"current_scope|current_track|project","speakerId":"...","noteCategory":"todo|question|comment|correction|linguistic|fieldwork","selfCertainty":"certain|uncertain|guess","annotationStatus":"raw|transcribed|translated|glossed|verified","hasText":true}): Scoped search; for current_scope it prefers the segment_meta read model and supports structured filters. Returns {scope,query,count,matches,_readModel}; empty query without filters => {mode:"list_fallback",...,_readModel}',
    '- get_unit_detail(arguments:{"unitId":"...","scope":"current_scope|current_track|project"}): Scoped unit detail by id (+ `_readModel` on success)',
    '- get_unit_linguistic_memory(arguments:{"unitId":"...","scope":"current_scope|current_track|project","includeNotes":true,"includeMorphemes":true}): Deep per-unit memory snapshot (sentence transcriptions/translations + token/morpheme gloss/POS + annotation notes) (+ `_readModel` on success)',
    '- get_current_selection(arguments:{}): Current selection/track snapshot; includes currentScopeUnitCount/currentMediaUnitCount plus projectUnitCount baseline (+ `_readModel`)',
    '- get_project_stats(arguments:{}): Authoritative project-wide counts (e.g. units; + `_readModel`; stats fields unchanged). Prefer this (or list_units) when the user asks how many segments/units exist in the project.',
    '- get_waveform_analysis(arguments:{}): Current-track waveform quality summary; trackGaps are silence/gap regions on the analysis timeline, not project unit totals (+ `_readModel`)',
    '- get_acoustic_summary(arguments:{}): Current selection acoustic summary (+ `_readModel`)',
    '- find_incomplete_units(arguments:{"limit":12}): High-order query for units not yet verified (+ `_readModel`)',
    '- diagnose_quality(arguments:{}): Aggregated quality report for missing text/speaker/gaps (+ `_readModel`)',
    '- batch_apply(arguments:{"action":"...","unitIds":["..."]}): Batch preview contract for the same action across many units (+ `_readModel`)',
    '- suggest_next_action(arguments:{}): Ranked next-step recommendations from current project state (+ `_readModel`)',
    `- Tool JSON payloads may be truncated at ${LOCAL_TOOL_RESULT_CHAR_BUDGET} chars; treat omitted tail as unknown and do not fabricate missing values`,
  ].join('\n');
}
