import type {
  AiPromptContext,
  AiPromptDraftSnapshot,
  AiPromptLayerLinkSnapshot,
  AiPromptLayerSnapshot,
  AiPromptNoteSummary,
  AiPromptSpeakerSnapshot,
  AiPromptVisibleTimelineState,
} from '../hooks/useAiChat';
import type { TimelineUnitView, TimelineUnitViewIndex } from '../hooks/timelineUnitView';
import type { TranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';
import type { WaveformAnalysisPromptSummary } from '../utils/waveformAnalysisOverlays';
import type { AcousticPromptSummary } from './transcriptionAcousticSummary';
import { buildWorldModelSnapshot } from '../ai/chat/worldModelSnapshot';
import type { LayerDocType } from './transcriptionAiController.types';
import { resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';

export type { AcousticDiagnosticKey, AcousticPromptSummary } from './transcriptionAcousticSummary';

interface MediaItemPromptInput {
  id: string;
  filename: string;
}

interface UnitTimelineEntry {
  id: string;
  startTime: number;
  endTime: number;
  transcription?: string;
}

const TIMELINE_MAX_CHARS = 800;
const TIMELINE_TEXT_TRUNCATE = 30;

export function buildUnitTimelineDigest(units: UnitTimelineEntry[]): string {
  if (units.length === 0) return '';
  const sorted = [...units].sort((a, b) => a.startTime - b.startTime);
  const lines: string[] = [];
  let charBudget = TIMELINE_MAX_CHARS;
  for (let i = 0; i < sorted.length; i += 1) {
    const u = sorted[i]!;
    const text = u.transcription
      ? (u.transcription.length > TIMELINE_TEXT_TRUNCATE ? `${u.transcription.slice(0, TIMELINE_TEXT_TRUNCATE)}…` : u.transcription)
      : '';
    const fmt = (sec: number): string => {
      const totalTenths = Math.round(sec * 10);
      const m = Math.floor(totalTenths / 600);
      const s = (totalTenths % 600) / 10;
      return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
    };
    const line = `#${i + 1} ${fmt(u.startTime)}–${fmt(u.endTime)}${text ? ` "${text}"` : ''}`;
    if (charBudget - line.length - 3 < 0) {
      const remaining = sorted.length - i;
      lines.push(`(+${remaining} more, use list_units for full data)`);
      break;
    }
    lines.push(line);
    charBudget -= line.length + 3;
  }
  return lines.join(' | ');
}

interface BuildTranscriptionAiPromptContextParams {
  locale?: string;
  selectionSnapshot: TranscriptionSelectionSnapshot;
  selectedUnitIds: string[];
  /** Total selected timeline units (may exceed `selectedUnitIds.length` when capped). */
  selectedUnitCount: number;
  /** Current media timeline rows (unit or segment), single read model. */
  currentMediaUnits: ReadonlyArray<TimelineUnitView>;
  /** Full-project list for local list/search/detail tools. */
  projectUnitsForTools?: ReadonlyArray<TimelineUnitView>;
  unitIndexComplete?: boolean;
  /** Project-wide timeline unit count (unit + segment read model). */
  unitCount: number;
  /** Current AI operation scope unit count (active layer + current media). */
  currentScopeUnitCount?: number;
  translationLayerCount: number;
  aiConfidenceAvg: number | null;
  waveformAnalysis?: WaveformAnalysisPromptSummary;
  acousticSummary?: AcousticPromptSummary;
  observerStage: string | null;
  topLexemes: string[];
  recommendations: string[];
  audioTimeSec?: number;
  layers?: ReadonlyArray<LayerDocType>;
  layerLinks?: ReadonlyArray<{
    id?: string;
    transcriptionLayerKey?: string;
    translationLayerId?: string;
    layerId?: string;
    hostTranscriptionLayerId?: string;
    isPreferred?: boolean;
  }>;
  unitDrafts?: Record<string, string>;
  translationDrafts?: Record<string, string>;
  focusedDraftKey?: string | null;
  speakers?: ReadonlyArray<{ id: string; name?: string; color?: string }>;
  noteSummary?: {
    count: number;
    byCategory?: Record<string, number>;
    focusedLayerId?: string;
    currentTargetUnitId?: string;
  };
  visibleTimelineState?: {
    currentMediaId?: string;
    currentMediaFilename?: string;
    focusedLayerId?: string;
    selectedLayerId?: string;
    selectedUnitCount?: number;
    verticalViewActive?: boolean;
    transcriptionTrackMode?: string;
    documentSpanSec?: number;
    zoomPercent?: number;
    maxZoomPercent?: number;
    zoomPxPerSec?: number;
    fitPxPerSec?: number;
    rulerVisibleStartSec?: number;
    rulerVisibleEndSec?: number;
    waveformScrollLeftPx?: number;
    laneLockSpeakerCount?: number;
    laneLocks?: ReadonlyArray<{ speakerId: string; laneIndex: number }>;
    trackLockSpeakerIds?: ReadonlyArray<string>;
    activeSpeakerFilterKey?: string;
  };
  /** When set, shortTerm receives `workspaceTextId` for Dexie-scoped tools. */
  activeTextId?: string | null;
  mediaItems?: ReadonlyArray<MediaItemPromptInput>;
  currentMediaId?: string;
  activeLayerIdForEdits?: string;
  /** Same as timeline `defaultTranscriptionLayerId`; used to resolve segment meta storage layer for dependent lanes. */
  defaultTranscriptionLayerId?: string;
  recentActions?: string[];
  /** Timeline read-model epoch for destructive tool stale guards. */
  timelineReadModelEpoch?: number;
  /** When set, AI shortTerm receives `timelineUnitsByLayerId` for layer-scoped tools (ADR 0020). */
  timelineUnitViewIndex?: Pick<TimelineUnitViewIndex, 'byLayer'>;
}

export function buildTranscriptionAiPromptContext({
  locale,
  selectionSnapshot,
  selectedUnitIds,
  selectedUnitCount,
  currentMediaUnits,
  projectUnitsForTools,
  unitIndexComplete = true,
  unitCount,
  currentScopeUnitCount,
  translationLayerCount,
  aiConfidenceAvg,
  waveformAnalysis,
  acousticSummary,
  observerStage,
  topLexemes,
  recommendations,
  audioTimeSec,
  layers = [],
  layerLinks = [],
  unitDrafts,
  translationDrafts,
  focusedDraftKey,
  speakers,
  noteSummary,
  visibleTimelineState,
  activeTextId,
  mediaItems,
  currentMediaId,
  activeLayerIdForEdits,
  defaultTranscriptionLayerId,
  recentActions,
  timelineReadModelEpoch,
  timelineUnitViewIndex,
}: BuildTranscriptionAiPromptContextParams): AiPromptContext {
  const selectedLayerKey = selectionSnapshot.selectedLayerId?.trim() ?? '';
  const segmentMetaStorageLayerId = (() => {
    if (!selectedLayerKey || layers.length === 0) return selectedLayerKey || undefined;
    const layerById = new Map(layers.map((layer) => [layer.id, layer]));
    const focused = layerById.get(selectedLayerKey);
    if (!focused) return selectedLayerKey;
    const source = resolveSegmentTimelineSourceLayer(focused, layerById, defaultTranscriptionLayerId);
    const resolved = (source?.id ?? selectedLayerKey).trim();
    return resolved || undefined;
  })();

  const localUnitIndex =
    (unitIndexComplete || (projectUnitsForTools?.length ?? 0) > 0) && projectUnitsForTools && projectUnitsForTools.length > 0
      ? projectUnitsForTools
      : undefined;

  const allUnits = projectUnitsForTools ?? currentMediaUnits;
  const speakerCount = (() => {
    const ids = new Set(
      allUnits
        .map((unit) => (typeof unit.speakerId === 'string' ? unit.speakerId.trim() : ''))
        .filter((id) => id.length > 0),
    );
    return ids.size > 0 ? ids.size : undefined;
  })();

  const worldModelSnapshot = buildWorldModelSnapshot({
    allUnits,
    currentMediaUnits,
    layers,
    ...(mediaItems ? { mediaItems } : {}),
    ...(currentMediaId !== undefined ? { currentMediaId } : {}),
    selectedUnitIds,
    ...(selectionSnapshot.selectedLayerId !== null ? { selectedLayerId: selectionSnapshot.selectedLayerId } : {}),
    ...(activeLayerIdForEdits !== undefined ? { activeLayerIdForEdits } : {}),
    maxChars: 1000,
  });

  const layerIndex = buildLayerIndex({
    layers,
    allUnits,
    ...(selectionSnapshot.selectedLayerId ? { selectedLayerId: selectionSnapshot.selectedLayerId } : {}),
    ...(activeLayerIdForEdits ? { activeLayerIdForEdits } : {}),
    ...(defaultTranscriptionLayerId ? { defaultTranscriptionLayerId } : {}),
    ...(timelineUnitViewIndex ? { timelineUnitViewIndex } : {}),
  });
  const layerLinkIndex = buildLayerLinkIndex(layerLinks);
  const unsavedDrafts = buildUnsavedDraftIndex({
    ...(unitDrafts ? { unitDrafts } : {}),
    ...(translationDrafts ? { translationDrafts } : {}),
    ...(focusedDraftKey !== undefined ? { focusedDraftKey } : {}),
  });
  const speakerIndex = buildSpeakerIndex(speakers);
  const normalizedNoteSummary = normalizeNoteSummary(noteSummary);
  const normalizedVisibleTimelineState = normalizeVisibleTimelineState(visibleTimelineState);

  return {
    shortTerm: {
      ...(locale ? { locale } : {}),
      page: 'transcription',
      ...(selectionSnapshot.activeUnitId ? { activeUnitId: selectionSnapshot.activeUnitId } : {}),
      ...(selectionSnapshot.selectedUnitKind === 'segment' && selectionSnapshot.timelineUnit
        ? { activeSegmentUnitId: selectionSnapshot.timelineUnit.unitId }
        : {}),
      ...(selectionSnapshot.selectedUnitKind ? { selectedUnitKind: selectionSnapshot.selectedUnitKind } : {}),
      ...(selectedUnitCount > 0 ? { selectedUnitCount } : {}),
      ...(selectedUnitIds.length > 0 ? { selectedUnitIds } : {}),
      ...(selectionSnapshot.selectedUnitStartSec !== undefined && selectionSnapshot.selectedUnitEndSec !== undefined
        ? {
            selectedUnitStartSec: selectionSnapshot.selectedUnitStartSec,
            selectedUnitEndSec: selectionSnapshot.selectedUnitEndSec,
          }
        : {}),
      ...(selectionSnapshot.selectedLayerId ? { selectedLayerId: selectionSnapshot.selectedLayerId } : {}),
      ...(segmentMetaStorageLayerId ? { segmentMetaStorageLayerId } : {}),
      ...(selectionSnapshot.selectedLayerType ? { selectedLayerType: selectionSnapshot.selectedLayerType } : {}),
      ...(selectionSnapshot.selectedTranslationLayerId ? { selectedTranslationLayerId: selectionSnapshot.selectedTranslationLayerId } : {}),
      ...(selectionSnapshot.selectedTranscriptionLayerId ? { selectedTranscriptionLayerId: selectionSnapshot.selectedTranscriptionLayerId } : {}),
      ...(currentMediaId !== undefined ? { currentMediaId } : {}),
      ...(typeof activeTextId === 'string' && activeTextId.trim().length > 0 ? { workspaceTextId: activeTextId.trim() } : {}),
      ...(selectionSnapshot.selectedText !== null ? { selectedText: selectionSnapshot.selectedText } : {}),
      ...(selectionSnapshot.selectedTimeRangeLabel ? { selectionTimeRange: selectionSnapshot.selectedTimeRangeLabel } : {}),
      ...(audioTimeSec !== undefined ? { audioTimeSec } : {}),
      projectUnitCount: unitCount,
      currentMediaUnitCount: currentMediaUnits.length,
      ...(typeof currentScopeUnitCount === 'number' && Number.isFinite(currentScopeUnitCount)
        ? { currentScopeUnitCount }
        : {}),
      ...(timelineReadModelEpoch !== undefined ? { timelineReadModelEpoch } : {}),
      ...(unitIndexComplete ? {} : { unitIndexComplete: false }),
      ...(worldModelSnapshot ? { worldModelSnapshot } : {}),
      ...(layerIndex.length > 0 ? { layerIndex } : {}),
      ...(layerLinkIndex.length > 0 ? { layerLinkIndex } : {}),
      ...(unsavedDrafts.length > 0 ? { unsavedDrafts } : {}),
      ...(speakerIndex.length > 0 ? { speakerIndex } : {}),
      ...(normalizedNoteSummary ? { noteSummary: normalizedNoteSummary } : {}),
      ...(normalizedVisibleTimelineState ? { visibleTimelineState: normalizedVisibleTimelineState } : {}),
      ...(localUnitIndex ? { localUnitIndex } : {}),
      ...(timelineUnitViewIndex?.byLayer && timelineUnitViewIndex.byLayer.size > 0
        ? { timelineUnitsByLayerId: timelineUnitViewIndex.byLayer }
        : {}),
      ...(recentActions && recentActions.length > 0 ? { recentActions } : {}),
    },
    longTerm: {
      projectStats: {
        unitCount,
        ...(speakerCount !== undefined ? { speakerCount } : {}),
        translationLayerCount,
        aiConfidenceAvg,
      },
      ...(waveformAnalysis ? { waveformAnalysis } : {}),
      ...(acousticSummary ? { acousticSummary } : {}),
      ...(observerStage ? { observerStage } : {}),
      topLexemes,
      recommendations,
    },
  };
}

function firstLocalizedName(name: Record<string, unknown> | undefined): string {
  if (!name) return '';
  const value = Object.values(name).find((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return value?.trim() ?? '';
}

function buildLayerIndex(input: {
  layers: ReadonlyArray<LayerDocType>;
  allUnits: ReadonlyArray<TimelineUnitView>;
  selectedLayerId?: string;
  activeLayerIdForEdits?: string;
  defaultTranscriptionLayerId?: string;
  timelineUnitViewIndex?: Pick<TimelineUnitViewIndex, 'byLayer'>;
}): AiPromptLayerSnapshot[] {
  return input.layers.map((layer) => {
    const unitCount = input.timelineUnitViewIndex?.byLayer.get(layer.id)?.length
      ?? input.allUnits.filter((unit) => unit.layerId === layer.id).length;
    const rawTreeHostLayerId = (layer as unknown as Record<string, unknown>)[['par', 'entLayerId'].join('')];
    const treeHostLayerId = typeof rawTreeHostLayerId === 'string'
      ? rawTreeHostLayerId
      : undefined;
    return {
      id: layer.id,
      ...(layer.key ? { key: layer.key } : {}),
      ...(firstLocalizedName(layer.name) ? { label: firstLocalizedName(layer.name) } : {}),
      layerType: layer.layerType,
      ...(layer.languageId ? { languageId: layer.languageId } : {}),
      ...(layer.modality ? { modality: layer.modality } : {}),
      ...(layer.textId ? { textId: layer.textId } : {}),
      ...(treeHostLayerId ? { treeHostLayerId } : {}),
      ...(layer.constraint ? { constraint: layer.constraint } : {}),
      unitCount,
      ...(layer.id === input.selectedLayerId ? { isSelected: true } : {}),
      ...(layer.id === input.activeLayerIdForEdits ? { isActiveEditLayer: true } : {}),
      ...(layer.id === input.defaultTranscriptionLayerId ? { isDefaultTranscriptionLayer: true } : {}),
    };
  });
}

function buildLayerLinkIndex(
  layerLinks: BuildTranscriptionAiPromptContextParams['layerLinks'],
): AiPromptLayerLinkSnapshot[] {
  return (layerLinks ?? []).map((link) => {
    const translationLayerId = link.translationLayerId ?? link.layerId;
    return {
      ...(link.id ? { id: link.id } : {}),
      ...(link.transcriptionLayerKey ? { transcriptionLayerKey: link.transcriptionLayerKey } : {}),
      ...(translationLayerId ? { translationLayerId } : {}),
      ...(link.hostTranscriptionLayerId ? { hostTranscriptionLayerId: link.hostTranscriptionLayerId } : {}),
      ...(typeof link.isPreferred === 'boolean' ? { isPreferred: link.isPreferred } : {}),
    };
  });
}

function buildDraftRows(
  drafts: Record<string, string> | undefined,
  draftType: AiPromptDraftSnapshot['draftType'],
  focusedDraftKey?: string | null,
): AiPromptDraftSnapshot[] {
  return Object.entries(drafts ?? {})
    .filter(([, value]) => value.trim().length > 0)
    .map(([rawKey, value]) => ({
      rawKey,
      draftType,
      textPreview: value.length > 80 ? `${value.slice(0, 80)}...` : value,
      textLength: value.length,
      ...(focusedDraftKey === rawKey ? { isFocused: true } : {}),
    }));
}

function buildUnsavedDraftIndex(input: {
  unitDrafts?: Record<string, string>;
  translationDrafts?: Record<string, string>;
  focusedDraftKey?: string | null;
}): AiPromptDraftSnapshot[] {
  return [
    ...buildDraftRows(input.unitDrafts, 'unit', input.focusedDraftKey),
    ...buildDraftRows(input.translationDrafts, 'translation', input.focusedDraftKey),
  ];
}

function buildSpeakerIndex(
  speakers: BuildTranscriptionAiPromptContextParams['speakers'],
): AiPromptSpeakerSnapshot[] {
  return (speakers ?? []).map((speaker) => ({
    id: speaker.id,
    ...(speaker.name ? { name: speaker.name } : {}),
    ...(speaker.color ? { color: speaker.color } : {}),
  }));
}

function normalizeNoteSummary(
  noteSummary: BuildTranscriptionAiPromptContextParams['noteSummary'],
): AiPromptNoteSummary | null {
  if (!noteSummary) return null;
  return {
    count: noteSummary.count,
    ...(noteSummary.byCategory ? { byCategory: noteSummary.byCategory } : {}),
    ...(noteSummary.focusedLayerId ? { focusedLayerId: noteSummary.focusedLayerId } : {}),
    ...(noteSummary.currentTargetUnitId ? { currentTargetUnitId: noteSummary.currentTargetUnitId } : {}),
  };
}

function normalizeVisibleTimelineState(
  state: BuildTranscriptionAiPromptContextParams['visibleTimelineState'],
): AiPromptVisibleTimelineState | null {
  if (!state) return null;
  return {
    ...(state.currentMediaId ? { currentMediaId: state.currentMediaId } : {}),
    ...(state.currentMediaFilename ? { currentMediaFilename: state.currentMediaFilename } : {}),
    ...(state.focusedLayerId ? { focusedLayerId: state.focusedLayerId } : {}),
    ...(state.selectedLayerId ? { selectedLayerId: state.selectedLayerId } : {}),
    ...(typeof state.selectedUnitCount === 'number' ? { selectedUnitCount: state.selectedUnitCount } : {}),
    ...(typeof state.verticalViewActive === 'boolean' ? { verticalViewActive: state.verticalViewActive } : {}),
    ...(state.transcriptionTrackMode ? { transcriptionTrackMode: state.transcriptionTrackMode } : {}),
    ...(typeof state.documentSpanSec === 'number' && Number.isFinite(state.documentSpanSec) ? { documentSpanSec: state.documentSpanSec } : {}),
    ...(typeof state.zoomPercent === 'number' && Number.isFinite(state.zoomPercent) ? { zoomPercent: state.zoomPercent } : {}),
    ...(typeof state.maxZoomPercent === 'number' && Number.isFinite(state.maxZoomPercent) ? { maxZoomPercent: state.maxZoomPercent } : {}),
    ...(typeof state.zoomPxPerSec === 'number' && Number.isFinite(state.zoomPxPerSec) ? { zoomPxPerSec: state.zoomPxPerSec } : {}),
    ...(typeof state.fitPxPerSec === 'number' && Number.isFinite(state.fitPxPerSec) ? { fitPxPerSec: state.fitPxPerSec } : {}),
    ...(typeof state.rulerVisibleStartSec === 'number' && Number.isFinite(state.rulerVisibleStartSec) ? { rulerVisibleStartSec: state.rulerVisibleStartSec } : {}),
    ...(typeof state.rulerVisibleEndSec === 'number' && Number.isFinite(state.rulerVisibleEndSec) ? { rulerVisibleEndSec: state.rulerVisibleEndSec } : {}),
    ...(typeof state.waveformScrollLeftPx === 'number' && Number.isFinite(state.waveformScrollLeftPx) ? { waveformScrollLeftPx: state.waveformScrollLeftPx } : {}),
    ...(typeof state.laneLockSpeakerCount === 'number' && Number.isFinite(state.laneLockSpeakerCount) ? { laneLockSpeakerCount: state.laneLockSpeakerCount } : {}),
    ...(state.laneLocks && state.laneLocks.length > 0 ? { laneLocks: state.laneLocks } : {}),
    ...(state.trackLockSpeakerIds && state.trackLockSpeakerIds.length > 0 ? { trackLockSpeakerIds: state.trackLockSpeakerIds } : {}),
    ...(state.activeSpeakerFilterKey ? { activeSpeakerFilterKey: state.activeSpeakerFilterKey } : {}),
  };
}
