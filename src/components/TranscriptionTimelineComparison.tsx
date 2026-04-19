import '../styles/pages/timeline/timeline-comparison.css';
import type { LayerDisplaySettings, LayerDocType, LayerUnitContentDocType, LayerUnitDocType, MediaItemDocType, OrthographyDocType } from '../db';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { unitToView } from '../hooks/timelineUnitView';
import { DEFAULT_TIMELINE_LANE_HEIGHT, MAX_TIMELINE_LANE_HEIGHT, MIN_TIMELINE_LANE_HEIGHT, useTimelineLaneHeightResize } from '../hooks/useTimelineLaneHeightResize';
import { layerUsesOwnSegments, resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import { useToast } from '../contexts/ToastContext';
import { t, tf, useLocale, type Locale } from '../i18n';
import type { TranscriptionComparisonViewFocusState } from '../pages/TranscriptionPage.UIState';
import { DEFAULT_TRANSCRIPTION_COMPARISON_FOCUS } from '../pages/TranscriptionPage.UIState';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';
import { NoteDocumentIcon } from './NoteDocumentIcon';
import { SelfCertaintyIcon } from './SelfCertaintyIcon';
import { TimelineDraftEditorSurface, type TimelineDraftSaveStatus } from './transcription/TimelineDraftEditorSurface';
import { normalizeSpeakerFocusKey, resolveSpeakerFocusKeyFromSegment } from './transcriptionTimelineSegmentSpeakerLayout';
import {
  buildComparisonGroups,
  listSegmentsOverlappingTimeRange,
  pickTranslationSegmentForPersist,
  type ComparisonGroup,
  type ComparisonTargetItem,
} from '../utils/transcriptionComparisonGroups';
import { buildLaneHeaderInlineDotSeparatedLabel, formatTime, normalizeSingleLine } from '../utils/transcriptionFormatters';
import {
  BASE_FONT_SIZE,
  buildOrthographyPreviewTextProps,
  computeFontSizeFromRenderPolicy,
  resolveOrthographyRenderPolicy,
} from '../utils/layerDisplayStyle';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { buildLayerStyleMenuItems } from './LayerStyleSubmenu';

/** 译文区点击/录音：优先用当前菜单锚点、再 global 选中，再回落主锚点 | Target-side UI anchor resolution */
function resolveComparisonGroupAnchorForUi(
  group: ComparisonGroup,
  contextMenuSourceUnitId: string | null | undefined,
  activeUnitId: string | undefined,
): { unitId: string; startTime: number } {
  const fromId = (id: string | null | undefined) => {
    if (typeof id !== 'string' || id.trim().length === 0) return undefined;
    const item = group.sourceItems.find((si) => si.unitId === id);
    return item ? { unitId: item.unitId, startTime: item.startTime } : undefined;
  };
  return (
    fromId(contextMenuSourceUnitId)
    ?? fromId(activeUnitId)
    ?? { unitId: group.sourceItems[0]?.unitId ?? '', startTime: group.sourceItems[0]?.startTime ?? group.startTime }
  );
}

/** 在 segment 未命中时，按锚点顺序查找已有译音挂载的 unit/segment id | Resolve translation-audio row key for comparison group */
function resolveComparisonTranslationAudioScopeUnitId(input: {
  audioAnchorSeg: LayerUnitDocType | undefined;
  anchorUnitIds: string[];
  contextMenuSourceUnitId: string | null | undefined;
  activeUnitId: string | undefined;
  primaryUnitId: string;
  translationAudioByLayer: Map<string, Map<string, LayerUnitContentDocType>> | undefined;
  targetLayerId: string | undefined;
}): string {
  if (input.audioAnchorSeg?.id) return input.audioAnchorSeg.id;
  const layerId = typeof input.targetLayerId === 'string' ? input.targetLayerId.trim() : '';
  const byKey = layerId.length > 0 ? input.translationAudioByLayer?.get(layerId) : undefined;
  if (byKey && byKey.size > 0) {
    const ordered = [
      input.contextMenuSourceUnitId,
      input.activeUnitId,
      ...input.anchorUnitIds,
      input.primaryUnitId,
    ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    const seen = new Set<string>();
    for (const id of ordered) {
      if (seen.has(id)) continue;
      seen.add(id);
      const row = byKey.get(id);
      if (row?.translationAudioMediaId) return id;
    }
  }
  return input.primaryUnitId;
}

function normalizeComparisonText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => normalizeSingleLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function buildComparisonSelfCertaintyTitle(locale: Locale, certainty: UnitSelfCertainty, laneLabel: string): string {
  const label = certainty === 'certain'
    ? t(locale, 'transcription.unit.selfCertainty.certain')
    : certainty === 'uncertain'
      ? t(locale, 'transcription.unit.selfCertainty.uncertain')
      : t(locale, 'transcription.unit.selfCertainty.notUnderstood');
  const dimension = t(locale, 'transcription.unit.selfCertainty.dimensionHint');
  const resolvedLaneLabel = normalizeSingleLine(laneLabel).trim();
  return `${resolvedLaneLabel || label}\n${dimension}`;
}

function renderComparisonSelfCertaintyBadge(input: {
  locale: Locale;
  certainty: UnitSelfCertainty | undefined;
  ambiguous: boolean;
  laneLabel: string;
}): ReactNode {
  if (input.certainty) {
    const title = buildComparisonSelfCertaintyTitle(input.locale, input.certainty, input.laneLabel);
    return (
      <SelfCertaintyIcon
        certainty={input.certainty}
        className="timeline-annotation-self-certainty"
        title={title}
        ariaLabel={title}
      />
    );
  }
  if (!input.ambiguous) return null;
  const ambiguousTitle = t(input.locale, 'transcription.unit.selfCertainty.ambiguousSource');
  return (
    <span
      className="timeline-annotation-self-certainty timeline-annotation-self-certainty-ambiguous"
      role="img"
      aria-label={ambiguousTitle}
      title={ambiguousTitle}
    >
      <span className="timeline-annotation-self-certainty-icon" aria-hidden>
        !
      </span>
    </span>
  );
}

function renderComparisonNoteBadge(input: {
  locale: Locale;
  noteCount: number;
  onNoteClick?: (event: React.MouseEvent<SVGSVGElement>) => void;
}): ReactNode {
  if (!(input.noteCount > 0) || !input.onNoteClick) return null;
  const label = tf(input.locale, 'transcription.notes.count', { count: input.noteCount });
  return (
    <NoteDocumentIcon
      className="timeline-comparison-note-icon timeline-comparison-note-icon-active"
      onClick={(event) => {
        event.stopPropagation();
        input.onNoteClick?.(event);
      }}
      ariaLabel={label}
      title={label}
    />
  );
}

function renderComparisonOverlay(input: {
  locale: Locale;
  certainty: UnitSelfCertainty | undefined;
  ambiguous: boolean;
  laneLabel: string;
  noteCount: number;
  onNoteClick?: (event: React.MouseEvent<SVGSVGElement>) => void;
}): ReactNode {
  const certaintyBadge = renderComparisonSelfCertaintyBadge(input);
  const noteBadge = renderComparisonNoteBadge({
    locale: input.locale,
    noteCount: input.noteCount,
    ...(input.onNoteClick ? { onNoteClick: input.onNoteClick } : {}),
  });
  if (!certaintyBadge && !noteBadge) return null;
  return (
    <div className="timeline-comparison-surface-badges">
      {certaintyBadge}
      {noteBadge}
    </div>
  );
}

/** 首条语段顶相对层头再下移的余量（发丝线、subpixel、hover 外光）| clearance below dual-column header */
const COMPARISON_GLOBAL_SPLITTER_LINE_EXTRA_OFFSET_PX = 12;

/** 译文层按独立语段分项时，纵向对照为每段单独编辑面 | One editor row per translation segment */
function comparisonUsesPerSegmentTargetEditors(group: ComparisonGroup): boolean {
  return (
    group.targetItems.length > 0
    && group.targetItems.every(
      (t) => typeof t.translationSegmentId === 'string' && t.translationSegmentId.trim().length > 0,
    )
  );
}

function accumulatedOffsetTopUntil(el: HTMLElement | null, ancestor: HTMLElement | null): number | null {
  if (!el || !ancestor) return null;
  let sum = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    sum += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === ancestor ? sum : null;
}

const COMPARISON_COLUMN_LEFT_GROW_KEY = 'jieyu:comparison-column-left-grow';
const COMPARISON_EDITOR_HEIGHT_KEY = 'jieyu:comparison-editor-min-height';
const LEGACY_SHARED_TIMELINE_EDITOR_MIN_HEIGHT = Math.max(42, DEFAULT_TIMELINE_LANE_HEIGHT - 12);
const SHARED_TIMELINE_EDITOR_MIN_HEIGHT = Math.max(
  63,
  Math.round(LEGACY_SHARED_TIMELINE_EDITOR_MIN_HEIGHT * 1.5),
);

function readStoredComparisonLeftGrow(): number {
  if (typeof window === 'undefined') return 50;
  try {
    const raw = localStorage.getItem(COMPARISON_COLUMN_LEFT_GROW_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 20 && n <= 80) return Math.round(n);
  } catch {
    /* ignore */
  }
  return 50;
}

function readStoredComparisonEditorHeight(): number {
  if (typeof window === 'undefined') return SHARED_TIMELINE_EDITOR_MIN_HEIGHT;
  try {
    const raw = localStorage.getItem(COMPARISON_EDITOR_HEIGHT_KEY);
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const clamped = Math.min(MAX_TIMELINE_LANE_HEIGHT, Math.max(MIN_TIMELINE_LANE_HEIGHT, Math.round(n)));
      return clamped === LEGACY_SHARED_TIMELINE_EDITOR_MIN_HEIGHT
        ? SHARED_TIMELINE_EDITOR_MIN_HEIGHT
        : clamped;
    }
  } catch {
    /* ignore */
  }
  return SHARED_TIMELINE_EDITOR_MIN_HEIGHT;
}

function readStoredComparisonEditorHeightMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(COMPARISON_EDITOR_HEIGHT_KEY);
    if (!raw || raw.trim().length === 0 || raw.trim().startsWith('{') === false) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      next[key] = Math.min(MAX_TIMELINE_LANE_HEIGHT, Math.max(MIN_TIMELINE_LANE_HEIGHT, Math.round(n)));
    }
    return next;
  } catch {
    /* ignore */
  }
  return {};
}

