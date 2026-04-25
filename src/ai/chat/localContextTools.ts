import type { TimelineUnitView } from '../../hooks/timelineUnitView';
import type { AiLocalToolReadModelMeta, AiPromptContext } from './chatDomain.types';
import { extractJsonCandidates } from './toolCallSchemas';
import { batchApply, diagnoseQuality, findIncompleteUnits, suggestNextAction } from './intentTools';
import { dexieStoresForGetUnitLinguisticMemoryRead, getDb, type LayerUnitStatus, type NoteCategory, type SegmentMetaDocType, type UserNoteDocType } from '../../db';
import { listUnitTextsByUnit } from '../../services/LayerSegmentationTextService';
import { SegmentMetaService } from '../../services/SegmentMetaService';
import { WorkspaceReadModelService } from '../../services/WorkspaceReadModelService';
import type { UnitSelfCertainty } from '../../utils/unitSelfCertainty';
import { AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS1, AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS2, AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS, AI_AGENT_LOOP_PAYLOAD_SHRINK_MAX_STEPS, AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS, AI_LOCAL_TOOL_RESULT_CHAR_BUDGET } from '../../hooks/useAiChat.config';
import { generateTraceId, startAiTraceSpan } from '../../observability/aiTrace';
import { createMetricTags, recordMetric } from '../../observability/metrics';
import { buildLocalToolReadModelMeta } from './localContextToolReadModelMeta';
import { createListUnitsSnapshot, getListUnitsSnapshot, LIST_UNITS_SNAPSHOT_ROW_THRESHOLD, type ListUnitsSnapshotRow } from './localContextListUnitsSnapshotStore';

export type LocalContextToolName =
  | 'get_current_selection'
  | 'list_layers'
  | 'list_layer_links'
  | 'get_unsaved_drafts'
  | 'list_speakers'
  | 'list_notes'
  | 'list_notes_detail'
  | 'get_visible_timeline_state'
  | 'get_speaker_breakdown'
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

export interface LocalToolExecutionTraceOptions {
  traceId?: string;
  step?: number;
}

