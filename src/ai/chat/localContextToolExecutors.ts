import type { TimelineUnitView } from '../../hooks/timelineUnitView';
import type { AiLocalToolReadModelMeta, AiPromptContext } from './chatDomain.types';
import { batchApply, diagnoseQuality, findIncompleteUnits, suggestNextAction } from './intentTools';
import { dexieStoresForGetUnitLinguisticMemoryRead, getDb, type LayerUnitStatus, type NoteCategory, type SegmentMetaDocType, type UserNoteDocType } from '../../db';
import { listUnitTextsByUnit } from '../../services/LayerSegmentationTextService';
import { SegmentMetaService } from '../../services/SegmentMetaService';
import { WorkspaceReadModelService } from '../../services/WorkspaceReadModelService';
import { diagnoseProjectQuality, getSegmentDetail, listSegmentSummaries, type SegmentReadQueryScope, type SegmentSummary } from '../queries/segmentReadQueries';
import type { UnitSelfCertainty } from '../../utils/unitSelfCertainty';
import { generateTraceId, startAiTraceSpan } from '../../observability/aiTrace';
import { createLogger } from '../../observability/logger';
import { createMetricTags, recordMetric } from '../../observability/metrics';
import { buildLocalToolReadModelMeta } from './localContextToolReadModelMeta';
import { createListUnitsSnapshot, getListUnitsSnapshot, LIST_UNITS_SNAPSHOT_ROW_THRESHOLD, type ListUnitsSnapshotRow } from './localContextListUnitsSnapshotStore';
import type { LocalContextToolCall, LocalContextToolResult, LocalToolExecutionTraceOptions } from './localContextToolTypes';
import { normalizeProjectMetric, normalizeUnitScope, type LocalUnitScope } from './localContextToolScopeNormalize';

const log = createLogger('localContextTools');

function normalizeTextValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function tokenizeLocalSearchQuery(query: string): string[] {
  const lowered = query.trim().toLowerCase();
  if (!lowered) return [];
  const cjkChars = lowered.match(/[\u4e00-\u9fff]/g) ?? [];
  const latinWords = lowered.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2);
  return [...new Set([...cjkChars, ...latinWords])];
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

function normalizeLayerTypeFilter(value: unknown): 'transcription' | 'translation' | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'transcription' || normalized === 'translation') return normalized;
  return undefined;
}