function mergeComparisonUnitById(
  unitsOnCurrentMedia: LayerUnitDocType[],
  segmentParentUnitLookup: LayerUnitDocType[] | undefined,
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined,
): Map<string, LayerUnitDocType> {
  const next = new Map<string, LayerUnitDocType>();
  for (const u of unitsOnCurrentMedia) next.set(u.id, u);
  if (segmentParentUnitLookup) {
    for (const u of segmentParentUnitLookup) {
      if (!next.has(u.id)) next.set(u.id, u);
    }
  }
  if (segmentsByLayer) {
    for (const list of segmentsByLayer.values()) {
      for (const s of list) {
        if (!next.has(s.id)) next.set(s.id, s);
      }
    }
  }
  return next;
}

function resolveComparisonGroupSourceUnits(input: {
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  unitsOnCurrentMedia: LayerUnitDocType[];
  segmentParentUnitLookup: LayerUnitDocType[] | undefined;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined;
  allLayersOrdered: LayerDocType[] | undefined;
  defaultTranscriptionLayerId: string | undefined;
  activeSpeakerFilterKey: string | undefined;
  unitByIdForSpeaker: ReadonlyMap<string, LayerUnitDocType>;
}): LayerUnitDocType[] {
  const {
    transcriptionLayers,
    translationLayers,
    unitsOnCurrentMedia,
    segmentParentUnitLookup: _segmentParentUnitLookup,
    segmentsByLayer,
    allLayersOrdered,
    defaultTranscriptionLayerId,
    activeSpeakerFilterKey,
    unitByIdForSpeaker,
  } = input;

  const filteredHostUnits = unitsOnCurrentMedia.filter((u) => u.tags?.skipProcessing !== true);

  const hasSegmentTranscriptionLane = transcriptionLayers.some(
    (l) => layerUsesOwnSegments(l, defaultTranscriptionLayerId),
  );
  if (!hasSegmentTranscriptionLane) {
    return filteredHostUnits;
  }

  const layerById = new Map(
    (allLayersOrdered ?? [...transcriptionLayers, ...translationLayers]).map((l) => [l.id, l] as const),
  );

  const speakerKey = activeSpeakerFilterKey ?? 'all';
  const seen = new Set<string>();
  const out: LayerUnitDocType[] = [];

  const push = (u: LayerUnitDocType) => {
    if (u.tags?.skipProcessing === true) return;
    if (seen.has(u.id)) return;
    seen.add(u.id);
    out.push(u);
  };

  for (const layer of transcriptionLayers) {
    if (layerUsesOwnSegments(layer, defaultTranscriptionLayerId)) {
      const segmentSourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
      const segmentSourceLayerId = segmentSourceLayer?.id ?? '';
      const segs = segmentsByLayer?.get(segmentSourceLayerId) ?? [];
      for (const segment of segs) {
        if (speakerKey !== 'all') {
          const k = resolveSpeakerFocusKeyFromSegment(segment, unitByIdForSpeaker);
          if (k !== normalizeSpeakerFocusKey(speakerKey)) continue;
        }
        push(segment);
      }
    } else {
      for (const u of unitsOnCurrentMedia) {
        if (u.tags?.skipProcessing === true) continue;
        const lid = typeof u.layerId === 'string' ? u.layerId.trim() : '';
        if (lid.length > 0 && lid !== layer.id) continue;
        push(u);
      }
    }
  }

  if (out.length === 0) {
    return filteredHostUnits;
  }

  return out.sort((left, right) => left.startTime - right.startTime || left.endTime - right.endTime || left.id.localeCompare(right.id));
}

/** 行左侧窄轨可见字符：取展示名首字素，避免整段层头塞进每一行 | One grapheme for row rail */
function comparisonRowRailMark(fullLabel: string): string {
  const trimmed = normalizeSingleLine(fullLabel);
  if (trimmed.length === 0) return '·';
  const first = Array.from(trimmed)[0];
  return first ?? '·';
}

function resolveComparisonLayerLabel(layer: LayerDocType | undefined, locale: Locale, fallback: string): string {
  if (!layer) return fallback;
  const localizedName = typeof layer.name === 'string'
    ? layer.name
    : layer.name?.[locale]
      ?? layer.name?.['zh-CN']
      ?? layer.name?.['en-US']
      ?? Object.values(layer.name ?? {}).find((value) => typeof value === 'string' && value.trim().length > 0)
      ?? '';
  const normalized = normalizeSingleLine(localizedName);
  if (normalized.length > 0) return normalized;
  if (typeof layer.key === 'string' && layer.key.trim().length > 0) return layer.key.trim();
  return fallback;
}

function resolveComparisonEditorRows(value: string): number {
  return Math.min(6, Math.max(1, normalizeComparisonText(value).split('\n').length));
}

interface TranscriptionTimelineComparisonProps {
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  unitsOnCurrentMedia: LayerUnitDocType[];
  focusedLayerRowId: string;
  activeUnitId?: string;
  onFocusLayer: (layerId: string) => void;
  comparisonFocus?: TranscriptionComparisonViewFocusState;
  updateComparisonFocus?: (patch: Partial<TranscriptionComparisonViewFocusState>) => void;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  saveSegmentContentForLayer?: (segmentId: string, layerId: string, value: string) => Promise<void>;
  handleAnnotationClick: (
    uttId: string,
    uttStartTime: number,
    layerId: string,
    e: React.MouseEvent,
    overlapCycleItems?: Array<{ id: string; startTime: number }>,
  ) => void;
  handleAnnotationContextMenu?: (
    uttId: string,
    utt: ReturnType<typeof unitToView>,
    layerId: string,
    e: React.MouseEvent,
  ) => void;
  /** 与纯文本时间轴一致：语段轨时从 segmentsByLayer 取行，而非仅用宿主句列表 */
  segmentsByLayer?: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentParentUnitLookup?: LayerUnitDocType[];
  allLayersOrdered?: LayerDocType[];
  defaultTranscriptionLayerId?: string;
  activeSpeakerFilterKey?: string;
  translationAudioByLayer?: Map<string, Map<string, LayerUnitContentDocType>>;
  handleNoteClick?: (unitId: string, layerId: string | undefined, event: React.MouseEvent) => void;
  resolveNoteIndicatorTarget?: (unitId: string, layerId?: string, scope?: 'timeline' | 'waveform') => { count: number; layerId?: string } | null;
  resolveSelfCertaintyForUnit?: (unitId: string, layerId?: string) => UnitSelfCertainty | undefined;
  resolveSelfCertaintyAmbiguityForUnit?: (unitId: string, layerId?: string) => boolean;
  mediaItems?: MediaItemDocType[];
  recording?: boolean;
  recordingUnitId?: string | null;
  recordingLayerId?: string | null;
  startRecordingForUnit?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  stopRecording?: () => void;
  deleteVoiceTranslation?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  displayStyleControl?: {
    orthographies: OrthographyDocType[];
    onUpdate: (layerId: string, patch: Partial<LayerDisplaySettings>) => void;
    onReset: (layerId: string) => void;
    localFonts?: Parameters<typeof import('./LayerStyleSubmenu').buildLayerStyleMenuItems>[7];
  };
  speakerVisualByUnitId?: Record<string, { name: string; color: string }>;
  /** 与文本时间轴一致：Tab 在句间跳转选中（多行编辑器不占用 Enter） */
  navigateUnitFromInput?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, direction: -1 | 1) => void;
}

/**
 * 左右对照视图（P0）| Side-by-side comparison view (P0)
 */