const LOCAL_CONTEXT_TOOL_NAMES = new Set<LocalContextToolName>([
  'get_current_selection',
  'list_layers',
  'list_layer_links',
  'get_unsaved_drafts',
  'list_speakers',
  'list_notes',
  'list_notes_detail',
  'get_visible_timeline_state',
  'get_speaker_breakdown',
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

function normalizeToolName(name: string): LocalContextToolName | null {
  const normalized = name.trim().toLowerCase();
  if (LOCAL_CONTEXT_TOOL_NAMES.has(normalized as LocalContextToolName)) {
    return normalized as LocalContextToolName;
  }
  return null;
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
          const rawArgs = holder.arguments;
          const args = typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
            ? rawArgs as Record<string, unknown>
            : {};
          parsedCalls.push({ name: normalized, arguments: args });
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
  return {
    name: normalized,
    arguments: candidate.arguments,
  };
}

export function parseLocalContextToolCallsFromText(rawText: string): LocalContextToolCall[] {
  return toToolCallCandidates(rawText);
}

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

async function loadScopedSegmentMetaRows(
  context: AiPromptContext,
  scope: LocalUnitScope,
): Promise<SegmentMetaDocType[] | null> {
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
  const zh = isZhLocale(localeHint);
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

export async function executeLocalContextToolCallsBatch(
  calls: LocalContextToolCall[],
  context: AiPromptContext | null,
  callCountRef: { current: number },
  maxCalls = 20,
  traceOptions?: LocalToolExecutionTraceOptions,
): Promise<LocalContextToolResult[]> {
  const results: LocalContextToolResult[] = [];
  const traceId = traceOptions?.traceId ?? generateTraceId();
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index]!;
    const result = await executeLocalContextToolCall(
      call,
      context,
      callCountRef,
      maxCalls,
      {
        traceId,
        step: traceOptions?.step !== undefined ? traceOptions.step + index : index + 1,
      },
    );
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
  const requestedMetricRaw = typeof body.requestedMetric === 'string' ? body.requestedMetric : '';
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

  if (zh) {
    const conclusion = requestedMetricRaw === 'speaker_count' && speakerCount !== undefined
      ? `${scopeLabel}共有 ${speakerCount} 位说话人。`
      : metric === 'unit_count' && unitCount !== undefined
        ? `${scopeLabel}共有 ${unitCount} 条语段。`
        : metric === 'translation_layer_count' && translationLayerCount !== undefined
          ? `${scopeLabel}共有 ${translationLayerCount} 个翻译层。`
          : metric === 'ai_confidence_avg' && aiConfidenceAvg !== undefined
            ? `${scopeLabel}平均置信度为 ${aiConfidenceAvg.toFixed(3)}。`
            : `${scopeLabel}统计已读取。`;
    const evidenceBits: string[] = [];
    if (unitCount !== undefined) evidenceBits.push(`语段数 ${unitCount}`);
    if (speakerCount !== undefined) evidenceBits.push(`说话人数 ${speakerCount}`);
    if (translationLayerCount !== undefined) evidenceBits.push(`翻译层 ${translationLayerCount}`);
    if (aiConfidenceAvg !== undefined) evidenceBits.push(`平均置信度 ${aiConfidenceAvg.toFixed(3)}`);
    const readModel = asObject(body._readModel);
    const isComplete = readModel?.unitIndexComplete === true;
    const uncertainty = isComplete
      ? '当前读模型快照完整，暂无明显不确定项。'
      : '当前读模型可能未完全同步，建议在最新范围下复查一次。';
    const nextStep = requestedMetricRaw === 'speaker_count'
      ? '如需细分，请继续问“按说话人分别有多少条语段”。'
      : '如需深入，请继续问“按说话人/层级细分统计”。';
    return [
      `结论：${conclusion}`,
      `证据：${evidenceBits.length > 0 ? evidenceBits.join('，') : '暂无可结构化统计字段。'}`,
      `范围：${scopeLabel}。`,
      `不确定项：${uncertainty}`,
      `建议下一步：${nextStep}`,
    ].join('\n');
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
    case 'list_layers': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh ? `我已读取当前工作区层清单，共 ${count} 个层。` : `I checked the workspace layer list: ${count} layers.`;
    }
    case 'list_layer_links': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh ? `我已读取层链接关系，共 ${count} 条链接。` : `I checked layer links: ${count} links.`;
    }
    case 'get_unsaved_drafts': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh ? `我已读取当前未保存草稿，共 ${count} 条。` : `I checked current unsaved drafts: ${count}.`;
    }
    case 'list_speakers': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh ? `我已读取当前说话人清单，共 ${count} 位。` : `I checked the speaker list: ${count} speakers.`;
    }
    case 'list_notes': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh ? `我已读取当前笔记摘要，共 ${count} 条。` : `I checked note summary: ${count} notes.`;
    }
    case 'list_notes_detail': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh ? `我已读取范围内最近笔记明细，共 ${count} 条。` : `I checked recent scoped notes: ${count} entries.`;
    }
    case 'get_visible_timeline_state':
      return zh ? '我已读取当前可见时间轴状态。' : 'I checked the current visible timeline state.';
    case 'get_speaker_breakdown': {
      const total = asFiniteNumber(body?.totalRows);
      return zh
        ? `我已按说话人汇总语段行数${total !== undefined ? `（共 ${total} 行）` : ''}。`
        : `I summarized per-speaker row counts${total !== undefined ? ` (${total} rows)` : ''}.`;
    }
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
    case 'get_waveform_analysis': {
      const unavailable = body?.ok === false && body?.reason === 'no_playable_media';
      if (unavailable) {
        return zh
          ? '当前没有可播放媒体，暂时无法读取波形分析信息。'
          : 'There is no playable media right now, so waveform analysis is unavailable.';
      }
      return zh ? '我已读取当前音频的波形分析信息。' : 'I checked the waveform analysis for the current audio.';
    }
    case 'get_acoustic_summary': {
      const unavailable = body?.ok === false && body?.reason === 'no_playable_media';
      if (unavailable) {
        return zh
          ? '当前没有可播放媒体，暂时无法读取声学摘要。'
          : 'There is no playable media right now, so the acoustic summary is unavailable.';
      }
      return zh ? '我已读取当前选中范围的声学摘要。' : 'I checked the acoustic summary for the current selection.';
    }
    default:
      return zh ? '我已完成这一步本地查询。' : 'I completed this local lookup.';
  }
}