function listLayers(context: AiPromptContext, args: Record<string, unknown>): LocalContextToolResult {
  const layerType = normalizeLayerTypeFilter(args.layerType);
  const layers = [...(context.shortTerm?.layerIndex ?? [])]
    .filter((layer) => !layerType || layer.layerType === layerType)
    .map((layer) => ({
      id: layer.id,
      ...(layer.key ? { key: layer.key } : {}),
      ...(layer.label ? { label: layer.label } : {}),
      ...(layer.layerType ? { layerType: layer.layerType } : {}),
      ...(layer.languageId ? { languageId: layer.languageId } : {}),
      ...(layer.modality ? { modality: layer.modality } : {}),
      ...(layer.textId ? { textId: layer.textId } : {}),
      ...(layer.treeHostLayerId ? { treeHostLayerId: layer.treeHostLayerId } : {}),
      ...(layer.constraint ? { constraint: layer.constraint } : {}),
      ...(typeof layer.unitCount === 'number' ? { unitCount: layer.unitCount } : {}),
      ...(layer.isSelected ? { isSelected: true } : {}),
      ...(layer.isActiveEditLayer ? { isActiveEditLayer: true } : {}),
      ...(layer.isDefaultTranscriptionLayer ? { isDefaultTranscriptionLayer: true } : {}),
    }));
  return {
    ok: true,
    name: 'list_layers',
    result: {
      count: layers.length,
      ...(layerType ? { layerType } : {}),
      layers,
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

function listLayerLinks(context: AiPromptContext): LocalContextToolResult {
  const links = [...(context.shortTerm?.layerLinkIndex ?? [])];
  return {
    ok: true,
    name: 'list_layer_links',
    result: {
      count: links.length,
      links,
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

function getUnsavedDrafts(context: AiPromptContext): LocalContextToolResult {
  const drafts = [...(context.shortTerm?.unsavedDrafts ?? [])];
  const unitDraftCount = drafts.filter((draft) => draft.draftType === 'unit').length;
  const translationDraftCount = drafts.filter((draft) => draft.draftType === 'translation').length;
  return {
    ok: true,
    name: 'get_unsaved_drafts',
    result: {
      count: drafts.length,
      unitDraftCount,
      translationDraftCount,
      drafts,
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

function listSpeakers(context: AiPromptContext): LocalContextToolResult {
  const speakers = [...(context.shortTerm?.speakerIndex ?? [])];
  return {
    ok: true,
    name: 'list_speakers',
    result: {
      count: speakers.length,
      speakers,
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

function listNotes(context: AiPromptContext): LocalContextToolResult {
  const summary = context.shortTerm?.noteSummary;
  const count = typeof summary?.count === 'number' && Number.isFinite(summary.count) ? summary.count : 0;
  return {
    ok: true,
    name: 'list_notes',
    result: {
      count,
      ...(summary?.byCategory ? { byCategory: summary.byCategory } : {}),
      ...(summary?.focusedLayerId ? { focusedLayerId: summary.focusedLayerId } : {}),
      ...(summary?.currentTargetUnitId ? { currentTargetUnitId: summary.currentTargetUnitId } : {}),
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

function getVisibleTimelineState(context: AiPromptContext): LocalContextToolResult {
  const state = context.shortTerm?.visibleTimelineState ?? {};
  return {
    ok: true,
    name: 'get_visible_timeline_state',
    result: {
      ...state,
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

function normalizeNotesDetailLimit(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(50, Math.max(1, Math.floor(value)));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(50, Math.max(1, Math.floor(parsed)));
    }
  }
  return 20;
}

function normalizeNoteCategoryFilter(value: unknown): NoteCategory | undefined {
  if (typeof value !== 'string') return undefined;
  const n = value.trim().toLowerCase() as NoteCategory;
  const allowed: NoteCategory[] = ['comment', 'question', 'todo', 'linguistic', 'fieldwork', 'correction'];
  return allowed.includes(n) ? n : undefined;
}

function firstNoteContentPreview(content: unknown, maxChars: number): string {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return '';
  const values = Object.values(content as Record<string, unknown>).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  const raw = (values[0] ?? '').trim();
  return raw.length > maxChars ? `${raw.slice(0, maxChars)}…` : raw;
}

function noteHostTargetId(note: UserNoteDocType): string | undefined {
  const rawValue = (note as unknown as Record<string, unknown>)[['par', 'entTargetId'].join('')];
  return typeof rawValue === 'string' && rawValue.trim().length > 0 ? rawValue : undefined;
}

function noteMatchesTimelineScope(
  note: UserNoteDocType,
  idSet: Set<string>,
  workspaceTextId: string,
): boolean {
  const { targetType, targetId } = note;
  const hostTargetId = noteHostTargetId(note);
  if (targetType === 'text') {
    return workspaceTextId.length > 0 && targetId === workspaceTextId;
  }
  if (targetType === 'unit' || targetType === 'translation') {
    return idSet.has(targetId);
  }
  if (targetType === 'tier_annotation') {
    if (hostTargetId && idSet.has(hostTargetId)) return true;
    const sep = targetId.indexOf('::');
    const core = sep >= 0 ? targetId.slice(0, sep) : targetId;
    return idSet.has(core);
  }
  if (targetType === 'token' || targetType === 'morpheme' || targetType === 'annotation') {
    if (hostTargetId && idSet.has(hostTargetId)) return true;
    return idSet.has(targetId);
  }
  if (targetType === 'lexeme' || targetType === 'sense') {
    return idSet.has(targetId);
  }
  return false;
}

function getSpeakerBreakdown(context: AiPromptContext, args: Record<string, unknown>): LocalContextToolResult {
  const scope = normalizeUnitScope(args.scope, 'current_track');
  const allRows = loadNormalizedUnitRows(context);
  if (allRows.length === 0) {
    return { ok: false, name: 'get_speaker_breakdown', result: null, error: 'data_loading' };
  }
  const scoped = filterRowsByScope(context, allRows, scope);
  const nameById = new Map(
    (context.shortTerm?.speakerIndex ?? []).map((s) => [s.id, (s.name ?? s.id).trim() || s.id]),
  );
  const UNLABELED = '__unlabeled__';
  const counts = new Map<string, number>();
  for (const row of scoped) {
    const sid = normalizeTextValue(row.speakerId);
    const key = sid.length > 0 ? sid : UNLABELED;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const breakdown = [...counts.entries()]
    .map(([speakerId, unitCount]) => {
      const unlabeled = speakerId === UNLABELED;
      return {
        ...(unlabeled ? {} : { speakerId }),
        displayName: unlabeled ? '(unlabeled)' : (nameById.get(speakerId) ?? speakerId),
        unitCount,
        ...(unlabeled ? { unlabeled: true as const } : {}),
      };
    })
    .sort((a, b) => b.unitCount - a.unitCount);

  return {
    ok: true,
    name: 'get_speaker_breakdown',
    result: {
      scope,
      totalRows: scoped.length,
      distinctLabeledSpeakers: breakdown.filter((row) => !('unlabeled' in row)).length,
      unlabeledRowCount: counts.get(UNLABELED) ?? 0,
      breakdown,
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

async function listNotesDetail(context: AiPromptContext, args: Record<string, unknown>): Promise<LocalContextToolResult> {
  const scope = normalizeUnitScope(args.scope, 'current_track');
  const limit = normalizeNotesDetailLimit(args.limit);
  const categoryFilter = normalizeNoteCategoryFilter(args.category);

  const allRowsFromIndex = loadNormalizedUnitRows(context);
  let scoped: NormalizedUnitRow[];
  let readModelSource: NonNullable<AiLocalToolReadModelMeta['source']> = 'timeline_index';

  if (allRowsFromIndex.length > 0) {
    scoped = filterRowsByScope(context, allRowsFromIndex, scope);
  } else {
    const scopedSegmentMetaRows = await loadScopedSegmentMetaRows(context, scope);
    if (scopedSegmentMetaRows && (scopedSegmentMetaRows.length > 0 || allRowsFromIndex.length === 0)) {
      scoped = mapSegmentMetaRows(scopedSegmentMetaRows);
      readModelSource = 'segment_meta';
    } else {
      return { ok: false, name: 'list_notes_detail', result: null, error: 'data_loading' };
    }
  }

  const workspaceTextId = normalizeTextValue(context.shortTerm?.workspaceTextId);
  let scopedForNotes = scoped;
  if (workspaceTextId.length > 0) {
    scopedForNotes = scoped.filter((row) => {
      const tid = normalizeTextValue(row.textId);
      return tid.length === 0 || tid === workspaceTextId;
    });
  }
  const idSet = new Set(scopedForNotes.map((row) => row.id));

  let fetched: UserNoteDocType[];
  try {
    const db = await getDb();
    fetched = await db.dexie.user_notes.orderBy('updatedAt').reverse().limit(800).toArray();
  } catch {
    return { ok: false, name: 'list_notes_detail', result: null, error: 'notes_read_failed' };
  }

  const notes: Array<{
    id: string;
    targetType: string;
    targetId: string;
    hostTargetId?: string;
    category?: NoteCategory;
    updatedAt: string;
    contentPreview: string;
  }> = [];

  for (const note of fetched) {
    if (!noteMatchesTimelineScope(note, idSet, workspaceTextId)) continue;
    if (categoryFilter && (note.category ?? 'comment') !== categoryFilter) continue;
    const hostTargetId = noteHostTargetId(note);
    notes.push({
      id: note.id,
      targetType: note.targetType,
      targetId: note.targetId,
      ...(hostTargetId ? { hostTargetId } : {}),
      ...(note.category ? { category: note.category } : {}),
      updatedAt: note.updatedAt,
      contentPreview: firstNoteContentPreview(note.content, 120),
    });
    if (notes.length >= limit) break;
  }

  return {
    ok: true,
    name: 'list_notes_detail',
    result: {
      scope,
      limit,
      ...(categoryFilter ? { category: categoryFilter } : {}),
      count: notes.length,
      notes,
      _readModel: buildReadModelMetaWithSource(context, readModelSource),
    },
  };
}

function timelineViewsToNormalizedRows(views: ReadonlyArray<TimelineUnitView>): NormalizedUnitRow[] {
  return views.map((row) => {
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
      const byLayer = context.shortTerm?.timelineUnitsByLayerId;
      const bucket = byLayer?.get(selectedLayerId);
      if (bucket && bucket.length > 0) {
        let views = [...bucket];
        if (currentMediaId.length > 0) {
          views = views.filter((u) => normalizeTextValue(u.mediaId) === currentMediaId);
        }
        return timelineViewsToNormalizedRows(views);
      }
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
  kind: 'unit' | 'segment';
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

/** scope 解析结果 | Resolved segment_meta scope params */
type SegmentMetaScopeResolution =
  | { kind: 'layer_media'; layerId: string; mediaId: string }
  | { kind: 'media'; mediaId: string }
  | { kind: 'all' };

function resolveSegmentMetaScopeParams(
  context: AiPromptContext,
  scope: LocalUnitScope,
): SegmentMetaScopeResolution | null {
  if (scope === 'current_scope') {
    const mediaId = normalizeTextValue(context.shortTerm?.currentMediaId);
    const storageLayer = normalizeTextValue(context.shortTerm?.segmentMetaStorageLayerId);
    const displayLayer = normalizeTextValue(context.shortTerm?.selectedLayerId);
    const layerId = storageLayer.length > 0 ? storageLayer : displayLayer;
    if (layerId.length === 0 || mediaId.length === 0) return null;
    return { kind: 'layer_media', layerId, mediaId };
  }
  if (scope === 'current_track') {
    const mediaId = normalizeTextValue(context.shortTerm?.currentMediaId);
    if (mediaId.length === 0) return null;
    return { kind: 'media', mediaId };
  }
  // project scope — 全量查询 | full table
  return { kind: 'all' };
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

function resolveSegmentReadQueryScope(
  context: AiPromptContext,
  scope: LocalUnitScope,
): SegmentReadQueryScope | null {
  const base = resolveSegmentMetaScopeParams(context, scope);
  if (!base) return null;
  const textId = resolveContextTextId(context);
  if (base.kind === 'layer_media') {
    return {
      ...(textId ? { textId } : {}),
      mediaId: base.mediaId,
      layerId: base.layerId,
    };
  }
  if (base.kind === 'media') {
    return {
      ...(textId ? { textId } : {}),
      mediaId: base.mediaId,
    };
  }
  return {
    ...(textId ? { textId } : {}),
  };
}

function mapSegmentSummariesToRows(rows: readonly SegmentSummary[]): SegmentMetaDocType[] {
  return rows.map((row) => ({
    id: `${row.layerId}::${row.id}`,
    segmentId: row.id,
    unitKind: row.kind as Exclude<SegmentMetaDocType['unitKind'], undefined>,
    textId: row.textId ?? '',
    mediaId: row.mediaId ?? '',
    layerId: row.layerId,
    startTime: row.startTime,
    endTime: row.endTime,
    text: row.transcription,
    normalizedText: row.transcription.toLowerCase(),
    hasText: row.transcription.trim().length > 0,
    ...(row.speakerId ? { effectiveSpeakerId: row.speakerId } : {}),
    ...(row.annotationStatus ? { annotationStatus: row.annotationStatus as Exclude<SegmentMetaDocType['annotationStatus'], undefined> } : {}),
    createdAt: '',
    updatedAt: '',
  }));
}

async function listAllSegmentSummariesForScope(scope: SegmentReadQueryScope): Promise<SegmentSummary[]> {
  const pageSize = 100;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  const rows: SegmentSummary[] = [];

  while (offset < total) {
    const page = await listSegmentSummaries(scope, pageSize, offset);
    total = page.total;
    if (page.segments.length === 0) break;
    rows.push(...page.segments);
    offset += page.segments.length;
  }

  return rows;
}

async function loadScopedSegmentMetaRows(
  context: AiPromptContext,
  scope: LocalUnitScope,
): Promise<SegmentMetaDocType[] | null> {
  const queryScope = resolveSegmentReadQueryScope(context, scope);
  if (queryScope) {
    try {
      const summaries = await listAllSegmentSummariesForScope(queryScope);
      return mapSegmentSummariesToRows(summaries);
    } catch {
      // fall through to legacy SegmentMetaService path
    }
  }

  const resolution = resolveSegmentMetaScopeParams(context, scope);
  if (!resolution) return null;
  try {
    if (resolution.kind === 'layer_media') {
      // current_scope: rebuild 保证新鲜度，回退到 list | rebuild for freshness, fallback to list
      try {
        return await SegmentMetaService.rebuildForLayerMedia(resolution.layerId, resolution.mediaId);
      } catch {
        try {
          return await SegmentMetaService.listByLayerMedia(resolution.layerId, resolution.mediaId);
        } catch {
          return null;
        }
      }
    }
    if (resolution.kind === 'media') {
      return await SegmentMetaService.listByMediaId(resolution.mediaId);
    }
    // kind === 'all' — project scope
    return await SegmentMetaService.listAll();
  } catch {
    return null;
  }
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

/**
 * segment_meta 优先路径：查找未完成语段 | Snapshot-first path for finding incomplete units
 */
async function findIncompleteUnitsWithSnapshots(
  context: AiPromptContext,
  args: Record<string, unknown>,
): Promise<LocalContextToolResult | null> {
  const rows = await loadScopedSegmentMetaRows(context, 'current_scope');
  if (!rows || rows.length === 0) return null;

  const limit = typeof args.limit === 'number' && Number.isFinite(args.limit)
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
    status: row.annotationStatus?.trim().toLowerCase()
      || (row.hasText ? 'transcribed' : 'raw'),
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
      suggestion: items.length > 0
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
async function batchApplyWithSnapshots(
  context: AiPromptContext,
  args: Record<string, unknown>,
): Promise<LocalContextToolResult | null> {
  const rows = await loadScopedSegmentMetaRows(context, 'current_scope');
  if (!rows || rows.length === 0) return null;

  const rawIds = Array.isArray(args.unitIds) ? args.unitIds.filter((item): item is string => typeof item === 'string') : [];
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
      suggestion: items.length > 0
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
    const facadeDiagnosis = await diagnoseProjectQuality(resolveSegmentReadQueryScope(context, scope) ?? { textId })
      .catch(() => null);
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
      if (segmentMetaScope.kind === 'layer_media') {
        await SegmentMetaService.rebuildForLayerMedia(segmentMetaScope.layerId, segmentMetaScope.mediaId);
      }
      const rows = await SegmentMetaService.searchSegmentMeta({
        ...(segmentMetaScope.kind === 'layer_media' ? { layerId: segmentMetaScope.layerId, mediaId: segmentMetaScope.mediaId } : {}),
        ...(segmentMetaScope.kind === 'media' ? { mediaId: segmentMetaScope.mediaId } : {}),
        ...(query.length > 0 ? { query } : {}),
        ...(speakerId ? { speakerId } : {}),
        ...(noteCategory ? { noteCategory: noteCategory as NoteCategory } : {}),
        ...(selfCertainty ? { selfCertainty: selfCertainty as UnitSelfCertainty } : {}),
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
  const tokens = tokenizeLocalSearchQuery(query);

  const scoredMatches = rows
    .map((row) => {
      const text = row.transcription.toLowerCase();
      if (!text) return null;
      const phraseHit = text.includes(lowered);
      const tokenHitCount = tokens.reduce((count, token) => (text.includes(token) ? count + 1 : count), 0);
      if (!phraseHit && tokenHitCount === 0) return null;
      const tokenScore = tokens.length > 0 ? tokenHitCount / tokens.length : 0;
      const score = (phraseHit ? 1 : 0) + tokenScore;
      return { row, score };
    })
    .filter((item): item is { row: NormalizedUnitRow; score: number } => item !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.row.startTime - b.row.startTime;
    })
    .slice(0, limit);

  const matches = scoredMatches.map((item) => item.row);

  return {
    ok: true,
    name: 'search_units',
    result: {
      scope,
      query,
      count: matches.length,
      matches,
      ranking: {
        strategy: 'hybrid_local',
      },
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
      log.warn('timeline unit count mismatch', { tool: 'list_units', total: normalized.length, expectedTotal });
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

  const queryScope = resolveSegmentReadQueryScope(context, scope);
  if (queryScope) {
    try {
      const detail = await getSegmentDetail(unitId, queryScope);
      if (detail) {
        return {
          ok: true,
          name: 'get_unit_detail',
          result: {
            scope,
            id: detail.id,
            kind: detail.kind,
            layerId: detail.layerId,
            ...(detail.textId ? { textId: detail.textId } : {}),
            ...(detail.mediaId ? { mediaId: detail.mediaId } : {}),
            startTime: detail.startTime,
            endTime: detail.endTime,
            ...(detail.speakerId ? { speakerId: detail.speakerId } : {}),
            ...(detail.annotationStatus ? { annotationStatus: detail.annotationStatus } : {}),
            transcription: detail.transcription,
            ...(detail.layers ? { layers: detail.layers } : {}),
            ...(detail.annotations ? { annotations: detail.annotations } : {}),
            ...(detail.translations ? { translations: detail.translations } : {}),
            _readModel: buildReadModelMetaWithSource(context, 'segment_meta'),
          },
        };
      }
    } catch {
      // fall through to legacy local/query paths
    }
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

type LinguisticMemoryNoteTargetType = 'unit' | 'translation' | 'token' | 'morpheme';

interface LinguisticMemoryNoteView {
  id: string;
  category?: string;
  content: Record<string, string>;
  updatedAt: string;
}

interface LinguisticMemoryLayerRow {
  id: string;
  layerType?: unknown;
  contentType?: unknown;
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

  const {
    layerUnit,
    unitTexts,
    tokenRowsRaw,
    morphemeRowsRaw,
    layerRows,
    unitNotes,
    translationNoteRows,
    tokenNoteRows,
    morphemeNoteRows,
  } = await db.dexie.transaction(
    'r',
    [...dexieStoresForGetUnitLinguisticMemoryRead(db)],
    async () => {
      const [
        layerUnit,
        unitTexts,
        tokenRowsRaw,
        morphemeRowsRaw,
      ] = await Promise.all([
        db.dexie.layer_units.get(unitId),
        listUnitTextsByUnit(db, unitId),
        db.dexie.unit_tokens.where('unitId').equals(unitId).toArray(),
        includeMorphemes
          ? db.dexie.unit_morphemes.where('unitId').equals(unitId).toArray()
          : Promise.resolve([]),
      ]);

      const layerIds = [...new Set(
        unitTexts
          .map((row) => row.layerId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      )];

      const [layerRows, unitNotes, translationNoteRows, tokenNoteRows, morphemeNoteRows]: [
        LinguisticMemoryLayerRow[],
        LinguisticMemoryNoteView[],
        Array<{ textId: string; notes: LinguisticMemoryNoteView[] }>,
        Array<{ tokenId: string; notes: LinguisticMemoryNoteView[] }>,
        Array<{ morphemeId: string; notes: LinguisticMemoryNoteView[] }>,
      ] = await Promise.all([
        layerIds.length > 0
          ? db.dexie.tier_definitions.where('id').anyOf(layerIds).toArray() as Promise<LinguisticMemoryLayerRow[]>
          : Promise.resolve<LinguisticMemoryLayerRow[]>([]),
        includeNotes ? listNotesByTarget(db, 'unit', unitId) : Promise.resolve<LinguisticMemoryNoteView[]>([]),
        includeNotes
          ? Promise.all(
            unitTexts.map(async (row) => ({
              textId: row.id,
              notes: await listNotesByTarget(db, 'translation', row.id),
            })),
          )
          : Promise.resolve<Array<{ textId: string; notes: LinguisticMemoryNoteView[] }>>([]),
        includeNotes
          ? Promise.all(
            tokenRowsRaw.map(async (row) => ({
              tokenId: row.id,
              notes: await listNotesByTarget(db, 'token', row.id),
            })),
          )
          : Promise.resolve<Array<{ tokenId: string; notes: LinguisticMemoryNoteView[] }>>([]),
        includeNotes
          ? Promise.all(
            morphemeRowsRaw.map(async (row) => ({
              morphemeId: row.id,
              notes: await listNotesByTarget(db, 'morpheme', row.id),
            })),
          )
          : Promise.resolve<Array<{ morphemeId: string; notes: LinguisticMemoryNoteView[] }>>([]),
      ]);

      return {
        layerUnit,
        unitTexts,
        tokenRowsRaw,
        morphemeRowsRaw,
        layerRows,
        unitNotes,
        translationNoteRows,
        tokenNoteRows,
        morphemeNoteRows,
      };
    },
  );

  const hasAnyData = Boolean(
    localHit
    || layerUnit
    || unitTexts.length > 0
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

  const layerTypeById = new Map(
    layerRows.map((layer) => [layer.id, mapLayerType(layer.layerType ?? layer.contentType)]),
  );

  const translationNotesByTextId = new Map(
    translationNoteRows.map((entry) => [entry.textId, entry.notes]),
  );

  const tokenNotesById = new Map(
    tokenNoteRows.map((entry) => [entry.tokenId, entry.notes]),
  );

  const morphemeNotesById = new Map(
    morphemeNoteRows.map((entry) => [entry.morphemeId, entry.notes]),
  );

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

  const layerTexts = unitTexts.map((row) => {
    const layerId = row.layerId ?? '';
    const layerType = layerTypeById.get(layerId) ?? 'unknown';
    return {
      id: row.id,
      layerId,
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
        ...(includeNotes ? { notes: unitNotes } : {}),
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

function buildAcousticUnavailablePayload(localeHint?: string): Record<string, unknown> {
  const zh = (localeHint ?? '').toLowerCase().startsWith('zh');
  return {
    ok: false,
    reason: 'no_playable_media',
    message: zh
      ? '当前没有可播放媒体，无法提供声学分析结果。'
      : 'No playable media is available, so acoustic analysis is unavailable.',
  };
}

export async function executeLocalContextToolCall(
  call: LocalContextToolCall,
  context: AiPromptContext | null,
  callCountRef: { current: number },
  maxCalls = 20,
  traceOptions?: LocalToolExecutionTraceOptions,
): Promise<LocalContextToolResult> {
  const traceId = traceOptions?.traceId ?? generateTraceId();
  const toolSpan = startAiTraceSpan({
    kind: 'tool-execution',
    traceId,
    tags: createMetricTags('localContextTools', {
      toolName: call.name,
      ...(traceOptions?.step !== undefined ? { step: traceOptions.step } : {}),
    }),
  });

  if (!context) {
    const out = {
      ok: false,
      name: call.name,
      result: null,
      error: 'context is unavailable',
    };
    toolSpan.endWithError(out.error);
    return out;
  }

  if (callCountRef.current >= maxCalls) {
    const out = {
      ok: false,
      name: call.name,
      result: null,
      error: 'local tool call limit exceeded',
    };
    toolSpan.endWithError(out.error);
    return out;
  }
  callCountRef.current += 1;

  let out: LocalContextToolResult;
  try {
    switch (call.name) {
      case 'get_current_selection': {
        const {
          localUnitIndex: _stripped,
          timelineUnitsByLayerId: _timelineByLayer,
          layerIndex: _layerIndex,
          layerLinkIndex: _layerLinkIndex,
          unsavedDrafts: _unsavedDrafts,
          ...visibleShortTerm
        } = context.shortTerm ?? {};
        out = {
          ok: true,
          name: call.name,
          result: {
            ...visibleShortTerm,
            ...(context.longTerm?.projectStats?.unitCount !== undefined
              ? { projectUnitCount: context.longTerm.projectStats.unitCount }
              : context.longTerm?.projectStats?.unitCount !== undefined
                ? { projectUnitCount: context.longTerm.projectStats.unitCount }
                : {}),
          },
        };
        break;
      }
      case 'list_layers':
        out = listLayers(context, call.arguments);
        break;
      case 'list_layer_links':
        out = listLayerLinks(context);
        break;
      case 'get_unsaved_drafts':
        out = getUnsavedDrafts(context);
        break;
      case 'list_speakers':
        out = listSpeakers(context);
        break;
      case 'list_notes':
        out = listNotes(context);
        break;
      case 'list_notes_detail':
        out = await listNotesDetail(context, call.arguments);
        break;
      case 'get_visible_timeline_state':
        out = getVisibleTimelineState(context);
        break;
      case 'get_speaker_breakdown':
        out = getSpeakerBreakdown(context, call.arguments);
        break;
      case 'get_project_stats':
        out = await getProjectStats(context, call.arguments);
        break;
      case 'get_waveform_analysis': {
        const waveformAnalysis = context.longTerm?.waveformAnalysis;
        out = {
          ok: true,
          name: call.name,
          result: waveformAnalysis ?? buildAcousticUnavailablePayload(context.shortTerm?.locale),
        };
        break;
      }
      case 'get_acoustic_summary': {
        const acousticSummary = context.longTerm?.acousticSummary;
        out = {
          ok: true,
          name: call.name,
          result: acousticSummary ?? buildAcousticUnavailablePayload(context.shortTerm?.locale),
        };
        break;
      }
      case 'find_incomplete_units': {
        const snapshotIncomplete = await findIncompleteUnitsWithSnapshots(context, call.arguments);
        out = snapshotIncomplete ?? { ok: true, name: call.name, result: findIncompleteUnits(context, call.arguments) };
        break;
      }
      case 'diagnose_quality': {
        const snapshotResult = await diagnoseQualityWithSnapshots(context, call.arguments);
        out = snapshotResult ?? { ok: true, name: call.name, result: diagnoseQuality(context, call.arguments) };
        break;
      }
      case 'batch_apply': {
        const snapshotBatch = await batchApplyWithSnapshots(context, call.arguments);
        out = snapshotBatch ?? { ok: true, name: call.name, result: batchApply(context, call.arguments) };
        break;
      }
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
        out = {
          ok: false,
          name: call.name,
          result: null,
          error: `unsupported local context tool: ${call.name}`,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toolSpan.endWithError(message);
    throw error;
  }

  const finalized = finalizeLocalContextToolResult(context, out);
  if (finalized.ok) {
    toolSpan.end();
  } else {
    toolSpan.endWithError(finalized.error ?? 'local context tool failed');
  }
  return finalized;
}