export function TranscriptionTimelineComparison({
  transcriptionLayers,
  translationLayers,
  unitsOnCurrentMedia,
  focusedLayerRowId,
  activeUnitId,
  onFocusLayer,
  comparisonFocus: comparisonFocusProp,
  updateComparisonFocus,
  segmentContentByLayer,
  saveSegmentContentForLayer,
  handleAnnotationClick,
  handleAnnotationContextMenu,
  segmentsByLayer,
  segmentParentUnitLookup,
  allLayersOrdered,
  defaultTranscriptionLayerId,
  activeSpeakerFilterKey,
  translationAudioByLayer,
  handleNoteClick,
  resolveNoteIndicatorTarget,
  resolveSelfCertaintyForUnit,
  resolveSelfCertaintyAmbiguityForUnit,
  mediaItems = [],
  recording = false,
  recordingUnitId = null,
  recordingLayerId = null,
  startRecordingForUnit,
  stopRecording,
  deleteVoiceTranslation,
  displayStyleControl,
  speakerVisualByUnitId = {},
  navigateUnitFromInput,
}: TranscriptionTimelineComparisonProps) {
  const locale = useLocale();
  const { showToast } = useToast();
  const [internalComparisonFocus, setInternalComparisonFocus] = useState<TranscriptionComparisonViewFocusState>(
    () => ({ ...DEFAULT_TRANSCRIPTION_COMPARISON_FOCUS }),
  );
  const comparisonFocus = comparisonFocusProp != null && updateComparisonFocus != null
    ? comparisonFocusProp
    : internalComparisonFocus;
  const patchComparisonFocus = useCallback((patch: Partial<TranscriptionComparisonViewFocusState>) => {
    if (updateComparisonFocus != null) {
      updateComparisonFocus(patch);
    } else {
      setInternalComparisonFocus((prev) => {
        const entries = Object.entries(patch) as Array<[
          keyof TranscriptionComparisonViewFocusState,
          TranscriptionComparisonViewFocusState[keyof TranscriptionComparisonViewFocusState],
        ]>;
        if (entries.every(([key, value]) => prev[key] === value)) return prev;
        return { ...prev, ...patch };
      });
    }
  }, [updateComparisonFocus]);
  const activeComparisonGroupId = comparisonFocus.activeComparisonGroupId;
  const activeComparisonCellId = comparisonFocus.activeComparisonCellId;
  const comparisonTargetSide = comparisonFocus.comparisonTargetSide;
  const contextMenuSourceUnitId = comparisonFocus.contextMenuSourceUnitId;
  const [compactMode, setCompactMode] = useState<'both' | 'source' | 'target'>('both');
  const [layerStyleMenu, setLayerStyleMenu] = useState<{ x: number; y: number } | null>(null);
  const [comparisonLeftGrow, setComparisonLeftGrow] = useState(readStoredComparisonLeftGrow);
  const [comparisonEditorHeightByGroup, setComparisonEditorHeightByGroup] = useState<Record<string, number>>(readStoredComparisonEditorHeightMap);
  const [defaultComparisonEditorHeight] = useState(readStoredComparisonEditorHeight);
  const comparisonViewRef = useRef<HTMLDivElement | null>(null);
  const comparisonSplitHostRef = useRef<HTMLDivElement | null>(null);
  const comparisonLeftGrowRef = useRef(comparisonLeftGrow);
  const comparisonSplitDragRef = useRef<{ pointerId: number } | null>(null);
  const comparisonSplitCleanupRef = useRef<(() => void) | null>(null);
  const [isComparisonColumnSplitDragging, setIsComparisonColumnSplitDragging] = useState(false);

  useEffect(() => {
    comparisonLeftGrowRef.current = comparisonLeftGrow;
  }, [comparisonLeftGrow]);

  const [isNarrowComparisonLayout, setIsNarrowComparisonLayout] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 960px)');
    const sync = () => setIsNarrowComparisonLayout(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** 以首组左右列 getBoundingClientRect 为准，避免 %/滚动条与 fr 栅格亚像素漂移 | Measured gutter vs CSS calc drift */
  const comparisonSplitMeasureRef = useRef<{
    trackStartFromHostPaddingLeft: number;
    trackPx: number;
    gapPx: number;
  } | null>(null);

  const measureComparisonSplitLayout = useCallback(() => {
    const host = comparisonSplitHostRef.current;
    const clearSplitterLineTopVar = () => {
      const innerEl = host?.querySelector('.timeline-comparison-split-host-inner') as HTMLElement | null;
      innerEl?.style.removeProperty('--timeline-comparison-global-splitter-line-top');
    };
    if (!host || compactMode !== 'both' || isNarrowComparisonLayout) {
      clearSplitterLineTopVar();
      host?.style.removeProperty('--comparison-splitter-center-x');
      comparisonSplitMeasureRef.current = null;
      return;
    }
    const group = host.querySelector('.timeline-comparison-group') as HTMLElement | null;
    const src = group?.querySelector('.timeline-comparison-source-column') as HTMLElement | null;
    const tgt = group?.querySelector('.timeline-comparison-target-column') as HTMLElement | null;
    if (!group || !src || !tgt) {
      clearSplitterLineTopVar();
      host.style.removeProperty('--comparison-splitter-center-x');
      comparisonSplitMeasureRef.current = null;
      return;
    }
    const hostStyle = getComputedStyle(host);
    const padL = parseFloat(hostStyle.paddingLeft) || 0;
    const hr = host.getBoundingClientRect();
    const sr = src.getBoundingClientRect();
    const tr = tgt.getBoundingClientRect();
    const gapPx = Math.max(0, tr.left - sr.right);
    const gapCenterViewport = (sr.right + tr.left) / 2;
    const paddingLeftEdge = hr.left + padL;
    const gapCenterFromHostPaddingLeft = gapCenterViewport - paddingLeftEdge;
    host.style.setProperty('--comparison-splitter-center-x', `${gapCenterFromHostPaddingLeft}px`);
    comparisonSplitMeasureRef.current = {
      trackStartFromHostPaddingLeft: sr.left - paddingLeftEdge,
      trackPx: Math.max(40, tr.right - sr.left),
      gapPx,
    };
    const inner = host.querySelector('.timeline-comparison-split-host-inner') as HTMLElement | null;
    const headerEl = host.querySelector('.timeline-comparison-header') as HTMLElement | null;
    if (inner && group) {
      const innerStyle = getComputedStyle(inner);
      const rowGap = parseFloat(innerStyle.rowGap || innerStyle.columnGap || innerStyle.gap || '8') || 8;
      const fromHeader = headerEl && headerEl.offsetHeight > 0 ? headerEl.offsetHeight + rowGap : 0;
      const fromFirstGroup = accumulatedOffsetTopUntil(group, inner);
      const layoutTop = Math.max(fromHeader, fromFirstGroup ?? 0);
      const lineTopPx = Math.max(0, Math.round(layoutTop + COMPARISON_GLOBAL_SPLITTER_LINE_EXTRA_OFFSET_PX));
      /* split-host-inner 顶 → 分割条命中区顶；无吸顶层头时 fromHeader 为 0，仅靠首组 offset */
      inner.style.setProperty('--timeline-comparison-global-splitter-line-top', `${lineTopPx}px`);
    }
  }, [compactMode, isNarrowComparisonLayout]);

  useEffect(() => () => {
    comparisonSplitCleanupRef.current?.();
    comparisonSplitCleanupRef.current = null;
    comparisonSplitDragRef.current = null;
    document.body.style.userSelect = '';
  }, []);

  const resetComparisonColumnsToEqualWidth = useCallback(() => {
    if (compactMode !== 'both' || isNarrowComparisonLayout) return;
    setComparisonLeftGrow(50);
    comparisonLeftGrowRef.current = 50;
    try {
      localStorage.setItem(COMPARISON_COLUMN_LEFT_GROW_KEY, '50');
    } catch {
      /* ignore */
    }
  }, [compactMode, isNarrowComparisonLayout]);

  const handleComparisonSplitterPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (compactMode !== 'both' || isNarrowComparisonLayout) return;
    if (event.button !== 0) return;
    if (event.detail >= 2) {
      event.preventDefault();
      event.stopPropagation();
      resetComparisonColumnsToEqualWidth();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const host = comparisonSplitHostRef.current;
    if (!host) return;

    comparisonSplitCleanupRef.current?.();
    comparisonSplitCleanupRef.current = null;

    const pointerId = event.pointerId;
    comparisonSplitDragRef.current = { pointerId };

    const sidePad = 10;
    const columnInset = 10;
    const colGap = 8;

    const applyClientX = (clientX: number) => {
      measureComparisonSplitLayout();
      const m = comparisonSplitMeasureRef.current;
      const rect = host.getBoundingClientRect();
      const hostStyle = getComputedStyle(host);
      const padL = parseFloat(hostStyle.paddingLeft) || 0;
      const paddingLeftEdge = rect.left + padL;
      let raw: number;
      if (m && m.trackPx > m.gapPx + 4) {
        raw = ((clientX - paddingLeftEdge - m.trackStartFromHostPaddingLeft - m.gapPx / 2) / (m.trackPx - m.gapPx)) * 100;
      } else {
        const contentWidth = Math.max(80, rect.width - 2 * sidePad);
        const track = Math.max(40, contentWidth - 2 * columnInset - colGap);
        const pointerBase = rect.left + sidePad + columnInset;
        raw = ((clientX - pointerBase - colGap / 2) / track) * 100;
      }
      const next = Math.min(80, Math.max(20, Math.round(raw)));
      setComparisonLeftGrow(next);
    };

    const onWindowPointerMove = (ev: PointerEvent) => {
      if (comparisonSplitDragRef.current?.pointerId !== ev.pointerId) return;
      applyClientX(ev.clientX);
    };

    const finish = (ev: PointerEvent) => {
      if (comparisonSplitDragRef.current?.pointerId !== ev.pointerId) return;
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      comparisonSplitCleanupRef.current = null;
      comparisonSplitDragRef.current = null;
      setIsComparisonColumnSplitDragging(false);
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(COMPARISON_COLUMN_LEFT_GROW_KEY, String(comparisonLeftGrowRef.current));
      } catch {
        /* ignore */
      }
    };

    comparisonSplitCleanupRef.current = () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    document.body.style.userSelect = 'none';
    setIsComparisonColumnSplitDragging(true);
    applyClientX(event.clientX);
  }, [compactMode, isNarrowComparisonLayout, measureComparisonSplitLayout, resetComparisonColumnsToEqualWidth]);

  const [saveStatusByCellKey, setSaveStatusByCellKey] = useState<Record<string, NonNullable<TimelineDraftSaveStatus>>>({});
  const setComparisonCellSaveStatus = useCallback((cellKey: string, status?: NonNullable<TimelineDraftSaveStatus>) => {
    setSaveStatusByCellKey((prev) => {
      if (!status) {
        if (!(cellKey in prev)) return prev;
        const next = { ...prev };
        delete next[cellKey];
        return next;
      }
      if (prev[cellKey] === status) return prev;
      return { ...prev, [cellKey]: status };
    });
  }, []);
  const runComparisonSaveWithStatus = useCallback(async (cellKey: string, saveTask: () => Promise<void>) => {
    setComparisonCellSaveStatus(cellKey, 'saving');
    try {
      await saveTask();
      setComparisonCellSaveStatus(cellKey);
    } catch (err) {
      const blocked = err instanceof Error && err.message === 'COMPARISON_SEGMENT_PERSIST_BLOCKED';
      if (!blocked) {
        console.error('[Jieyu] TranscriptionTimelineComparison: cell save failed', { cellKey, err });
      }
      setComparisonCellSaveStatus(cellKey, 'error');
    }
  }, [setComparisonCellSaveStatus]);
  const {
    unitDrafts,
    setUnitDrafts,
    translationDrafts,
    setTranslationDrafts,
    translationTextByLayer,
    focusedTranslationDraftKeyRef,
    scheduleAutoSave,
    clearAutoSaveTimer,
    saveUnitText,
    saveUnitLayerText,
    getUnitTextForLayer,
  } = useTranscriptionEditorContext();

  const targetLayer = useMemo(
    () => translationLayers.find((layer) => layer.id === focusedLayerRowId) ?? translationLayers[0],
    [focusedLayerRowId, translationLayers],
  );

  const sourceLayer = useMemo(
    () => transcriptionLayers.find((layer) => layer.id === focusedLayerRowId) ?? transcriptionLayers[0],
    [focusedLayerRowId, transcriptionLayers],
  );

  const unitByIdForSpeaker = useMemo(
    () => mergeComparisonUnitById(unitsOnCurrentMedia, segmentParentUnitLookup, segmentsByLayer),
    [unitsOnCurrentMedia, segmentParentUnitLookup, segmentsByLayer],
  );

  const comparisonGroupSourceUnits = useMemo(
    () => resolveComparisonGroupSourceUnits({
      transcriptionLayers,
      translationLayers,
      unitsOnCurrentMedia,
      segmentParentUnitLookup,
      segmentsByLayer,
      allLayersOrdered,
      defaultTranscriptionLayerId,
      activeSpeakerFilterKey,
      unitByIdForSpeaker,
    }),
    [
      activeSpeakerFilterKey,
      allLayersOrdered,
      defaultTranscriptionLayerId,
      segmentParentUnitLookup,
      segmentsByLayer,
      transcriptionLayers,
      translationLayers,
      unitByIdForSpeaker,
      unitsOnCurrentMedia,
    ],
  );

  const unitById = unitByIdForSpeaker;

  const mediaItemById = useMemo(
    () => new Map(mediaItems.map((item) => [item.id, item] as const)),
    [mediaItems],
  );

  const groups = useMemo(() => {
    const targetUsesSegments = Boolean(
      targetLayer && layerUsesOwnSegments(targetLayer, defaultTranscriptionLayerId),
    );
    const translationSegmentsForTarget = targetLayer ? segmentsByLayer?.get(targetLayer.id) : undefined;
    const targetLayerId = targetLayer?.id ?? '';
    const layerContent = targetLayerId && segmentContentByLayer
      ? segmentContentByLayer.get(targetLayerId)
      : undefined;
    return buildComparisonGroups({
      units: comparisonGroupSourceUnits,
      sourceLayerIds: transcriptionLayers.map((layer) => layer.id),
      getSourceText: (unit) => getUnitTextForLayer(unit, sourceLayer?.id) || getUnitTextForLayer(unit) || '',
      getTargetText: (unit) => {
        if (!targetLayer) return '';
        if (targetUsesSegments && layerContent) {
          const overlapping = listSegmentsOverlappingTimeRange(
            translationSegmentsForTarget,
            unit.startTime,
            unit.endTime,
          );
          if (overlapping.length === 0) {
            return translationTextByLayer.get(targetLayer.id)?.get(unit.id)?.text ?? '';
          }
          return overlapping
            .map((s) => layerContent.get(s.id)?.text ?? '')
            .filter((line) => line.length > 0)
            .join('\n');
        }
        return translationTextByLayer.get(targetLayer.id)?.get(unit.id)?.text ?? '';
      },
      getTargetItems: (unit) => {
        if (!targetUsesSegments || !layerContent || !translationSegmentsForTarget?.length) return undefined;
        const overlapping = listSegmentsOverlappingTimeRange(
          translationSegmentsForTarget,
          unit.startTime,
          unit.endTime,
        );
        if (overlapping.length === 0) return undefined;
        return overlapping.map((s) => ({
          id: `${unit.id}:target:seg:${s.id}`,
          text: normalizeSingleLine(layerContent.get(s.id)?.text ?? ''),
          anchorUnitIds: [unit.id],
          translationSegmentId: s.id,
        }));
      },
      getSpeakerLabel: (unit) => speakerVisualByUnitId[unit.id]?.name ?? '',
    });
  }, [
    comparisonGroupSourceUnits,
    defaultTranscriptionLayerId,
    getUnitTextForLayer,
    segmentContentByLayer,
    segmentsByLayer,
    sourceLayer?.id,
    targetLayer,
    speakerVisualByUnitId,
    transcriptionLayers,
    translationTextByLayer,
  ]);

  useLayoutEffect(() => {
    measureComparisonSplitLayout();
    const host = comparisonSplitHostRef.current;
    if (!host) return;
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          measureComparisonSplitLayout();
        })
      : null;
    ro?.observe(host);
    const headerEl = host.querySelector('.timeline-comparison-header') as HTMLElement | null;
    const innerEl = host.querySelector('.timeline-comparison-split-host-inner') as HTMLElement | null;
    if (headerEl) ro?.observe(headerEl);
    if (innerEl) ro?.observe(innerEl);
    window.addEventListener('resize', measureComparisonSplitLayout);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measureComparisonSplitLayout);
    };
  }, [groups.length, comparisonLeftGrow, measureComparisonSplitLayout, compactMode, isNarrowComparisonLayout]);

  const persistGroupTranslation = useCallback(async (group: ComparisonGroup, anchorUnitIds: string[], value: string) => {
    if (!targetLayer) return;
    const usesSeg = layerUsesOwnSegments(targetLayer, defaultTranscriptionLayerId);
    if (usesSeg && saveSegmentContentForLayer) {
      const trSegs = segmentsByLayer?.get(targetLayer.id) ?? [];
      const pick = pickTranslationSegmentForPersist(trSegs, group.startTime, group.endTime);
      if (pick?.id) {
        await saveSegmentContentForLayer(pick.id, targetLayer.id, value);
        return;
      }
      const hint = t(locale, 'transcription.comparison.segmentMissingForSave');
      showToast(hint, 'error', 8000);
      throw new Error('COMPARISON_SEGMENT_PERSIST_BLOCKED');
    }
    await Promise.all(anchorUnitIds.map((unitId) => saveUnitLayerText(unitId, value, targetLayer.id)));
  }, [
    defaultTranscriptionLayerId,
    locale,
    saveSegmentContentForLayer,
    saveUnitLayerText,
    segmentsByLayer,
    showToast,
    targetLayer,
  ]);

  const persistComparisonTargetTranslation = useCallback(async (
    targetItem: ComparisonTargetItem,
    group: ComparisonGroup,
    anchorUnitIds: string[],
    value: string,
  ) => {
    const segId = typeof targetItem.translationSegmentId === 'string' ? targetItem.translationSegmentId.trim() : '';
    if (segId.length > 0 && targetLayer && saveSegmentContentForLayer) {
      await saveSegmentContentForLayer(segId, targetLayer.id, value);
      return;
    }
    await persistGroupTranslation(group, anchorUnitIds, value);
  }, [persistGroupTranslation, saveSegmentContentForLayer, targetLayer]);

  const persistSourceText = useCallback(async (unitId: string, value: string, layerId?: string) => {
    await saveUnitText(unitId, value, layerId);
  }, [saveUnitText]);

  const bundleOrderById = useMemo(() => {
    const map = new Map<string, number>();
    let nextIndex = 1;
    for (const group of groups) {
      if (!group.bundleRootId || map.has(group.bundleRootId)) continue;
      map.set(group.bundleRootId, nextIndex);
      nextIndex += 1;
    }
    return map;
  }, [groups]);

  const sourceHeaderLabel = useMemo(
    () => resolveComparisonLayerLabel(sourceLayer, locale, t(locale, 'transcription.comparison.sourceHeader')),
    [locale, sourceLayer],
  );

  const targetHeaderLabel = useMemo(
    () => resolveComparisonLayerLabel(targetLayer, locale, t(locale, 'transcription.comparison.translationHeader')),
    [locale, targetLayer],
  );

  const comparisonHeaderOrthographies = displayStyleControl?.orthographies ?? [];

  const sourceHeaderContent = useMemo(() => {
    if (!sourceLayer) return sourceHeaderLabel;
    const inline = buildLaneHeaderInlineDotSeparatedLabel(sourceLayer, locale, comparisonHeaderOrthographies);
    const trimmed = inline.trim();
    return trimmed.length > 0 ? trimmed : sourceHeaderLabel;
  }, [comparisonHeaderOrthographies, locale, sourceHeaderLabel, sourceLayer]);

  const targetHeaderContent = useMemo(() => {
    if (!targetLayer) return targetHeaderLabel;
    const inline = buildLaneHeaderInlineDotSeparatedLabel(targetLayer, locale, comparisonHeaderOrthographies);
    const trimmed = inline.trim();
    return trimmed.length > 0 ? trimmed : targetHeaderLabel;
  }, [comparisonHeaderOrthographies, locale, targetHeaderLabel, targetLayer]);

  const comparisonStyleMenuItems = useMemo((): ContextMenuItem[] => {
    if (!displayStyleControl || !sourceLayer || !targetLayer) return [];
    const sourceItems = buildLayerStyleMenuItems(
      sourceLayer.displaySettings,
      sourceLayer.id,
      sourceLayer.languageId,
      sourceLayer.orthographyId,
      displayStyleControl.orthographies,
      (patch) => displayStyleControl.onUpdate(sourceLayer.id, patch),
      () => displayStyleControl.onReset(sourceLayer.id),
      displayStyleControl.localFonts,
      locale,
    );
    const targetItems = buildLayerStyleMenuItems(
      targetLayer.displaySettings,
      targetLayer.id,
      targetLayer.languageId,
      targetLayer.orthographyId,
      displayStyleControl.orthographies,
      (patch) => displayStyleControl.onUpdate(targetLayer.id, patch),
      () => displayStyleControl.onReset(targetLayer.id),
      displayStyleControl.localFonts,
      locale,
    );
    return [
      { label: sourceHeaderLabel, variant: 'category', children: sourceItems },
      { label: targetHeaderLabel, variant: 'category', children: targetItems },
    ];
  }, [displayStyleControl, locale, sourceHeaderLabel, sourceLayer, targetHeaderLabel, targetLayer]);

  const [comparisonResizeFontPreviewByLayerId, setComparisonResizeFontPreviewByLayerId] = useState<Record<string, number>>({});

  const handleComparisonEditorLaneChange = useCallback((groupKey: string, nextHeight: number) => {
    setComparisonEditorHeightByGroup((prev) => {
      if (prev[groupKey] === nextHeight) return prev;
      return { ...prev, [groupKey]: nextHeight };
    });
  }, []);

  const handleComparisonEditorResizeEnd = useCallback((groupKey: string, finalHeight: number) => {
    setComparisonResizeFontPreviewByLayerId({});
    setComparisonEditorHeightByGroup((prev) => {
      const next = prev[groupKey] === finalHeight ? prev : { ...prev, [groupKey]: finalHeight };
      try {
        localStorage.setItem(COMPARISON_EDITOR_HEIGHT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    if (!displayStyleControl || !targetLayer || !groupKey.startsWith('comparison-editor:')) return;
    const groupId = groupKey.slice('comparison-editor:'.length);
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const orthographies = displayStyleControl.orthographies;
    const applyFont = (layer: LayerDocType, height: number) => {
      const pol = resolveOrthographyRenderPolicy(layer.languageId, orthographies, layer.orthographyId);
      const newFont = computeFontSizeFromRenderPolicy(height, pol);
      const oldFont = layer.displaySettings?.fontSize ?? BASE_FONT_SIZE;
      if (Math.abs(newFont - oldFont) > 0.1) {
        displayStyleControl.onUpdate(layer.id, { fontSize: newFont });
      }
    };
    const seenSource = new Set<string>();
    for (const item of group.sourceItems) {
      const lid = item.layerId ?? sourceLayer?.id ?? '';
      if (!lid || seenSource.has(lid)) continue;
      seenSource.add(lid);
      const layer = transcriptionLayers.find((l) => l.id === lid);
      if (layer) applyFont(layer, finalHeight);
    }
    applyFont(targetLayer, finalHeight);
  }, [displayStyleControl, groups, sourceLayer, targetLayer, transcriptionLayers]);

  const handleComparisonEditorResizePreview = useCallback((layerKey: string, previewHeight: number) => {
    if (!displayStyleControl || !targetLayer) return;
    if (!layerKey.startsWith('comparison-editor:')) return;
    const groupId = layerKey.slice('comparison-editor:'.length);
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const orthographies = displayStyleControl.orthographies;
    const next: Record<string, number> = {};
    const seenSource = new Set<string>();
    for (const item of group.sourceItems) {
      const lid = item.layerId ?? sourceLayer?.id ?? '';
      if (!lid || seenSource.has(lid)) continue;
      seenSource.add(lid);
      const layer = transcriptionLayers.find((l) => l.id === lid);
      if (!layer) continue;
      const pol = resolveOrthographyRenderPolicy(layer.languageId, orthographies, layer.orthographyId);
      next[lid] = computeFontSizeFromRenderPolicy(previewHeight, pol);
    }
    const tgtPol = resolveOrthographyRenderPolicy(targetLayer.languageId, orthographies, targetLayer.orthographyId);
    next[targetLayer.id] = computeFontSizeFromRenderPolicy(previewHeight, tgtPol);
    setComparisonResizeFontPreviewByLayerId((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length) {
        let same = true;
        for (const k of nextKeys) {
          if (prev[k] !== next[k]) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return next;
    });
  }, [displayStyleControl, groups, sourceLayer, targetLayer, transcriptionLayers]);

  const {
    resizingLayerId: resizingComparisonEditorId,
    startLaneHeightResize: startComparisonEditorResize,
  } = useTimelineLaneHeightResize(
    handleComparisonEditorLaneChange,
    handleComparisonEditorResizeEnd,
    handleComparisonEditorResizePreview,
  );

  const showBundleChips = bundleOrderById.size > 1;
  const isTargetHeaderActive = comparisonTargetSide === 'target' || (comparisonTargetSide == null && targetLayer?.id === focusedLayerRowId);
  const isSourceHeaderActive = !isTargetHeaderActive;
  const handleComparisonEditorResizeStart = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    groupId: string,
    currentHeight: number,
    edge: 'top' | 'bottom',
  ) => {
    startComparisonEditorResize(event, `comparison-editor:${groupId}`, currentHeight, edge);
  }, [startComparisonEditorResize]);
  const isComparisonEditorResizing = typeof resizingComparisonEditorId === 'string'
    && resizingComparisonEditorId.startsWith('comparison-editor:');
  const comparisonViewStyle = useMemo(() => ({
    '--timeline-comparison-left-grow': String(comparisonLeftGrow),
    '--timeline-comparison-right-grow': String(100 - comparisonLeftGrow),
    '--timeline-comparison-editor-min-height': `${defaultComparisonEditorHeight}px`,
  }) as CSSProperties, [comparisonLeftGrow, defaultComparisonEditorHeight]);

  const comparisonDualGridStyle = useMemo((): CSSProperties | undefined => {
    if (compactMode !== 'both' || isNarrowComparisonLayout) return undefined;
    return {
      gridTemplateColumns: `minmax(0, ${comparisonLeftGrow}fr) minmax(0, ${100 - comparisonLeftGrow}fr)`,
    };
  }, [compactMode, comparisonLeftGrow, isNarrowComparisonLayout]);

  useEffect(() => {
    if (!activeUnitId) return;

    const matchedGroup = groups.find((group) => (
      group.sourceItems.some((item) => item.unitId === activeUnitId)
      || group.targetItems.some((item) => item.anchorUnitIds.includes(activeUnitId))
    ));
    if (!matchedGroup) {
      patchComparisonFocus({
        activeComparisonGroupId: null,
        activeComparisonCellId: null,
        comparisonTargetSide: null,
        contextMenuSourceUnitId: null,
      });
      return;
    }

    const syncedSide = targetLayer?.id === focusedLayerRowId ? 'target' : 'source';
    const targetCellIdForSync = syncedSide === 'target'
      ? (comparisonUsesPerSegmentTargetEditors(matchedGroup) && matchedGroup.targetItems[0]
        ? `target:${matchedGroup.id}:${matchedGroup.targetItems[0].id}`
        : `target:${matchedGroup.id}:editor`)
      : `source:${activeUnitId}`;
    patchComparisonFocus({
      activeComparisonGroupId: matchedGroup.id,
      activeComparisonCellId: targetCellIdForSync,
      comparisonTargetSide: syncedSide,
      contextMenuSourceUnitId: activeUnitId,
    });
  }, [activeUnitId, focusedLayerRowId, groups, patchComparisonFocus, targetLayer?.id]);

  /** 波形/全局选中语段时，把对应对照组滚入 split-host 视口（tier 的横向 scroll 与对照纵向列表无关） */
  useLayoutEffect(() => {
    if (groups.length === 0) return;
    if (!activeUnitId) return;
    const host = comparisonSplitHostRef.current;
    if (!host) return;

    const matchedGroup = groups.find((group) => (
      group.sourceItems.some((item) => item.unitId === activeUnitId)
      || group.targetItems.some((item) => item.anchorUnitIds.includes(activeUnitId))
    ));
    if (!matchedGroup) return;

    let targetEl: HTMLElement | null = null;
    for (const node of host.querySelectorAll('[data-comparison-group-id]')) {
      if (node instanceof HTMLElement && node.getAttribute('data-comparison-group-id') === matchedGroup.id) {
        targetEl = node;
        break;
      }
    }
    if (!targetEl) return;

    if (typeof targetEl.scrollIntoView === 'function') {
      /* start：避免 block:nearest 在嵌套滚动里误判「已可见」而不滚 */
      targetEl.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' });
    }
  }, [activeUnitId, groups]);

  if (groups.length === 0) {
    return (
      <div
        className="timeline-comparison-view timeline-comparison-view-empty"
        role="status"
        aria-live="polite"
      >
        <p className="timeline-comparison-empty-hint">
          {translationLayers.length === 0
            ? t(locale, 'transcription.toolbar.comparisonRequiresTranslationLayer')
            : t(locale, 'transcription.comparison.emptyGroups')}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={comparisonViewRef}
      className={`timeline-comparison-view${isComparisonColumnSplitDragging ? ' timeline-comparison-view-column-split-active' : ''}${isComparisonEditorResizing ? ' timeline-comparison-view-resizing' : ''}`}
      data-testid="timeline-comparison-view"
      data-compact-mode={compactMode}
      style={comparisonViewStyle}
    >
      <div className="timeline-comparison-workspace">
        <div className="timeline-comparison-toolbar">
          <div className="timeline-comparison-mode-toggle" role="group" aria-label={t(locale, 'transcription.comparison.columnMode')}>
            <button
              type="button"
              className={`timeline-comparison-mode-btn${compactMode === 'both' ? ' is-active' : ''}`}
              aria-pressed={compactMode === 'both'}
              onClick={() => setCompactMode('both')}
            >
              {t(locale, 'transcription.comparison.allColumns')}
            </button>
            <button
              type="button"
              className={`timeline-comparison-mode-btn${compactMode === 'source' ? ' is-active' : ''}`}
              aria-pressed={compactMode === 'source'}
              onClick={() => setCompactMode('source')}
            >
              {t(locale, 'transcription.comparison.sourceOnly')}
            </button>
            <button
              type="button"
              className={`timeline-comparison-mode-btn${compactMode === 'target' ? ' is-active' : ''}`}
              aria-pressed={compactMode === 'target'}
              onClick={() => setCompactMode('target')}
            >
              {t(locale, 'transcription.comparison.translationOnly')}
            </button>
          </div>
          <div className="timeline-comparison-toolbar-spacer" aria-hidden />
          {comparisonStyleMenuItems.length > 0 ? (
            <button
              type="button"
              className="timeline-comparison-mode-btn timeline-comparison-layer-style-btn"
              aria-haspopup="menu"
              aria-expanded={layerStyleMenu != null}
              title={t(locale, 'transcription.comparison.layerDisplayStyles')}
              aria-label={t(locale, 'transcription.comparison.layerDisplayStyles')}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setLayerStyleMenu((prev) => {
                  const next = { x: r.left, y: r.bottom + 4 };
                  if (prev && Math.abs(prev.x - next.x) < 6 && Math.abs(prev.y - next.y) < 6) return null;
                  return next;
                });
              }}
            >
              {t(locale, 'transcription.comparison.layerDisplayStyles')}
            </button>
          ) : null}
        </div>
        <div ref={comparisonSplitHostRef} className="timeline-comparison-split-host">
          <div className="timeline-comparison-split-host-inner">
        {groups.map((group, groupIndex) => {
        const draftKey = targetLayer ? `cmp:${targetLayer.id}:${group.id}` : `cmp:none:${group.id}`;
        const anchorUnitIds = Array.from(new Set(group.targetItems.flatMap((item) => item.anchorUnitIds)));
        const initialTargetText = group.targetItems.map((item) => item.text).join('\n');
        const perSegTargets = comparisonUsesPerSegmentTargetEditors(group);
        const draft = translationDrafts[draftKey] ?? initialTargetText;
        const targetCellKey = targetLayer ? `cmp-target:${targetLayer.id}:${group.id}` : `cmp-target:none:${group.id}`;
        const targetSaveStatus = saveStatusByCellKey[targetCellKey];
        const isTargetDraftEmpty = normalizeComparisonText(draft).trim().length === 0;
        const comparisonEditorGroupKey = `comparison-editor:${group.id}`;
        const comparisonEditorHeight = comparisonEditorHeightByGroup[comparisonEditorGroupKey] ?? defaultComparisonEditorHeight;
        const primaryUnitId = group.sourceItems[0]?.unitId ?? '';
        const primarySourceUnit = primaryUnitId ? unitById.get(primaryUnitId) : undefined;
        const anchorForUi = resolveComparisonGroupAnchorForUi(group, contextMenuSourceUnitId, activeUnitId);
        const translationSegmentsForAudio = targetLayer ? segmentsByLayer?.get(targetLayer.id) ?? [] : [];
        const audioAnchorSeg = targetLayer && layerUsesOwnSegments(targetLayer, defaultTranscriptionLayerId)
          ? pickTranslationSegmentForPersist(translationSegmentsForAudio, group.startTime, group.endTime)
          : undefined;
        const derivedActive = activeUnitId != null && group.sourceItems.some((item) => item.unitId === activeUnitId);
        const isGroupActive = activeComparisonGroupId === group.id || (activeComparisonGroupId == null && derivedActive);
        const isTargetColumnFocused = isGroupActive && comparisonTargetSide === 'target';
        const audioScopeUnitId = resolveComparisonTranslationAudioScopeUnitId({
          audioAnchorSeg,
          anchorUnitIds,
          contextMenuSourceUnitId,
          activeUnitId,
          primaryUnitId,
          translationAudioByLayer,
          targetLayerId: targetLayer?.id,
        });
        const audioScopeId = audioScopeUnitId;
        const voiceSourceDoc = unitById.get(audioScopeUnitId) ?? primarySourceUnit;
        const targetNoteIndicator = anchorForUi.unitId
          ? resolveNoteIndicatorTarget?.(anchorForUi.unitId, targetLayer?.id) ?? null
          : null;
        const bundleOrdinal = group.bundleRootId ? bundleOrderById.get(group.bundleRootId) ?? null : null;
        const startsNewBundle = groupIndex === 0 || group.bundleRootId !== groups[groupIndex - 1]?.bundleRootId;
        const audioTranslation = targetLayer ? translationAudioByLayer?.get(targetLayer.id)?.get(audioScopeId) : undefined;
        const audioMedia = audioTranslation?.translationAudioMediaId
          ? mediaItemById.get(audioTranslation.translationAudioMediaId)
          : undefined;
        const isCurrentRecording = recording && recordingUnitId === audioScopeId && recordingLayerId === targetLayer?.id;
        const shouldShowAudioControls = Boolean(audioMedia) || isCurrentRecording;
        const audioControls = shouldShowAudioControls && targetLayer && voiceSourceDoc ? (
          <TimelineTranslationAudioControls
            {...(audioMedia ? { mediaItem: audioMedia } : {})}
            isRecording={isCurrentRecording}
            onStartRecording={() => {
              void startRecordingForUnit?.(voiceSourceDoc, targetLayer);
            }}
            {...(stopRecording ? { onStopRecording: stopRecording } : {})}
            {...(audioMedia && deleteVoiceTranslation ? {
              onDeleteRecording: () => deleteVoiceTranslation(voiceSourceDoc, targetLayer),
            } : {})}
          />
        ) : null;

        const orthographies = displayStyleControl?.orthographies ?? [];
        const comparisonEditorResizingThisGroup = resizingComparisonEditorId === comparisonEditorGroupKey;
        const targetPreviewFont = comparisonEditorResizingThisGroup && targetLayer
          ? comparisonResizeFontPreviewByLayerId[targetLayer.id]
          : undefined;
        const targetTypography = targetLayer
          ? buildOrthographyPreviewTextProps(
              resolveOrthographyRenderPolicy(targetLayer.languageId, orthographies, targetLayer.orthographyId),
              targetPreviewFont != null
                ? { ...targetLayer.displaySettings, fontSize: targetPreviewFont }
                : targetLayer.displaySettings,
            )
          : buildOrthographyPreviewTextProps(undefined, undefined);

        return (
          <div
            key={group.id}
            data-comparison-group-id={group.id}
            className={`timeline-comparison-group${isGroupActive ? ' timeline-comparison-group-active' : ''}${startsNewBundle ? ' timeline-comparison-group-bundle-start' : ''}`}
            style={{
              ...(comparisonDualGridStyle ?? {}),
              ...(comparisonEditorGroupKey in comparisonEditorHeightByGroup
                ? { '--timeline-comparison-editor-min-height': `${comparisonEditorHeight}px` }
                : {}),
            } as CSSProperties}
          >
            <div className="timeline-comparison-group-meta">
              <div className="timeline-comparison-group-meta-left">
                <div className="timeline-comparison-time">
                  {formatTime(group.startTime)} - {formatTime(group.endTime)}
                </div>
                {showBundleChips && startsNewBundle && bundleOrdinal ? (
                  <span className="timeline-comparison-chip timeline-comparison-chip-bundle">
                    {t(locale, 'transcription.comparison.bundleLabel')} {bundleOrdinal}
                  </span>
                ) : null}
                {group.speakerSummary.trim().length > 0 ? (
                  <span className="timeline-comparison-chip timeline-comparison-chip-speaker">
                    {group.speakerSummary}
                  </span>
                ) : null}
                {group.isMultiAnchorGroup ? (
                  <span className="timeline-comparison-chip timeline-comparison-chip-multi-anchor">
                    {t(locale, 'transcription.comparison.multiAnchor')}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="timeline-comparison-source-column">
              {group.sourceItems.map((item) => {
                const isSourceCardActive = item.unitId === activeUnitId || activeComparisonCellId === `source:${item.unitId}`;
                const sourceLayerId = item.layerId ?? sourceLayer?.id ?? '';
                const sourceDraftKey = `trc-${sourceLayerId || 'none'}-${item.unitId}`;
                const initialSourceText = normalizeComparisonText(item.text || '');
                const sourceDraft = unitDrafts[sourceDraftKey] ?? initialSourceText;
                const sourceRows = resolveComparisonEditorRows(sourceDraft);
                const sourceCellKey = `cmp-source:${sourceLayerId || 'none'}:${item.unitId}`;
                const sourceSaveStatus = saveStatusByCellKey[sourceCellKey];
                const isSourceDraftEmpty = normalizeComparisonText(sourceDraft).trim().length === 0;
                const sourceSelfCertainty = resolveSelfCertaintyForUnit?.(item.unitId, sourceLayerId || undefined);
                const sourceSelfCertaintyAmbiguous = !sourceSelfCertainty
                  && resolveSelfCertaintyAmbiguityForUnit?.(item.unitId, sourceLayerId || undefined) === true;
                const sourceNoteIndicator = resolveNoteIndicatorTarget?.(item.unitId, sourceLayerId || undefined) ?? null;
                const sourceBadge = renderComparisonOverlay({
                  locale,
                  certainty: sourceSelfCertainty,
                  ambiguous: sourceSelfCertaintyAmbiguous,
                  laneLabel: resolveComparisonLayerLabel(
                    transcriptionLayers.find((layer) => layer.id === sourceLayerId),
                    locale,
                    t(locale, 'transcription.comparison.sourceHeader'),
                  ),
                  noteCount: sourceNoteIndicator?.count ?? 0,
                  ...(sourceNoteIndicator && handleNoteClick
                    ? {
                        onNoteClick: (event: React.MouseEvent<SVGSVGElement>) => {
                          handleNoteClick(item.unitId, sourceNoteIndicator.layerId, event);
                        },
                      }
                    : {}),
                });
                const hasSourceBadge = Boolean(sourceSelfCertainty || sourceSelfCertaintyAmbiguous || sourceNoteIndicator);
                const sourceItemLayer = transcriptionLayers.find((layer) => layer.id === sourceLayerId);
                const sourcePreviewFont = comparisonEditorResizingThisGroup && sourceLayerId
                  ? comparisonResizeFontPreviewByLayerId[sourceLayerId]
                  : undefined;
                const sourceTypography = sourceItemLayer
                  ? buildOrthographyPreviewTextProps(
                      resolveOrthographyRenderPolicy(sourceItemLayer.languageId, orthographies, sourceItemLayer.orthographyId),
                      sourcePreviewFont != null
                        ? { ...sourceItemLayer.displaySettings, fontSize: sourcePreviewFont }
                        : sourceItemLayer.displaySettings,
                    )
                  : buildOrthographyPreviewTextProps(undefined, undefined);
                const sourceRowTitle = sourceItemLayer
                  ? (() => {
                      const inline = buildLaneHeaderInlineDotSeparatedLabel(
                        sourceItemLayer,
                        locale,
                        comparisonHeaderOrthographies,
                      ).trim();
                      return inline.length > 0
                        ? inline
                        : resolveComparisonLayerLabel(
                            sourceItemLayer,
                            locale,
                            t(locale, 'transcription.comparison.sourceHeader'),
                          );
                    })()
                  : t(locale, 'transcription.comparison.sourceHeader');
                const sourceRailAriaLabel = tf(locale, 'transcription.comparison.rowRailFocusLayer', { layer: sourceRowTitle });
                return (
                  <div key={item.unitId} className="timeline-comparison-editor-row timeline-comparison-editor-row-source">
                    <button
                      type="button"
                      className={`timeline-comparison-row-rail timeline-comparison-row-rail-source${isSourceHeaderActive ? ' is-active' : ''}`}
                      aria-pressed={isSourceHeaderActive}
                      aria-label={sourceRailAriaLabel}
                      title={sourceRowTitle}
                      data-testid={`comparison-source-rail-${group.id}-${item.unitId}`}
                      onClick={() => {
                        patchComparisonFocus({ comparisonTargetSide: 'source' });
                        if (sourceLayerId) onFocusLayer(sourceLayerId);
                      }}
                    >
                      <span className="timeline-comparison-row-rail-mark" aria-hidden>
                        {comparisonRowRailMark(sourceRowTitle)}
                      </span>
                    </button>
                    <TimelineDraftEditorSurface
                    multiline
                    wrapperClassName={[
                      'timeline-comparison-source-surface',
                      isSourceDraftEmpty ? 'timeline-comparison-source-surface-empty' : '',
                      isSourceCardActive ? 'timeline-comparison-source-surface-active' : '',
                      hasSourceBadge ? 'timeline-comparison-source-surface-has-self-certainty' : '',
                      hasSourceBadge ? 'timeline-comparison-source-surface-has-side-badges' : '',
                    ].filter(Boolean).join(' ')}
                    inputClassName={[
                      'timeline-comparison-source-card',
                      'timeline-comparison-source-input',
                      isSourceCardActive ? 'timeline-comparison-source-card-active' : '',
                      isSourceDraftEmpty ? 'timeline-comparison-source-card-empty' : '',
                    ].filter(Boolean).join(' ')}
                    value={sourceDraft}
                    rows={sourceRows}
                    placeholder={t(locale, 'transcription.timeline.placeholder.segment')}
                    disabled={!sourceLayerId}
                    {...(sourceTypography.dir ? { dir: sourceTypography.dir } : {})}
                    inputStyle={sourceTypography.style}
                    {...(sourceSaveStatus !== undefined ? { saveStatus: sourceSaveStatus } : {})}
                    overlay={sourceBadge}
                    onRetry={() => {
                      if (!sourceLayerId) return;
                      void runComparisonSaveWithStatus(sourceCellKey, async () => {
                        await persistSourceText(item.unitId, sourceDraft, sourceLayerId);
                      });
                    }}
                    onResizeHandlePointerDown={(event, edge) => {
                      handleComparisonEditorResizeStart(event, group.id, comparisonEditorHeight, edge);
                    }}
                    onFocus={() => {
                      patchComparisonFocus({
                        activeComparisonGroupId: group.id,
                        activeComparisonCellId: `source:${item.unitId}`,
                        comparisonTargetSide: 'source',
                        contextMenuSourceUnitId: item.unitId,
                      });
                      focusedTranslationDraftKeyRef.current = null;
                      if (sourceLayerId) onFocusLayer(sourceLayerId);
                    }}
                    onChange={(event) => {
                      const value = normalizeComparisonText(event.target.value);
                      patchComparisonFocus({
                        activeComparisonGroupId: group.id,
                        activeComparisonCellId: `source:${item.unitId}`,
                        comparisonTargetSide: 'source',
                      });
                      setUnitDrafts((prev) => ({ ...prev, [sourceDraftKey]: value }));
                      if (!sourceLayerId) return;
                      if (value !== initialSourceText) {
                        setComparisonCellSaveStatus(sourceCellKey, 'dirty');
                        scheduleAutoSave(`cmp-src-${sourceLayerId}-${item.unitId}`, async () => {
                          await runComparisonSaveWithStatus(sourceCellKey, async () => {
                            await persistSourceText(item.unitId, value, sourceLayerId);
                          });
                        });
                      } else {
                        clearAutoSaveTimer(`cmp-src-${sourceLayerId}-${item.unitId}`);
                        setComparisonCellSaveStatus(sourceCellKey);
                      }
                    }}
                    onBlur={(event) => {
                      const value = normalizeComparisonText(event.target.value);
                      if (!sourceLayerId) return;
                      clearAutoSaveTimer(`cmp-src-${sourceLayerId}-${item.unitId}`);
                      if (value !== initialSourceText) {
                        void runComparisonSaveWithStatus(sourceCellKey, async () => {
                          await persistSourceText(item.unitId, value, sourceLayerId);
                        });
                      } else {
                        setComparisonCellSaveStatus(sourceCellKey);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return;
                      if (navigateUnitFromInput && event.key === 'Tab') {
                        navigateUnitFromInput(event, event.shiftKey ? -1 : 1);
                        return;
                      }
                      if (event.key !== 'Escape') return;
                      event.preventDefault();
                      if (sourceLayerId) {
                        clearAutoSaveTimer(`cmp-src-${sourceLayerId}-${item.unitId}`);
                      }
                      setUnitDrafts((prev) => ({ ...prev, [sourceDraftKey]: initialSourceText }));
                      setComparisonCellSaveStatus(sourceCellKey);
                      event.currentTarget.blur();
                    }}
                    onClick={(event) => {
                      patchComparisonFocus({
                        activeComparisonGroupId: group.id,
                        activeComparisonCellId: `source:${item.unitId}`,
                        comparisonTargetSide: 'source',
                        contextMenuSourceUnitId: item.unitId,
                      });
                      if (!sourceLayerId) return;
                      handleAnnotationClick(item.unitId, item.startTime, sourceLayerId, event);
                      onFocusLayer(sourceLayerId);
                    }}
                    onContextMenu={(event) => {
                      if (!handleAnnotationContextMenu || !sourceLayerId) return;
                      const unitDoc = unitById.get(item.unitId);
                      if (!unitDoc) return;
                      patchComparisonFocus({
                        activeComparisonGroupId: group.id,
                        activeComparisonCellId: `source:${item.unitId}`,
                        comparisonTargetSide: 'source',
                        contextMenuSourceUnitId: item.unitId,
                      });
                      handleAnnotationContextMenu(item.unitId, unitToView(unitDoc, sourceLayerId), sourceLayerId, event);
                    }}
                  />
                  </div>
                );
              })}
            </div>

            <div className={`timeline-comparison-target-column${isTargetColumnFocused ? ' timeline-comparison-target-column-active' : ''}`}>
              {perSegTargets
                ? group.targetItems.map((targetItem, ti) => {
                    const itemDraftKey = targetLayer ? `cmp:${targetLayer.id}:${group.id}:${targetItem.id}` : `cmp:none:${group.id}:${targetItem.id}`;
                    const itemInitial = normalizeComparisonText(targetItem.text || '');
                    const itemDraft = translationDrafts[itemDraftKey] ?? itemInitial;
                    const itemCellKey = targetLayer
                      ? `cmp-target:${targetLayer.id}:${group.id}:${targetItem.id}`
                      : `cmp-target:none:${group.id}:${targetItem.id}`;
                    const itemSaveStatus = saveStatusByCellKey[itemCellKey];
                    const isItemDraftEmpty = normalizeComparisonText(itemDraft).trim().length === 0;
                    const isThisTargetRowActive = isGroupActive && comparisonTargetSide === 'target'
                      && activeComparisonCellId === `target:${group.id}:${targetItem.id}`;
                    const segAutoSaveKey = targetLayer
                      ? `cmp-seg-${targetLayer.id}-${group.id}-${targetItem.id}`
                      : `cmp-seg-none-${group.id}-${targetItem.id}`;
                    return (
                      <div key={targetItem.id} className="timeline-comparison-editor-row timeline-comparison-editor-row-target">
                <button
                  type="button"
                  className={`timeline-comparison-row-rail timeline-comparison-row-rail-target${isTargetHeaderActive ? ' is-active' : ''}`}
                  aria-pressed={isTargetHeaderActive}
                  aria-label={tf(locale, 'transcription.comparison.rowRailFocusLayer', { layer: targetHeaderContent })}
                  title={targetHeaderContent}
                  data-testid={`comparison-target-rail-${group.id}`}
                  onClick={() => {
                    patchComparisonFocus({ comparisonTargetSide: 'target' });
                    if (targetLayer?.id) onFocusLayer(targetLayer.id);
                  }}
                >
                  <span className="timeline-comparison-row-rail-mark" aria-hidden>
                    {comparisonRowRailMark(targetHeaderContent)}
                  </span>
                </button>
                <TimelineDraftEditorSurface
                multiline
                wrapperClassName={[
                  'timeline-comparison-target-surface',
                  isTargetDraftEmpty ? 'timeline-comparison-target-surface-empty' : '',
                  isTargetActive ? 'timeline-comparison-target-surface-active' : '',
                  targetNoteIndicator ? 'timeline-comparison-target-surface-has-side-badges' : '',
                ].filter(Boolean).join(' ')}
                inputClassName={[
                  'timeline-comparison-target-input',
                  isTargetDraftEmpty ? 'timeline-comparison-target-input-empty' : '',
                ].filter(Boolean).join(' ')}
                value={draft}
                rows={resolveComparisonEditorRows(draft)}
                placeholder={t(locale, 'transcription.timeline.placeholder.translation')}
                {...(group.editingTargetPolicy === 'multi-target-items'
                  ? { title: t(locale, 'transcription.comparison.multiTargetHint') }
                  : {})}
                disabled={!targetLayer}
                {...(targetTypography.dir ? { dir: targetTypography.dir } : {})}
                inputStyle={targetTypography.style}
                {...(targetSaveStatus !== undefined ? { saveStatus: targetSaveStatus } : {})}
                overlay={renderComparisonOverlay({
                  locale,
                  certainty: undefined,
                  ambiguous: false,
                  laneLabel: targetHeaderLabel,
                  noteCount: targetNoteIndicator?.count ?? 0,
                  ...(targetNoteIndicator && anchorForUi.unitId && handleNoteClick
                    ? {
                        onNoteClick: (event: React.MouseEvent<SVGSVGElement>) => {
                          handleNoteClick(anchorForUi.unitId, targetNoteIndicator.layerId, event);
                        },
                      }
                    : {}),
                })}
                onResizeHandlePointerDown={(event, edge) => {
                  handleComparisonEditorResizeStart(event, group.id, comparisonEditorHeight, edge);
                }}
                onRetry={() => {
                  if (!targetLayer) return;
                  void runComparisonSaveWithStatus(targetCellKey, async () => {
                    await persistGroupTranslation(group, anchorUnitIds, normalizeComparisonText(draft));
                  });
                }}
                {...(audioControls ? { tools: audioControls } : {})}
                toolsClassName="timeline-comparison-target-tools"
                onFocus={() => {
                  patchComparisonFocus({
                    activeComparisonGroupId: group.id,
                    activeComparisonCellId: `target:${group.id}:editor`,
                    comparisonTargetSide: 'target',
                    contextMenuSourceUnitId: anchorForUi.unitId || primaryUnitId || null,
                  });
                  focusedTranslationDraftKeyRef.current = draftKey;
                  if (targetLayer?.id) onFocusLayer(targetLayer.id);
                }}
                onChange={(event) => {
                  const value = normalizeComparisonText(event.target.value);
                  patchComparisonFocus({
                    activeComparisonGroupId: group.id,
                    activeComparisonCellId: `target:${group.id}:editor`,
                    comparisonTargetSide: 'target',
                  });
                  setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
                  if (!targetLayer) return;
                  if (value !== initialTargetText) {
                    setComparisonCellSaveStatus(targetCellKey, 'dirty');
                    scheduleAutoSave(`cmp-${targetLayer.id}-${group.id}`, async () => {
                      await runComparisonSaveWithStatus(targetCellKey, async () => {
                        await persistGroupTranslation(group, anchorUnitIds, value);
                      });
                    });
                  } else {
                    clearAutoSaveTimer(`cmp-${targetLayer.id}-${group.id}`);
                    setComparisonCellSaveStatus(targetCellKey);
                  }
                }}
                onBlur={(event) => {
                  focusedTranslationDraftKeyRef.current = null;
                  if (!targetLayer) return;
                  const value = normalizeComparisonText(event.target.value);
                  clearAutoSaveTimer(`cmp-${targetLayer.id}-${group.id}`);
                  if (value !== initialTargetText) {
                    void runComparisonSaveWithStatus(targetCellKey, async () => {
                      await persistGroupTranslation(group, anchorUnitIds, value);
                    });
                  } else {
                    setComparisonCellSaveStatus(targetCellKey);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (navigateUnitFromInput && event.key === 'Tab') {
                    navigateUnitFromInput(event, event.shiftKey ? -1 : 1);
                    return;
                  }
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  if (targetLayer?.id) {
                    clearAutoSaveTimer(`cmp-${targetLayer.id}-${group.id}`);
                  }
                  setTranslationDrafts((prev) => ({ ...prev, [draftKey]: initialTargetText }));
                  setComparisonCellSaveStatus(targetCellKey);
                  focusedTranslationDraftKeyRef.current = null;
                  event.currentTarget.blur();
                }}
                onClick={(event) => {
                  if (!anchorForUi.unitId || !targetLayer?.id) return;
                  patchComparisonFocus({
                    activeComparisonGroupId: group.id,
                    activeComparisonCellId: `target:${group.id}:editor`,
                    comparisonTargetSide: 'target',
                    contextMenuSourceUnitId: anchorForUi.unitId,
                  });
                  handleAnnotationClick(anchorForUi.unitId, anchorForUi.startTime, targetLayer.id, event);
                }}
                onContextMenu={(event) => {
                  if (!handleAnnotationContextMenu || !targetLayer?.id) return;
                  const menuSourceId = contextMenuSourceUnitId != null
                    && group.sourceItems.some((si) => si.unitId === contextMenuSourceUnitId)
                    ? contextMenuSourceUnitId
                    : primaryUnitId;
                  const menuUnitDoc = menuSourceId ? unitById.get(menuSourceId) : undefined;
                  if (!menuUnitDoc) return;
                  patchComparisonFocus({
                    activeComparisonGroupId: group.id,
                    activeComparisonCellId: `target:${group.id}:editor`,
                    comparisonTargetSide: 'target',
                  });
                  handleAnnotationContextMenu(menuSourceId, unitToView(menuUnitDoc, targetLayer.id), targetLayer.id, event);
                }}
              />
              </div>
            </div>
          </div>
        );
      })}
        {compactMode === 'both' && !isNarrowComparisonLayout ? (
          <div
            className="timeline-comparison-global-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={20}
            aria-valuemax={80}
            aria-valuenow={comparisonLeftGrow}
            aria-label={t(locale, 'transcription.comparison.columnResizeSeparator')}
            onPointerDown={handleComparisonSplitterPointerDown}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              resetComparisonColumnsToEqualWidth();
            }}
          />
        ) : null}
          </div>
        </div>
      </div>
      {layerStyleMenu && comparisonStyleMenuItems.length > 0 ? (
        <ContextMenu
          x={layerStyleMenu.x}
          y={layerStyleMenu.y}
          anchorOrigin="bottom-left"
          items={comparisonStyleMenuItems}
          onClose={() => setLayerStyleMenu(null)}
        />
      ) : null}
    </div>
  );
}