function previewPlainText(value: unknown, maxChars = 48): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}…` : trimmed;
}

function joinStructuredBits(bits: string[], locale?: string): string {
  const zh = isZhLocale(locale);
  return bits.length > 0
    ? bits.join(zh ? '；' : '; ')
    : (zh ? '当前没有额外的结构化证据。' : 'There is no additional structured evidence in this result.');
}

function buildLocalToolEvidenceText(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  const body = asObjectRecord(result.result);
  if (!body) {
    return zh ? '当前结果没有返回结构化字段。' : 'The current result did not return structured fields.';
  }

  const bits: string[] = [];
  const scopeLabel = result.name === 'get_current_selection'
    ? (zh ? '当前上下文' : 'current context')
    : humanizeScope(body.scope, locale);

  switch (result.name) {
    case 'get_project_stats': {
      const unitCount = asFiniteNumber(body.unitCount);
      const speakerCount = asFiniteNumber(body.speakerCount);
      const translationLayerCount = asFiniteNumber(body.translationLayerCount);
      const value = asFiniteNumber(body.value);
      if (speakerCount !== undefined) bits.push(zh ? `${speakerCount} 位说话人` : `${speakerCount} speakers`);
      if (unitCount !== undefined) bits.push(zh ? `${unitCount} 条语段` : `${unitCount} segments`);
      if (translationLayerCount !== undefined) bits.push(zh ? `${translationLayerCount} 个翻译层` : `${translationLayerCount} translation layers`);
      if (value !== undefined && value !== unitCount && value !== speakerCount && value !== translationLayerCount) {
        bits.push(zh ? `目标指标值 ${value}` : `target metric value ${value}`);
      }
      break;
    }
    case 'list_layers': {
      const count = asFiniteNumber(body.count);
      const layers = Array.isArray(body.layers) ? body.layers : [];
      if (count !== undefined) bits.push(zh ? `${count} 个层` : `${count} layers`);
      const selected = layers.find((item) => item && typeof item === 'object' && !Array.isArray(item) && (item as Record<string, unknown>).isSelected === true);
      if (selected && typeof selected === 'object' && !Array.isArray(selected)) {
        const row = selected as Record<string, unknown>;
        const label = previewPlainText(row.label ?? row.key ?? row.id);
        if (label) bits.push(zh ? `当前选中层 ${label}` : `selected layer ${label}`);
      }
      break;
    }
    case 'list_layer_links': {
      const count = asFiniteNumber(body.count);
      if (count !== undefined) bits.push(zh ? `${count} 条层链接` : `${count} layer links`);
      const links = Array.isArray(body.links) ? body.links : [];
      const preferredCount = links.filter((item) => item && typeof item === 'object' && !Array.isArray(item) && (item as Record<string, unknown>).isPreferred === true).length;
      if (preferredCount > 0) bits.push(zh ? `${preferredCount} 条首选链接` : `${preferredCount} preferred links`);
      break;
    }
    case 'get_unsaved_drafts': {
      const count = asFiniteNumber(body.count);
      const unitDraftCount = asFiniteNumber(body.unitDraftCount);
      const translationDraftCount = asFiniteNumber(body.translationDraftCount);
      if (count !== undefined) bits.push(zh ? `${count} 条未保存草稿` : `${count} unsaved drafts`);
      if (unitDraftCount !== undefined) bits.push(zh ? `转写/语段草稿 ${unitDraftCount}` : `${unitDraftCount} unit drafts`);
      if (translationDraftCount !== undefined) bits.push(zh ? `译文草稿 ${translationDraftCount}` : `${translationDraftCount} translation drafts`);
      break;
    }
    case 'list_speakers': {
      const count = asFiniteNumber(body.count);
      if (count !== undefined) bits.push(zh ? `${count} 位说话人` : `${count} speakers`);
      const speakers = Array.isArray(body.speakers) ? body.speakers : [];
      const first = speakers[0];
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        const row = first as Record<string, unknown>;
        const name = previewPlainText(row.name ?? row.id);
        if (name) bits.push(zh ? `示例 ${name}` : `example ${name}`);
      }
      break;
    }
    case 'list_notes': {
      const count = asFiniteNumber(body.count);
      if (count !== undefined) bits.push(zh ? `${count} 条笔记` : `${count} notes`);
      const byCategory = asObject(body.byCategory);
      if (byCategory) {
        const top = Object.entries(byCategory).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
        if (top && Number.isFinite(Number(top[1]))) {
          bits.push(zh ? `最多类别 ${top[0]}=${top[1]}` : `top category ${top[0]}=${top[1]}`);
        }
      }
      break;
    }
    case 'list_notes_detail': {
      const count = asFiniteNumber(body.count);
      if (count !== undefined) bits.push(zh ? `${count} 条明细` : `${count} detail rows`);
      const notes = Array.isArray(body.notes) ? body.notes : [];
      const first = notes[0];
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        const row = first as Record<string, unknown>;
        const preview = previewPlainText(row.contentPreview);
        const cat = previewPlainText(row.category);
        if (preview || cat) {
          bits.push(zh ? `最新 ${cat || 'note'}：${preview || '…'}` : `latest ${cat || 'note'}: ${preview || '…'}`);
        }
      }
      break;
    }
    case 'get_visible_timeline_state': {
      const mediaFilename = previewPlainText(body.currentMediaFilename);
      const focusedLayerId = previewPlainText(body.focusedLayerId);
      const selectedUnitCount = asFiniteNumber(body.selectedUnitCount);
      if (mediaFilename) bits.push(zh ? `当前媒体 ${mediaFilename}` : `current media ${mediaFilename}`);
      if (focusedLayerId) bits.push(zh ? `焦点层 ${focusedLayerId}` : `focused layer ${focusedLayerId}`);
      if (selectedUnitCount !== undefined) bits.push(zh ? `已选 ${selectedUnitCount} 条` : `${selectedUnitCount} selected`);
      const zoomPercent = asFiniteNumber(body.zoomPercent);
      if (zoomPercent !== undefined) bits.push(zh ? `缩放 ${zoomPercent}%` : `zoom ${zoomPercent}%`);
      break;
    }
    case 'get_speaker_breakdown': {
      const distinct = asFiniteNumber(body.distinctLabeledSpeakers);
      const unlabeled = asFiniteNumber(body.unlabeledRowCount);
      if (distinct !== undefined) bits.push(zh ? `已标注说话人 ${distinct} 位` : `${distinct} labeled speakers`);
      if (unlabeled !== undefined && unlabeled > 0) {
        bits.push(zh ? `未标注 ${unlabeled} 行` : `${unlabeled} unlabeled rows`);
      }
      const breakdown = Array.isArray(body.breakdown) ? body.breakdown : [];
      const top = breakdown[0];
      if (top && typeof top === 'object' && !Array.isArray(top)) {
        const row = top as Record<string, unknown>;
        const label = previewPlainText(row.displayName);
        const n = asFiniteNumber(row.unitCount);
        if (label && n !== undefined) bits.push(zh ? `最多 ${label} ${n} 行` : `top ${label} ${n} rows`);
      }
      break;
    }
    case 'list_units':
    case 'search_units': {
      const count = asFiniteNumber(body.count) ?? asFiniteNumber(body.total);
      if (count !== undefined) bits.push(zh ? `${scopeLabel}命中 ${count} 条` : `${count} matches in ${scopeLabel}`);
      const matches = Array.isArray(body.matches) ? body.matches : [];
      const first = matches[0];
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        const row = first as Record<string, unknown>;
        const firstId = typeof row.id === 'string' ? row.id : '';
        const textPreview = previewPlainText(row.transcription ?? row.text);
        if (firstId || textPreview) {
          bits.push(zh
            ? `示例 ${firstId || '首条'}${textPreview ? `：${textPreview}` : ''}`
            : `example ${firstId || 'first item'}${textPreview ? `: ${textPreview}` : ''}`);
        }
      }
      break;
    }
    case 'get_unit_detail': {
      const unitId = typeof body.id === 'string' ? body.id : '';
      const startTime = asFiniteNumber(body.startTime);
      const endTime = asFiniteNumber(body.endTime);
      const transcription = previewPlainText(body.transcription);
      if (unitId) bits.push(zh ? `语段 ID ${unitId}` : `segment ID ${unitId}`);
      if (startTime !== undefined && endTime !== undefined) {
        bits.push(zh ? `时间 ${startTime.toFixed(1)}s–${endTime.toFixed(1)}s` : `time ${startTime.toFixed(1)}s–${endTime.toFixed(1)}s`);
      }
      if (transcription) bits.push(zh ? `文本“${transcription}”` : `text “${transcription}”`);
      break;
    }
    case 'get_unit_linguistic_memory': {
      const coverage = asObject(body.coverage);
      const tokenCount = asFiniteNumber(coverage?.tokenCount);
      const translationCount = asFiniteNumber(coverage?.translationCount);
      if (translationCount !== undefined) bits.push(zh ? `${translationCount} 条译文` : `${translationCount} translations`);
      if (tokenCount !== undefined) bits.push(zh ? `${tokenCount} 个词项` : `${tokenCount} tokens`);
      break;
    }
    case 'diagnose_quality': {
      const count = asFiniteNumber(body.count);
      const breakdown = asObject(body.breakdown) ?? asObject(asObject(body.meta)?.breakdown);
      const emptyTextCount = asFiniteNumber(breakdown?.emptyTextCount);
      const missingSpeakerCount = asFiniteNumber(breakdown?.missingSpeakerCount);
      const completionRate = asFiniteNumber(body.completionRate) ?? asFiniteNumber(asObject(body.meta)?.completionRate);
      if (count !== undefined) bits.push(zh ? `${count} 类质量问题` : `${count} quality issue categories`);
      if (emptyTextCount !== undefined) bits.push(zh ? `${emptyTextCount} 条未转写` : `${emptyTextCount} untranscribed`);
      if (missingSpeakerCount !== undefined) bits.push(zh ? `${missingSpeakerCount} 条缺少说话人` : `${missingSpeakerCount} missing speakers`);
      if (completionRate !== undefined) bits.push(zh ? `完成率 ${(completionRate * 100).toFixed(1)}%` : `completion ${(completionRate * 100).toFixed(1)}%`);
      break;
    }
    case 'get_current_selection': {
      const currentScopeUnitCount = asFiniteNumber(body.currentScopeUnitCount);
      const currentMediaUnitCount = asFiniteNumber(body.currentMediaUnitCount);
      const projectUnitCount = asFiniteNumber(body.projectUnitCount);
      if (currentScopeUnitCount !== undefined) bits.push(zh ? `当前范围 ${currentScopeUnitCount} 条` : `${currentScopeUnitCount} segments in the current scope`);
      if (currentMediaUnitCount !== undefined) bits.push(zh ? `当前音频 ${currentMediaUnitCount} 条` : `${currentMediaUnitCount} segments in the current audio`);
      if (projectUnitCount !== undefined) bits.push(zh ? `整个项目 ${projectUnitCount} 条` : `${projectUnitCount} segments in the whole project`);
      break;
    }
    default:
      bits.push(zh ? `已完成 ${scopeLabel} 的本地读取` : `local read completed for ${scopeLabel}`);
      break;
  }

  const readModel = asObject(body._readModel);
  const source = typeof readModel?.source === 'string' ? readModel.source.trim() : '';
  if (source) {
    bits.push(zh ? `读取来源 ${source}` : `read source ${source}`);
  }

  return joinStructuredBits(bits, locale);
}

function buildLocalToolScopeText(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  const body = asObjectRecord(result.result);
  if (result.name === 'get_current_selection') {
    return zh ? '当前上下文（选区、当前音频与项目级状态）。' : 'Current context (selection, current audio, and project-level state).';
  }
  return zh
    ? `本次查询范围：${humanizeScope(body?.scope, locale)}。`
    : `This query used ${humanizeScope(body?.scope, locale)}.`;
}

function buildLocalToolUncertaintyText(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  if (!result.ok) {
    const reason = result.error ?? 'unknown_error';
    return zh
      ? `这一步尚未成功，错误原因为 ${reason}。`
      : `This step did not complete successfully. Reported reason: ${reason}.`;
  }

  const body = asObjectRecord(result.result);
  const readModel = asObject(body?._readModel);
  if (readModel?.unitIndexComplete === false) {
    return zh
      ? '当前时间轴索引仍在加载，数量类结果可能偏少。'
      : 'The timeline index is still loading, so count-like results may be low.';
  }
  if (result.name === 'search_units' || result.name === 'list_units') {
    const count = asFiniteNumber(body?.count) ?? 0;
    if (count === 0) {
      return zh
        ? '本次没有命中结果，可能是关键词过窄，或当前范围内确实为空。'
        : 'This lookup returned no hits; the keyword may be narrow, or the current scope may truly be empty.';
    }
  }
  if (result.name === 'get_project_stats' && asFiniteNumber(body?.speakerCount) === undefined) {
    return zh
      ? '说话人数依赖已标注的说话人信息；未标注部分不会被计入。'
      : 'Speaker counts depend on existing speaker labels; unlabeled items are not counted.';
  }
  return zh
    ? '当前结果基于本地快照；如果你刚修改过内容，我可以继续复核明细。'
    : 'This answer is based on the local snapshot; if you edited content just now, I can re-check the details.';
}

function buildLocalToolNextStepText(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  switch (result.name) {
    case 'get_project_stats':
    case 'diagnose_quality':
      return zh
        ? '我可以继续列出具体语段、缺失项，或只看当前范围。'
        : 'I can next list the exact segments, the missing items, or narrow this to the current scope.';
    case 'list_units':
    case 'search_units':
      return zh
        ? '告诉我第几个语段或直接给语段 ID，我就继续展开详情。'
        : 'Tell me which segment number or ID you want, and I can open the details.';
    case 'get_unit_detail':
    case 'get_unit_linguistic_memory':
      return zh
        ? '如果需要，我可以继续查看译文、词法标注或相关质量问题。'
        : 'If needed, I can continue with translations, linguistic annotations, or related quality issues.';
    case 'get_current_selection':
      return zh
        ? '你可以继续指定想看的指标，例如语段数、说话人数或缺失项。'
        : 'You can now name the exact metric you want, such as segment count, speaker count, or missing items.';
    case 'list_layers':
      return zh
        ? '我可以继续查看层链接、每层语段，或未保存草稿。'
        : 'I can next check layer links, per-layer segments, or unsaved drafts.';
    case 'list_layer_links':
      return zh
        ? '我可以继续按翻译层列出宿主关系，或检查孤儿/首选链接。'
        : 'I can next list host relationships by translation layer or check orphan/preferred links.';
    case 'get_unsaved_drafts':
      return zh
        ? '我可以继续定位这些草稿对应的语段或层。'
        : 'I can next locate the segment or layer for these drafts.';
    case 'list_speakers':
      return zh
        ? '我可以继续按说话人统计语段，或只看当前媒体。'
        : 'I can next break down segments by speaker or scope this to the current media.';
    case 'list_notes':
      return zh
        ? '我可以继续展开各类别笔记，或定位到当前焦点语段。'
        : 'I can next expand note categories or locate the focused target unit.';
    case 'get_visible_timeline_state':
      return zh
        ? '我可以继续按当前焦点层/选区读取更细的语段详情。'
        : 'I can next read finer segment details for the focused layer or current selection.';
    case 'list_notes_detail':
      return zh
        ? '如果需要，我可以按语段 ID 展开单条笔记或改用摘要统计。'
        : 'If needed, I can open a single note by segment ID or switch back to the summary counts.';
    case 'get_speaker_breakdown':
      return zh
        ? '我可以继续列出某一说话人的具体语段，或切换到整个项目的语段列表。'
        : 'I can next list concrete segments for one speaker, or switch to a project-wide segment list.';
    default:
      return zh ? '告诉我你想继续到哪一步，我会沿着当前结果往下做。' : 'Tell me the next step you want, and I will continue from this result.';
  }
}

function formatStructuredLocalToolAnswer(
  result: LocalContextToolResult,
  locale: string,
  userText: string,
): string {
  const zh = isZhLocale(locale);
  const summary = summarizeLocalContextToolResult(result, locale, userText);
  const sections = [
    `${zh ? '结论：' : 'Conclusion: '}${summary}`,
    `${zh ? '证据：' : 'Evidence: '}${buildLocalToolEvidenceText(result, locale)}`,
    `${zh ? '范围：' : 'Scope: '}${buildLocalToolScopeText(result, locale)}`,
    `${zh ? '不确定项：' : 'Uncertainty: '}${buildLocalToolUncertaintyText(result, locale)}`,
    `${zh ? '建议下一步：' : 'Suggested next step: '}${buildLocalToolNextStepText(result, locale)}`,
  ];
  return sections.join('\n');
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
  const summary = formatStructuredLocalToolAnswer(result, locale, userText);
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
  const evidence = results
    .slice(0, 2)
    .map((item) => summarizeLocalContextToolResult(item, locale, userText).replace(/[。.]$/, ''))
    .join(zh ? '；' : '; ');
  const scopeLabels = Array.from(new Set(results.map((item) => {
    const body = asObjectRecord(item.result);
    return item.name === 'get_current_selection'
      ? (zh ? '当前上下文' : 'current context')
      : humanizeScope(body?.scope, locale);
  })));
  const summary = [
    `${zh ? '结论：' : 'Conclusion: '}${zh ? `已完成 ${results.length} 项本地查询，其中成功 ${successCount} 项。` : `Completed ${results.length} local lookups, with ${successCount} successful.`}`,
    `${zh ? '证据：' : 'Evidence: '}${evidence || (zh ? '当前批次没有返回更多细节。' : 'This batch did not return extra detail.')}`,
    `${zh ? '范围：' : 'Scope: '}${scopeLabels.join(zh ? '、' : ', ')}`,
    `${zh ? '不确定项：' : 'Uncertainty: '}${failedCount > 0
      ? (zh ? `仍有 ${failedCount} 项需要进一步澄清或重试。` : `${failedCount} items still need clarification or retry.`)
      : (zh ? '当前批次未发现明显冲突。' : 'No obvious conflict was found in this batch.')}`,
    `${zh ? '建议下一步：' : 'Suggested next step: '}${failedCount > 0
      ? (zh ? '先缩小范围或补充关键词，我可以继续处理失败项。' : 'First narrow the scope or add a keyword, and I can continue with the failed items.')
      : (zh ? '如果需要，我可以继续展开某一项的详情。' : 'If needed, I can now expand the details of any one result.')}`,
  ].join('\n');
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
    '- list_layers(arguments:{"layerType":"transcription|translation"}): Structured workspace layer list with ids, labels, language/modality, selected/active/default flags, and per-layer row counts (+ `_readModel`)',
    '- list_layer_links(arguments:{}): Translation/transcription host link list; use when users ask which translation layer is connected to which transcription layer (+ `_readModel`)',
    '- get_unsaved_drafts(arguments:{}): Unsaved unit/translation drafts currently visible in the workspace; use when users ask whether new edits are visible before save (+ `_readModel`)',
    '- list_speakers(arguments:{}): Current speaker list in workspace context; returns ids/names/colors when available (+ `_readModel`)',
    '- list_notes(arguments:{}): Current note summary (count, category histogram, focused layer/target hints) for visible context (+ `_readModel`)',
    '- list_notes_detail(arguments:{"limit":20,"scope":"current_scope|current_track|project","category":"todo|question|comment|correction|linguistic|fieldwork"}): Recent `user_notes` rows tied to timeline units in scope (newest first; capped scan). When `localUnitIndex` is empty, uses the same scoped `segment_meta` path as `list_units` for ids, then `_readModel.source` is `segment_meta`. (+ `_readModel`)',
    '- get_visible_timeline_state(arguments:{}): Visible timeline state snapshot (media, layers, selection, layout mode, zoom/ruler sample, speaker filter/track-lock hints) (+ `_readModel`)',
    '- get_speaker_breakdown(arguments:{"scope":"current_scope|current_track|project"}): Per-speaker row counts from the timeline read model for the requested scope (+ `_readModel`)',
    '- get_project_stats(arguments:{}): Authoritative project-wide counts (e.g. units; + `_readModel`; stats fields unchanged). Prefer this (or list_units) when the user asks how many segments/units exist in the project.',
    '- get_waveform_analysis(arguments:{}): Current-track waveform quality summary; trackGaps are silence/gap regions on the analysis timeline, not project unit totals (+ `_readModel`)',
    '- get_acoustic_summary(arguments:{}): Current selection acoustic summary (+ `_readModel`)',
    '- find_incomplete_units(arguments:{"limit":12}): High-order query for units not yet verified (+ `_readModel`)',
    '- diagnose_quality(arguments:{}): Aggregated quality report for missing text/speaker/gaps (+ `_readModel`)',
    '- batch_apply(arguments:{"action":"...","unitIds":["..."]}): Batch preview contract for the same action across many units (+ `_readModel`)',
    '- suggest_next_action(arguments:{}): Ranked next-step recommendations from current project state (+ `_readModel`)',
    `- Tool JSON payloads may be truncated at ${LOCAL_TOOL_RESULT_CHAR_BUDGET} chars; treat omitted tail as unknown and do not fabricate missing values`,
    '- User-facing natural language: never echo the snake_case tool names above; describe actions in the user\'s language. JSON tool_call names stay machine-only.',
    '- Query economy: if the last local tool JSON already answered the same scope/params, do not issue an equivalent read again unless [CONTEXT] changed, the prior payload was truncated, or you need a strictly different field.',
    '- If the user quoted exact text, ids, or times for set_transcription_text/set_translation_text/etc., copy them verbatim into tool_call arguments.',
  ].join('\n');
}
