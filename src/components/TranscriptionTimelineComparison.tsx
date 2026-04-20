import '../styles/pages/timeline/timeline-comparison.css';
import type {
  LayerDisplaySettings,
  LayerDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  MediaItemDocType,
  OrthographyDocType,
} from '../db';
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
import { TimelineDraftEditorSurface, type TimelineDraftSaveStatus } from './transcription/TimelineDraftEditorSurface';
import { normalizeSpeakerFocusKey, resolveSpeakerFocusKeyFromSegment } from './transcriptionTimelineSegmentSpeakerLayout';
import {
  buildComparisonGroups,
  buildComparisonTargetItemsFromRawText,
  listTranslationSegmentsForComparisonSourceUnit,
  pickTranslationSegmentForPersist,
  type ComparisonGroup,
  type ComparisonTargetItem,
} from '../utils/transcriptionComparisonGroups';
import { buildLayerBundles } from '../services/LayerOrderingService';
import { resolveHostAwareTranslationLayerIdFromSnapshot } from '../utils/translationLayerTargetResolver';
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
import { LayerActionPopover } from './LayerActionPopover';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { useLayerDeleteConfirm } from '../hooks/useLayerDeleteConfirm';
import { buildLayerOperationMenuItems, type LayerOperationActionType } from './layerOperationMenuItems';
import { TimelineBadges } from './TimelineBadges';
import { buildTimelineSelfCertaintyTitle } from '../utils/timelineSelfCertainty';
import {
  isComparisonLayerCollapsed,
  toggleComparisonCompactModeForLayer,
  type ComparisonCompactMode,
  type ComparisonLayerRole,
} from '../hooks/useTimelineVisibilityState';

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
  const fromPrimaryAnchor = () => {
    const id = typeof group.primaryAnchorUnitId === 'string' ? group.primaryAnchorUnitId.trim() : '';
    if (id.length === 0) return undefined;
    return { unitId: id, startTime: group.startTime };
  };
  const fromFirstSource = () => {
    const first = group.sourceItems[0];
    if (!first) return undefined;
    return { unitId: first.unitId, startTime: first.startTime };
  };
  return (
    fromId(contextMenuSourceUnitId)
    ?? fromId(activeUnitId)
    ?? fromFirstSource()
    ?? fromPrimaryAnchor()
    ?? { unitId: group.primaryAnchorUnitId, startTime: group.startTime }
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

function renderComparisonOverlay(input: {
  locale: Locale;
  certainty: UnitSelfCertainty | undefined;
  ambiguous: boolean;
  laneLabel: string;
  noteCount: number;
  onNoteClick?: (event: React.MouseEvent<SVGSVGElement>) => void;
}): ReactNode {
  const certaintyTitle = input.certainty
    ? buildTimelineSelfCertaintyTitle(input.locale, input.certainty, input.laneLabel)
    : undefined;
  return (
    <TimelineBadges
      locale={input.locale}
      {...(input.certainty ? { selfCertainty: input.certainty } : {})}
      {...(certaintyTitle ? { selfCertaintyTitle: certaintyTitle } : {})}
      {...(input.ambiguous ? { selfCertaintyAmbiguous: true } : {})}
      noteCount={input.noteCount}
      noteClassName="timeline-comparison-note-icon timeline-comparison-note-icon-active"
      wrapperClassName="timeline-comparison-surface-badges"
      {...(input.onNoteClick ? { onNoteClick: input.onNoteClick } : {})}
    />
  );
}

/** 首条语段顶相对层头再下移的余量（发丝线、subpixel、hover 外光）| clearance below dual-column header */
const COMPARISON_GLOBAL_SPLITTER_LINE_EXTRA_OFFSET_PX = 12;

/** 多目标译文时，纵向对照右列按子项逐行展示；segment 与换行拆分都适用 | Split target rows for one-to-many comparison groups */
function comparisonUsesSplitTargetEditors(group: ComparisonGroup): boolean {
  return group.editingTargetPolicy === 'multi-target-items' && group.targetItems.length > 1;
}

/** 对照组锚定到的原文层 id（用于对齐横向 `buildLayerBundles` 根块） | Source layer id for horizontal bundle mapping */
function resolveComparisonGroupSourceAnchorLayerId(
  group: ComparisonGroup,
  fallbackSourceLayerId: string | undefined,
): string | undefined {
  for (const item of group.sourceItems) {
    const lid = typeof item.layerId === 'string' ? item.layerId.trim() : '';
    if (lid.length > 0) return lid;
  }
  const anchor = typeof group.primaryAnchorLayerId === 'string' ? group.primaryAnchorLayerId.trim() : '';
  if (anchor.length > 0) return anchor;
  const fb = typeof fallbackSourceLayerId === 'string' ? fallbackSourceLayerId.trim() : '';
  return fb.length > 0 ? fb : undefined;
}

/** 与横向时间轴 `buildLayerBundles` 一致：每层 id → 其所属 bundle 根层 id | Same bundle roots as horizontal timeline */
function buildLayerIdToHorizontalBundleRootIdMap(layers: readonly LayerDocType[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const bundle of buildLayerBundles([...layers])) {
    const rootId = bundle.root.id;
    map.set(bundle.root.id, rootId);
    for (const child of bundle.transcriptionDependents) {
      map.set(child.id, rootId);
    }
    for (const child of bundle.translationDependents) {
      map.set(child.id, rootId);
    }
  }
  return map;
}

/**
 * 纵向「组块」= 横向 `buildLayerBundles` 的一条根 bundle（根层 id 为键）；无法映射时退回按对照组 id |
 * Comparison bundle aligns with horizontal layer bundle root id
 */
function resolveComparisonHorizontalBundleKey(
  group: ComparisonGroup,
  layerIdToBundleRootId: ReadonlyMap<string, string>,
  fallbackSourceLayerId: string | undefined,
): string {
  const anchorLayerId = resolveComparisonGroupSourceAnchorLayerId(group, fallbackSourceLayerId);
  if (anchorLayerId) {
    const root = layerIdToBundleRootId.get(anchorLayerId);
    if (root) return root;
  }
  return `__cmp_group:${group.id}`;
}

/** 纵向对照菜单文案小助手 | Small locale helper for comparison menus */
function comparisonMenuText(locale: Locale, zh: string, en: string): string {
  return locale === 'zh-CN' ? zh : en;
}

type ComparisonLayerActionType =
  Exclude<LayerOperationActionType, 'delete'>;

function resolveComparisonTargetPlainTextForLayer(
  unit: LayerUnitDocType,
  tLayer: LayerDocType,
  defaultTranscriptionLayerId: string | undefined,
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined,
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>> | undefined,
  translationTextByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>,
  unitByIdForSpeaker: ReadonlyMap<string, LayerUnitDocType>,
): string {
  const targetUsesSegments = layerUsesOwnSegments(tLayer, defaultTranscriptionLayerId);
  const translationSegmentsForTarget = segmentsByLayer?.get(tLayer.id);
  const layerContent = segmentContentByLayer?.get(tLayer.id);
  if (targetUsesSegments && layerContent) {
    const overlapping = listTranslationSegmentsForComparisonSourceUnit(
      unit,
      translationSegmentsForTarget,
      unitByIdForSpeaker,
    );
    if (overlapping.length === 0) {
      return translationTextByLayer.get(tLayer.id)?.get(unit.id)?.text ?? '';
    }
    return overlapping
      .map((s) => layerContent.get(s.id)?.text ?? '')
      .filter((line) => line.length > 0)
      .join('\n');
  }
  return translationTextByLayer.get(tLayer.id)?.get(unit.id)?.text ?? '';
}

function resolveComparisonExplicitTargetItemsForLayer(
  unit: LayerUnitDocType,
  tLayer: LayerDocType,
  defaultTranscriptionLayerId: string | undefined,
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined,
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>> | undefined,
  unitByIdForSpeaker: ReadonlyMap<string, LayerUnitDocType>,
): ComparisonTargetItem[] | undefined {
  const targetUsesSegments = layerUsesOwnSegments(tLayer, defaultTranscriptionLayerId);
  const translationSegmentsForTarget = segmentsByLayer?.get(tLayer.id);
  const layerContent = segmentContentByLayer?.get(tLayer.id);
  if (!targetUsesSegments || !layerContent || !translationSegmentsForTarget?.length) return undefined;
  const overlapping = listTranslationSegmentsForComparisonSourceUnit(
    unit,
    translationSegmentsForTarget,
    unitByIdForSpeaker,
  );
  if (overlapping.length === 0) return undefined;
  return overlapping.map((s) => ({
    id: `${unit.id}:target:seg:${s.id}`,
    text: normalizeSingleLine(layerContent.get(s.id)?.text ?? ''),
    anchorUnitIds: [unit.id],
    translationSegmentId: s.id,
  }));
}

/** 无 parent 的译文层在多转写项目中的回落宿主（默认转写或列表首层） */
function resolveOrphanTranslationAttachTranscriptionLayerId(
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
): string | undefined {
  const d = defaultTranscriptionLayerId?.trim();
  if (d && transcriptionLayers.some((l) => l.id === d)) return d;
  return transcriptionLayers[0]?.id;
}

function translationLayerAppliesToComparisonSourceTranscriptionIds(
  tl: LayerDocType,
  sourceTranscriptionIds: ReadonlySet<string>,
  transcriptionLayerCount: number,
  orphanAttachLayerId: string | undefined,
): boolean {
  const parent = tl.parentLayerId?.trim() ?? '';
  if (parent.length > 0) {
    if (sourceTranscriptionIds.size === 0) return false;
    return sourceTranscriptionIds.has(parent);
  }
  if (transcriptionLayerCount <= 1) return true;
  if (!orphanAttachLayerId) return false;
  return sourceTranscriptionIds.has(orphanAttachLayerId);
}

function collectComparisonGroupSourceTranscriptionLayerIds(
  group: ComparisonGroup,
  fallbackTranscriptionLayerId: string | undefined,
): Set<string> {
  const sourceIds = new Set<string>();
  for (const si of group.sourceItems) {
    const id = si.layerId?.trim();
    if (id) sourceIds.add(id);
  }
  if (sourceIds.size === 0) {
    const primary = group.primaryAnchorLayerId?.trim();
    if (primary) sourceIds.add(primary);
  }
  if (sourceIds.size === 0 && fallbackTranscriptionLayerId?.trim()) {
    sourceIds.add(fallbackTranscriptionLayerId.trim());
  }
  return sourceIds;
}

function filterTranslationLayersForComparisonGroup(
  group: ComparisonGroup,
  translationLayers: readonly LayerDocType[],
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
  fallbackFocusedTranscriptionLayerId: string | undefined,
): LayerDocType[] {
  const transcriptionLayerCount = transcriptionLayers.length;
  const orphanAttach = resolveOrphanTranslationAttachTranscriptionLayerId(
    transcriptionLayers,
    defaultTranscriptionLayerId,
  );
  const fb = fallbackFocusedTranscriptionLayerId?.trim()
    ?? resolveOrphanTranslationAttachTranscriptionLayerId(transcriptionLayers, defaultTranscriptionLayerId);
  const sourceIds = collectComparisonGroupSourceTranscriptionLayerIds(group, fb);
  return translationLayers.filter((tl) => translationLayerAppliesToComparisonSourceTranscriptionIds(
    tl,
    sourceIds,
    transcriptionLayerCount,
    orphanAttach,
  ));
}

function resolveComparisonGroupEmptyReason(
  group: ComparisonGroup,
  translationLayers: readonly LayerDocType[],
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
  fallbackFocusedTranscriptionLayerId: string | undefined,
): 'no-child' | 'orphan-needs-repair' {
  if (translationLayers.length === 0) return 'no-child';
  if (transcriptionLayers.length <= 1) return 'no-child';
  const hasOrphanLayer = translationLayers.some((layer) => (layer.parentLayerId?.trim() ?? '').length === 0);
  if (!hasOrphanLayer) return 'no-child';
  const orphanAttachLayerId = resolveOrphanTranslationAttachTranscriptionLayerId(
    transcriptionLayers,
    defaultTranscriptionLayerId,
  );
  if (!orphanAttachLayerId) return 'no-child';
  const fallbackSourceLayerId = fallbackFocusedTranscriptionLayerId?.trim()
    ?? resolveOrphanTranslationAttachTranscriptionLayerId(transcriptionLayers, defaultTranscriptionLayerId);
  const sourceIds = collectComparisonGroupSourceTranscriptionLayerIds(group, fallbackSourceLayerId);
  return sourceIds.has(orphanAttachLayerId) ? 'no-child' : 'orphan-needs-repair';
}

function pickTranslationLayerForComparisonUnit(
  unit: LayerUnitDocType,
  allTranslationLayers: readonly LayerDocType[],
  preferred: LayerDocType | undefined,
  transcriptionLayers: readonly LayerDocType[],
  defaultTranscriptionLayerId: string | undefined,
): LayerDocType | undefined {
  if (allTranslationLayers.length === 0) return undefined;
  const transcriptionLayerCount = transcriptionLayers.length;
  const unitSourceId = typeof unit.layerId === 'string' ? unit.layerId.trim() : '';
  if (!unitSourceId && transcriptionLayerCount > 1) {
    return preferred ?? allTranslationLayers[0];
  }
  const orphanAttach = resolveOrphanTranslationAttachTranscriptionLayerId(
    transcriptionLayers,
    defaultTranscriptionLayerId,
  );
  const sourceIds = new Set(unitSourceId ? [unitSourceId] : []);
  const candidates = allTranslationLayers.filter((tl) => translationLayerAppliesToComparisonSourceTranscriptionIds(
    tl,
    sourceIds,
    transcriptionLayerCount,
    orphanAttach,
  ));
  if (candidates.length === 0) {
    if (transcriptionLayerCount <= 1) return preferred ?? allTranslationLayers[0];
    if (!unitSourceId) return preferred ?? allTranslationLayers[0];
    return undefined;
  }
  const preferredTranslationId = preferred?.layerType === 'translation' ? preferred.id : undefined;
  const resolvedId = resolveHostAwareTranslationLayerIdFromSnapshot({
    selectedLayerId: preferredTranslationId,
    selectedUnitLayerId: unitSourceId || null,
    defaultTranscriptionLayerId: defaultTranscriptionLayerId ?? null,
    translationLayers: candidates,
  });
  if (!resolvedId) return candidates[0];
  return candidates.find((c) => c.id === resolvedId) ?? candidates[0];
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
        const segLayerId = typeof segment.layerId === 'string' ? segment.layerId.trim() : '';
        push(segLayerId.length > 0 ? segment : { ...segment, layerId: layer.id });
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

type ComparisonRailLaneLabelMode = 'full' | 'continuation';

/** 与横向时间轴 `renderLaneLabel` 一致的多行层头；无层或回调空时回落单字标记 */
function renderComparisonRailLaneBody(input: {
  layer: LayerDocType | undefined;
  renderLaneLabel: (layer: LayerDocType) => ReactNode;
  fallbackTitle: string;
  mode: ComparisonRailLaneLabelMode;
}): ReactNode {
  if (input.mode === 'continuation') {
    return (
      <span
        className="timeline-comparison-row-rail-lane-label timeline-comparison-row-rail-lane-label-continuation"
        aria-hidden
      >
        ·
      </span>
    );
  }
  if (input.layer) {
    const body = input.renderLaneLabel(input.layer);
    if (body != null && body !== false && body !== '') {
      return <span className="timeline-comparison-row-rail-lane-label" aria-hidden>{body}</span>;
    }
  }
  return (
    <span className="timeline-comparison-row-rail-mark" aria-hidden>
      {comparisonRowRailMark(input.fallbackTitle)}
    </span>
  );
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
  deletableLayers?: LayerDocType[];
  defaultLanguageId?: string;
  defaultOrthographyId?: string;
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
  deletableLayers,
  defaultLanguageId,
  defaultOrthographyId,
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
  const [compactMode, setCompactMode] = useState<ComparisonCompactMode>('both');
  /** 按语段 rootUnitId 对照组块筛选；与侧栏「层树 bundle」无关 | Filter comparison rows by unit bundle root id */
  const [comparisonBundleFilterRootId, setComparisonBundleFilterRootId] = useState<string | null>(null);
  const [layerContextMenu, setLayerContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
    anchorOrigin?: 'top-left' | 'bottom-left';
  } | null>(null);
  const [layerAction, setLayerAction] = useState<{ action: ComparisonLayerActionType; layerId: string | undefined } | null>(null);
  const [comparisonLeftGrow, setComparisonLeftGrow] = useState(readStoredComparisonLeftGrow);
  const [comparisonEditorHeightByGroup, setComparisonEditorHeightByGroup] = useState<Record<string, number>>(readStoredComparisonEditorHeightMap);
  const [defaultComparisonEditorHeight] = useState(readStoredComparisonEditorHeight);
  const comparisonViewRef = useRef<HTMLDivElement | null>(null);
  const comparisonSplitHostRef = useRef<HTMLDivElement | null>(null);
  const comparisonLeftGrowRef = useRef(comparisonLeftGrow);
  const comparisonSplitDragRef = useRef<{ pointerId: number } | null>(null);
  const comparisonSplitPendingClientXRef = useRef<number | null>(null);
  const comparisonSplitDragRafRef = useRef<number | null>(null);
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
    comparisonSplitPendingClientXRef.current = null;
    if (comparisonSplitDragRafRef.current != null) {
      cancelAnimationFrame(comparisonSplitDragRafRef.current);
      comparisonSplitDragRafRef.current = null;
    }
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

    const applyComparisonSplitClientX = (clientX: number) => {
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
      comparisonLeftGrowRef.current = next;
      setComparisonLeftGrow(next);
    };

    const flushScheduledComparisonSplit = () => {
      if (comparisonSplitDragRafRef.current != null) {
        cancelAnimationFrame(comparisonSplitDragRafRef.current);
        comparisonSplitDragRafRef.current = null;
      }
      const pending = comparisonSplitPendingClientXRef.current;
      comparisonSplitPendingClientXRef.current = null;
      if (pending != null) {
        applyComparisonSplitClientX(pending);
      }
    };

    const scheduleComparisonSplitClientX = (clientX: number) => {
      comparisonSplitPendingClientXRef.current = clientX;
      if (comparisonSplitDragRafRef.current != null) return;
      comparisonSplitDragRafRef.current = requestAnimationFrame(() => {
        comparisonSplitDragRafRef.current = null;
        const pending = comparisonSplitPendingClientXRef.current;
        if (pending == null) return;
        applyComparisonSplitClientX(pending);
      });
    };

    const onWindowPointerMove = (ev: PointerEvent) => {
      if (comparisonSplitDragRef.current?.pointerId !== ev.pointerId) return;
      scheduleComparisonSplitClientX(ev.clientX);
    };

    const finish = (ev: PointerEvent) => {
      if (comparisonSplitDragRef.current?.pointerId !== ev.pointerId) return;
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      comparisonSplitCleanupRef.current = null;
      comparisonSplitDragRef.current = null;
      flushScheduledComparisonSplit();
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
      if (comparisonSplitDragRafRef.current != null) {
        cancelAnimationFrame(comparisonSplitDragRafRef.current);
        comparisonSplitDragRafRef.current = null;
      }
      comparisonSplitPendingClientXRef.current = null;
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    document.body.style.userSelect = 'none';
    setIsComparisonColumnSplitDragging(true);
    applyComparisonSplitClientX(event.clientX);
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
    renderLaneLabel,
    createLayer,
    updateLayerMetadata,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
  } = useTranscriptionEditorContext();

  const effectiveAllLayersOrdered = useMemo(
    () => (allLayersOrdered && allLayersOrdered.length > 0
      ? allLayersOrdered
      : [...transcriptionLayers, ...translationLayers]),
    [allLayersOrdered, transcriptionLayers, translationLayers],
  );
  const layerIdToHorizontalBundleRootId = useMemo(
    () => buildLayerIdToHorizontalBundleRootIdMap(effectiveAllLayersOrdered),
    [effectiveAllLayersOrdered],
  );
  const horizontalBundleRootIdsOrdered = useMemo(
    () => buildLayerBundles([...effectiveAllLayersOrdered]).map((b) => b.root.id),
    [effectiveAllLayersOrdered],
  );
  const effectiveDeletableLayers = deletableLayers ?? effectiveAllLayersOrdered;
  const canOpenTranslationCreate = effectiveAllLayersOrdered.some((item) => item.layerType === 'transcription');

  const {
    deleteLayerConfirm,
    deleteConfirmKeepUnits,
    setDeleteConfirmKeepUnits,
    requestDeleteLayer,
    cancelDeleteLayerConfirm,
    confirmDeleteLayer,
  } = useLayerDeleteConfirm({
    deletableLayers: effectiveDeletableLayers,
    checkLayerHasContent,
    deleteLayer,
    deleteLayerWithoutConfirm,
  });

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


  const mediaItemById = useMemo(
    () => new Map(mediaItems.map((item) => [item.id, item] as const)),
    [mediaItems],
  );

  /** 与媒体/文本时间轴一致：语段化转写下一语段一行译文，禁止按「相同译文」把相邻语段并成一组 */
  const comparisonUsesSegmentSourceRows = useMemo(
    () => transcriptionLayers.some(
      (l) => layerUsesOwnSegments(l, defaultTranscriptionLayerId),
    ),
    [transcriptionLayers, defaultTranscriptionLayerId],
  );

  const groups = useMemo(() => {
    const disableMergeForGrouping = comparisonUsesSegmentSourceRows || translationLayers.length > 1;
    return buildComparisonGroups({
      units: comparisonGroupSourceUnits,
      ...(disableMergeForGrouping ? { maxMergeGapSec: -1 } : {}),
      sourceLayerIds: transcriptionLayers.map((layer) => layer.id),
      getSourceText: (unit) => {
        const layerId = (typeof unit.layerId === 'string' && unit.layerId.trim()) || sourceLayer?.id;
        return getUnitTextForLayer(unit, layerId) || getUnitTextForLayer(unit) || '';
      },
      getTargetText: (unit) => {
        const tPick = pickTranslationLayerForComparisonUnit(
          unit,
          translationLayers,
          targetLayer,
          transcriptionLayers,
          defaultTranscriptionLayerId,
        );
        if (!tPick) return '';
        return resolveComparisonTargetPlainTextForLayer(
          unit,
          tPick,
          defaultTranscriptionLayerId,
          segmentsByLayer,
          segmentContentByLayer,
          translationTextByLayer,
          unitByIdForSpeaker,
        );
      },
      getTargetItems: (unit) => {
        const tPick = pickTranslationLayerForComparisonUnit(
          unit,
          translationLayers,
          targetLayer,
          transcriptionLayers,
          defaultTranscriptionLayerId,
        );
        if (!tPick) return undefined;
        return resolveComparisonExplicitTargetItemsForLayer(
          unit,
          tPick,
          defaultTranscriptionLayerId,
          segmentsByLayer,
          segmentContentByLayer,
          unitByIdForSpeaker,
        );
      },
      getSpeakerLabel: (unit) => speakerVisualByUnitId[unit.id]?.name ?? '',
    });
  }, [
    comparisonUsesSegmentSourceRows,
    comparisonGroupSourceUnits,
    defaultTranscriptionLayerId,
    getUnitTextForLayer,
    segmentContentByLayer,
    segmentsByLayer,
    sourceLayer?.id,
    targetLayer,
    speakerVisualByUnitId,
    transcriptionLayers,
    translationLayers,
    translationTextByLayer,
    unitByIdForSpeaker,
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

  const persistGroupTranslation = useCallback(async (
    persistLayer: LayerDocType,
    group: ComparisonGroup,
    anchorUnitIds: string[],
    value: string,
  ) => {
    const usesSeg = layerUsesOwnSegments(persistLayer, defaultTranscriptionLayerId);
    if (usesSeg && saveSegmentContentForLayer) {
      const trSegs = segmentsByLayer?.get(persistLayer.id) ?? [];
      const pick = pickTranslationSegmentForPersist(trSegs, group.startTime, group.endTime);
      if (pick?.id) {
        await saveSegmentContentForLayer(pick.id, persistLayer.id, value);
        return;
      }
      const hint = t(locale, 'transcription.comparison.segmentMissingForSave');
      showToast(hint, 'error', 8000);
      throw new Error('COMPARISON_SEGMENT_PERSIST_BLOCKED');
    }
    await Promise.all(anchorUnitIds.map((unitId) => saveUnitLayerText(unitId, value, persistLayer.id)));
  }, [
    defaultTranscriptionLayerId,
    locale,
    saveSegmentContentForLayer,
    saveUnitLayerText,
    segmentsByLayer,
    showToast,
  ]);

  const persistComparisonTargetTranslation = useCallback(async (
    persistLayer: LayerDocType,
    targetItem: ComparisonTargetItem,
    group: ComparisonGroup,
    anchorUnitIds: string[],
    value: string,
    combinedValue?: string,
  ) => {
    const segId = typeof targetItem.translationSegmentId === 'string' ? targetItem.translationSegmentId.trim() : '';
    if (segId.length > 0 && saveSegmentContentForLayer) {
      await saveSegmentContentForLayer(segId, persistLayer.id, value);
      return;
    }
    await persistGroupTranslation(persistLayer, group, anchorUnitIds, combinedValue ?? value);
  }, [persistGroupTranslation, saveSegmentContentForLayer]);

  const persistSourceText = useCallback(async (unitId: string, value: string, layerId?: string) => {
    await saveUnitText(unitId, value, layerId);
  }, [saveUnitText]);

  const comparisonGroupHorizontalBundleKeysPresent = useMemo(() => {
    const present = new Set<string>();
    for (const g of groups) {
      present.add(resolveComparisonHorizontalBundleKey(g, layerIdToHorizontalBundleRootId, sourceLayer?.id));
    }
    return present;
  }, [groups, layerIdToHorizontalBundleRootId, sourceLayer?.id]);

  const orderedDistinctBundleKeys = useMemo(() => {
    const ordered = horizontalBundleRootIdsOrdered.filter((id) => comparisonGroupHorizontalBundleKeysPresent.has(id));
    const orphan = [...comparisonGroupHorizontalBundleKeysPresent]
      .filter((k) => k.startsWith('__cmp_group:'))
      .filter((k) => !ordered.includes(k))
      .sort();
    return [...ordered, ...orphan];
  }, [comparisonGroupHorizontalBundleKeysPresent, horizontalBundleRootIdsOrdered]);

  const bundleOrdinalByKey = useMemo(() => {
    const map = new Map<string, number>();
    let nextIndex = 1;
    for (const key of orderedDistinctBundleKeys) {
      map.set(key, nextIndex);
      nextIndex += 1;
    }
    return map;
  }, [orderedDistinctBundleKeys]);

  const visibleGroups = useMemo(() => {
    if (comparisonBundleFilterRootId == null) return groups;
    return groups.filter(
      (g) => resolveComparisonHorizontalBundleKey(g, layerIdToHorizontalBundleRootId, sourceLayer?.id)
        === comparisonBundleFilterRootId,
    );
  }, [comparisonBundleFilterRootId, groups, layerIdToHorizontalBundleRootId, sourceLayer?.id]);

  useEffect(() => {
    if (orderedDistinctBundleKeys.length <= 1) {
      setComparisonBundleFilterRootId(null);
      return;
    }
    if (
      comparisonBundleFilterRootId != null
      && !orderedDistinctBundleKeys.includes(comparisonBundleFilterRootId)
    ) {
      setComparisonBundleFilterRootId(null);
    }
  }, [comparisonBundleFilterRootId, orderedDistinctBundleKeys]);

  const bundleFilterMenuItems = useMemo((): ContextMenuItem[] => {
    if (orderedDistinctBundleKeys.length <= 1) return [];
    const bundleLabelText = t(locale, 'transcription.comparison.bundleLabel');
    const items: ContextMenuItem[] = [
      {
        label: t(locale, 'transcription.comparison.bundleFilterAll'),
        selectionState: comparisonBundleFilterRootId == null ? 'selected' : 'unselected',
        selectionVariant: 'check',
        onClick: () => setComparisonBundleFilterRootId(null),
      },
    ];
    for (const bundleKey of orderedDistinctBundleKeys) {
      const ord = bundleOrdinalByKey.get(bundleKey) ?? 0;
      const rootLayer = bundleKey.startsWith('__cmp_group:')
        ? undefined
        : effectiveAllLayersOrdered.find((l) => l.id === bundleKey);
      const name = rootLayer
        ? resolveComparisonLayerLabel(
            rootLayer,
            locale,
            `${bundleLabelText} ${ord}`,
          )
        : tf(locale, 'transcription.comparison.bundleFilterFallbackItem', { ordinal: ord });
      items.push({
        label: name,
        selectionState: comparisonBundleFilterRootId === bundleKey ? 'selected' : 'unselected',
        selectionVariant: 'check',
        onClick: () => setComparisonBundleFilterRootId(bundleKey),
      });
    }
    return items;
  }, [bundleOrdinalByKey, comparisonBundleFilterRootId, effectiveAllLayersOrdered, locale, orderedDistinctBundleKeys]);

  const bundleFilterButtonTitle = useMemo(() => {
    if (orderedDistinctBundleKeys.length <= 1) return '';
    if (comparisonBundleFilterRootId == null) {
      return t(locale, 'transcription.comparison.bundleFilterTitleAll');
    }
    const ord = bundleOrdinalByKey.get(comparisonBundleFilterRootId) ?? 0;
    const rootLayer = comparisonBundleFilterRootId.startsWith('__cmp_group:')
      ? undefined
      : effectiveAllLayersOrdered.find((l) => l.id === comparisonBundleFilterRootId);
    const name = rootLayer
      ? resolveComparisonLayerLabel(
          rootLayer,
          locale,
          `${t(locale, 'transcription.comparison.bundleLabel')} ${ord}`,
        )
      : tf(locale, 'transcription.comparison.bundleFilterFallbackItem', { ordinal: ord });
    return tf(locale, 'transcription.comparison.bundleFilterTitleOne', { name });
  }, [bundleOrdinalByKey, comparisonBundleFilterRootId, effectiveAllLayersOrdered, locale, orderedDistinctBundleKeys]);

  const sourceHeaderLabel = useMemo(
    () => resolveComparisonLayerLabel(sourceLayer, locale, t(locale, 'transcription.comparison.sourceHeader')),
    [locale, sourceLayer],
  );

  const comparisonHeaderOrthographies = displayStyleControl?.orthographies ?? [];

  const resolveComparisonHeaderContentForLayer = useCallback((layer: LayerDocType | undefined, fallbackLabel: string): string => {
    if (!layer) return fallbackLabel;
    const inline = buildLaneHeaderInlineDotSeparatedLabel(layer, locale, comparisonHeaderOrthographies);
    const trimmed = inline.trim();
    return trimmed.length > 0 ? trimmed : fallbackLabel;
  }, [comparisonHeaderOrthographies, locale]);

  const sourceHeaderContent = useMemo(() => {
    return resolveComparisonHeaderContentForLayer(sourceLayer, sourceHeaderLabel);
  }, [resolveComparisonHeaderContentForLayer, sourceHeaderLabel, sourceLayer]);

  const activeComparisonGroupForHeader = useMemo(() => {
    if (groups.length === 0) return undefined;
    if (activeComparisonGroupId) {
      const exact = groups.find((g) => g.id === activeComparisonGroupId);
      if (exact) return exact;
    }
    if (activeUnitId) {
      const byUnit = groups.find((g) => (
        g.sourceItems.some((item) => item.unitId === activeUnitId)
        || g.targetItems.some((item) => item.anchorUnitIds.includes(activeUnitId))
      ));
      if (byUnit) return byUnit;
    }
    return groups[0];
  }, [activeComparisonGroupId, activeUnitId, groups]);

  const headerTargetLayers = useMemo(() => {
    if (translationLayers.length === 0) return [] as LayerDocType[];
    const fromGroup = activeComparisonGroupForHeader
      ? filterTranslationLayersForComparisonGroup(
          activeComparisonGroupForHeader,
          translationLayers,
          transcriptionLayers,
          defaultTranscriptionLayerId,
          sourceLayer?.id,
        )
      : [];
    if (activeComparisonGroupForHeader && fromGroup.length === 0) {
      return [];
    }
    const resolved = fromGroup.length > 0
      ? fromGroup
      : (targetLayer ? [targetLayer] : (translationLayers[0] ? [translationLayers[0]] : []));
    if (!targetLayer) return resolved;
    const preferred = resolved.find((l) => l.id === targetLayer.id);
    if (!preferred) return resolved;
    return [preferred, ...resolved.filter((l) => l.id !== preferred.id)];
  }, [
    activeComparisonGroupForHeader,
    defaultTranscriptionLayerId,
    sourceLayer?.id,
    targetLayer,
    transcriptionLayers,
    translationLayers,
  ]);

  const comparisonStyleMenuItems = useMemo((): ContextMenuItem[] => {
    if (!displayStyleControl || !sourceLayer) return [];
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
    const categories: ContextMenuItem[] = [
      { label: sourceHeaderLabel, variant: 'category', children: sourceItems },
    ];
    for (const tl of headerTargetLayers) {
      const tlLabel = resolveComparisonLayerLabel(
        tl,
        locale,
        t(locale, 'transcription.comparison.translationHeader'),
      );
      const tlMenu = buildLayerStyleMenuItems(
        tl.displaySettings,
        tl.id,
        tl.languageId,
        tl.orthographyId,
        displayStyleControl.orthographies,
        (patch) => displayStyleControl.onUpdate(tl.id, patch),
        () => displayStyleControl.onReset(tl.id),
        displayStyleControl.localFonts,
        locale,
      );
      categories.push({ label: tlLabel, variant: 'category', children: tlMenu });
    }
    return categories;
  }, [displayStyleControl, headerTargetLayers, locale, sourceHeaderLabel, sourceLayer]);

  const buildComparisonHeaderMenuItems = useCallback((layer: LayerDocType | undefined, headerLabel: string): ContextMenuItem[] => {
    const horizontalOnlyMeta = comparisonMenuText(locale, '仅横向时间轴可用', 'Horizontal timeline only');

    const isSourceHeaderLayer = layer?.id != null && layer.id === sourceLayer?.id;
    const layerRole: ComparisonLayerRole = isSourceHeaderLayer ? 'source' : 'target';
    const isLayerCollapsed = isComparisonLayerCollapsed(compactMode, layerRole);
    const toggleLayerCollapsed = () => {
      if (!layer?.id) return;
      setCompactMode((prev) => toggleComparisonCompactModeForLayer(prev, layerRole));
    };

    const items: ContextMenuItem[] = [
      {
        label: tf(locale, 'transcription.comparison.rowRailFocusLayer', { layer: headerLabel }),
        disabled: !layer?.id,
        onClick: () => {
          if (layer?.id) onFocusLayer(layer.id);
        },
      },
      {
        label: comparisonMenuText(locale, '视图', 'View'),
        variant: 'category',
        separatorBefore: true,
        children: [
          {
            label: t(locale, 'transcription.comparison.allColumns'),
            selectionState: compactMode === 'both' ? 'selected' : 'unselected',
            selectionVariant: 'check',
            onClick: () => setCompactMode('both'),
          },
          {
            label: t(locale, 'transcription.comparison.sourceOnly'),
            selectionState: compactMode === 'source' ? 'selected' : 'unselected',
            selectionVariant: 'check',
            onClick: () => setCompactMode('source'),
          },
          {
            label: t(locale, 'transcription.comparison.translationOnly'),
            selectionState: compactMode === 'target' ? 'selected' : 'unselected',
            selectionVariant: 'check',
            onClick: () => setCompactMode('target'),
          },
          {
            label: comparisonMenuText(
              locale,
              isLayerCollapsed ? '展开该层' : '折叠该层',
              isLayerCollapsed ? 'Expand layer' : 'Collapse layer',
            ),
            separatorBefore: true,
            disabled: !layer?.id,
            onClick: toggleLayerCollapsed,
          },
          {
            label: comparisonMenuText(locale, '显示层级关系', 'Show layer links'),
            meta: horizontalOnlyMeta,
            disabled: true,
          },
        ],
      },
    ];

    if (displayStyleControl && layer) {
      items.push({
        label: t(locale, 'transcription.comparison.layerDisplayStyles'),
        variant: 'category',
        children: buildLayerStyleMenuItems(
          layer.displaySettings,
          layer.id,
          layer.languageId,
          layer.orthographyId,
          displayStyleControl.orthographies,
          (patch) => displayStyleControl.onUpdate(layer.id, patch),
          () => displayStyleControl.onReset(layer.id),
          displayStyleControl.localFonts,
          locale,
        ),
      });
    }

    items.push({
      label: comparisonMenuText(locale, '层操作', 'Layer operations'),
      variant: 'category',
      children: buildLayerOperationMenuItems({
        layer,
        deletableLayers: effectiveDeletableLayers,
        canOpenTranslationCreate,
        labels: {
          editLayerMetadata: comparisonMenuText(locale, '编辑该层元信息', 'Edit layer metadata'),
          createTranscription: comparisonMenuText(locale, '新建转写层', 'Create transcription layer'),
          createTranslation: comparisonMenuText(locale, '新建翻译层', 'Create translation layer'),
          deleteCurrentLayer: comparisonMenuText(locale, '删除当前层', 'Delete current layer'),
        },
        onAction: (action, layerId) => {
          if (action === 'delete') {
            if (!layerId) return;
            void requestDeleteLayer(layerId);
            return;
          }
          setLayerAction({ action, layerId });
        },
      }),
    });

    return items;
  }, [
    canOpenTranslationCreate,
    compactMode,
    displayStyleControl,
    effectiveDeletableLayers,
    locale,
    onFocusLayer,
    requestDeleteLayer,
    sourceLayer,
  ]);

  const comparisonHeaderMenuItems = useMemo(() => ({
    source: buildComparisonHeaderMenuItems(sourceLayer, sourceHeaderContent),
  }), [buildComparisonHeaderMenuItems, sourceHeaderContent, sourceLayer]);

  const openComparisonMenuAtPointer = useCallback((event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => {
    if (items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    setLayerContextMenu({
      x: event.clientX,
      y: event.clientY,
      items,
      anchorOrigin: 'top-left',
    });
  }, []);

  const toggleComparisonMenuFromButton = useCallback((event: React.MouseEvent<HTMLElement>, items: ContextMenuItem[]) => {
    if (items.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setLayerContextMenu((prev) => {
      const next = {
        x: rect.left,
        y: rect.bottom + 4,
        items,
        anchorOrigin: 'bottom-left' as const,
      };
      if (
        prev
        && prev.items === items
        && Math.abs(prev.x - next.x) < 6
        && Math.abs(prev.y - next.y) < 6
      ) {
        return null;
      }
      return next;
    });
  }, []);

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
    if (!displayStyleControl || !groupKey.startsWith('comparison-editor:')) return;
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
    const groupTranslationLayers = filterTranslationLayersForComparisonGroup(
      group,
      translationLayers,
      transcriptionLayers,
      defaultTranscriptionLayerId,
      sourceLayer?.id,
    );
    for (const tl of groupTranslationLayers) {
      applyFont(tl, finalHeight);
    }
  }, [defaultTranscriptionLayerId, displayStyleControl, groups, sourceLayer, transcriptionLayers, translationLayers]);

  const handleComparisonEditorResizePreview = useCallback((layerKey: string, previewHeight: number) => {
    if (!displayStyleControl) return;
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
    const groupTranslationLayers = filterTranslationLayersForComparisonGroup(
      group,
      translationLayers,
      transcriptionLayers,
      defaultTranscriptionLayerId,
      sourceLayer?.id,
    );
    for (const tl of groupTranslationLayers) {
      const tgtPol = resolveOrthographyRenderPolicy(tl.languageId, orthographies, tl.orthographyId);
      next[tl.id] = computeFontSizeFromRenderPolicy(previewHeight, tgtPol);
    }
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
  }, [defaultTranscriptionLayerId, displayStyleControl, groups, sourceLayer, transcriptionLayers, translationLayers]);

  const {
    resizingLayerId: resizingComparisonEditorId,
    startLaneHeightResize: startComparisonEditorResize,
  } = useTimelineLaneHeightResize(
    handleComparisonEditorLaneChange,
    handleComparisonEditorResizeEnd,
    handleComparisonEditorResizePreview,
  );

  const showBundleChips = orderedDistinctBundleKeys.length > 1 && comparisonBundleFilterRootId == null;
  const isTargetHeaderActive = comparisonTargetSide === 'target'
    || (comparisonTargetSide == null && translationLayers.some((l) => l.id === focusedLayerRowId));
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

    if (!visibleGroups.some((g) => g.id === matchedGroup.id)) return;

    const syncedSide = translationLayers.some((l) => l.id === focusedLayerRowId) ? 'target' : 'source';
    const syncTranslationLayer = translationLayers.find((l) => l.id === focusedLayerRowId) ?? targetLayer;
    const targetCellIdForSync = syncedSide === 'target' && syncTranslationLayer
      ? (comparisonUsesSplitTargetEditors(matchedGroup)
        && syncTranslationLayer.id === targetLayer?.id
        && matchedGroup.targetItems[0]
        ? `target:${matchedGroup.id}:${syncTranslationLayer.id}:${matchedGroup.targetItems[0].id}`
        : `target:${matchedGroup.id}:${syncTranslationLayer.id}:editor`)
      : `source:${activeUnitId}`;
    patchComparisonFocus({
      activeComparisonGroupId: matchedGroup.id,
      activeComparisonCellId: targetCellIdForSync,
      comparisonTargetSide: syncedSide,
      contextMenuSourceUnitId: activeUnitId,
    });
  }, [activeUnitId, focusedLayerRowId, groups, patchComparisonFocus, targetLayer?.id, translationLayers, visibleGroups]);

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

    if (!visibleGroups.some((g) => g.id === matchedGroup.id)) return;

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
  }, [activeUnitId, groups, visibleGroups]);

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
          {bundleFilterMenuItems.length > 0 ? (
            <div
              className="timeline-comparison-bundle-filter"
              role="group"
              aria-label={t(locale, 'transcription.comparison.bundleFilterGroupAria')}
            >
              <button
                type="button"
                className={`timeline-comparison-mode-btn timeline-comparison-bundle-filter-btn${comparisonBundleFilterRootId != null ? ' is-active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={layerContextMenu?.items === bundleFilterMenuItems}
                title={bundleFilterButtonTitle}
                aria-label={bundleFilterButtonTitle}
                data-testid="comparison-bundle-filter-btn"
                onClick={(event) => toggleComparisonMenuFromButton(event, bundleFilterMenuItems)}
              >
                {t(locale, 'transcription.comparison.bundleFilter')}
              </button>
            </div>
          ) : null}
          <div className="timeline-comparison-header-actions" role="group" aria-label={t(locale, 'transcription.comparison.columnMode')}>
            {sourceLayer ? (
              <button
                type="button"
                className={`timeline-comparison-mode-btn timeline-comparison-header-title-btn${focusedLayerRowId === sourceLayer.id ? ' is-active' : ''}`}
                title={sourceHeaderContent}
                aria-label={sourceHeaderContent}
                data-testid="comparison-layer-header-source"
                onClick={() => onFocusLayer(sourceLayer.id)}
                onContextMenu={(event) => openComparisonMenuAtPointer(event, comparisonHeaderMenuItems.source)}
              >
                {sourceHeaderContent}
              </button>
            ) : null}
            {headerTargetLayers.map((layer, index) => {
              const layerHeaderLabel = resolveComparisonLayerLabel(
                layer,
                locale,
                t(locale, 'transcription.comparison.translationHeader'),
              );
              const layerHeaderContent = resolveComparisonHeaderContentForLayer(layer, layerHeaderLabel);
              const targetHeaderTestId = index === 0
                ? 'comparison-layer-header-target'
                : `comparison-layer-header-target-${layer.id}`;
              return (
                <button
                  key={`comparison-target-header-${layer.id}`}
                  type="button"
                  className={`timeline-comparison-mode-btn timeline-comparison-header-title-btn${focusedLayerRowId === layer.id ? ' is-active' : ''}`}
                  title={layerHeaderContent}
                  aria-label={layerHeaderContent}
                  data-testid={targetHeaderTestId}
                  onClick={() => onFocusLayer(layer.id)}
                  onContextMenu={(event) => openComparisonMenuAtPointer(event, buildComparisonHeaderMenuItems(layer, layerHeaderContent))}
                >
                  {layerHeaderContent}
                </button>
              );
            })}
          </div>
          <div className="timeline-comparison-toolbar-spacer" aria-hidden />
          {comparisonStyleMenuItems.length > 0 ? (
            <button
              type="button"
              className="timeline-comparison-mode-btn timeline-comparison-layer-style-btn"
              aria-haspopup="menu"
              aria-expanded={layerContextMenu?.items === comparisonStyleMenuItems}
              title={t(locale, 'transcription.comparison.layerDisplayStyles')}
              aria-label={t(locale, 'transcription.comparison.layerDisplayStyles')}
              onClick={(event) => toggleComparisonMenuFromButton(event, comparisonStyleMenuItems)}
            >
              {t(locale, 'transcription.comparison.layerDisplayStyles')}
            </button>
          ) : null}
        </div>
        <div ref={comparisonSplitHostRef} className="timeline-comparison-split-host">
          <div className="timeline-comparison-split-host-inner">
        {visibleGroups.map((group, groupIndex) => {
        const perSegTargetsPrimary = comparisonUsesSplitTargetEditors(group);
        const persistAnchorUnitIds = group.isMultiAnchorGroup
          ? group.sourceItems.map((s) => s.unitId)
          : Array.from(new Set(group.targetItems.flatMap((item) => item.anchorUnitIds)));
        const anchorUnitIds = persistAnchorUnitIds;
        const primaryUnitId = group.sourceItems[0]?.unitId ?? '';
        const primarySourceUnit = primaryUnitId ? unitByIdForSpeaker.get(primaryUnitId) : undefined;
        const groupTranslationLayers = filterTranslationLayersForComparisonGroup(
          group,
          translationLayers,
          transcriptionLayers,
          defaultTranscriptionLayerId,
          sourceLayer?.id,
        );
        const targetEmptyReason = groupTranslationLayers.length === 0
          ? resolveComparisonGroupEmptyReason(
              group,
              translationLayers,
              transcriptionLayers,
              defaultTranscriptionLayerId,
              sourceLayer?.id,
            )
          : null;
        const groupPreferredTargetLayer = groupTranslationLayers.find((l) => l.id === targetLayer?.id)
          ?? groupTranslationLayers[0];
        const anchorForUi = resolveComparisonGroupAnchorForUi(group, contextMenuSourceUnitId, activeUnitId);
        const derivedActive = activeUnitId != null && group.sourceItems.some((item) => item.unitId === activeUnitId);
        const isGroupActive = activeComparisonGroupId === group.id || (activeComparisonGroupId == null && derivedActive);
        const isTargetColumnFocused = isGroupActive && comparisonTargetSide === 'target';
        /** 同组内左/右行数关系（含多译文层堆叠） */
        const comparisonLayoutMode: 'balanced' | 'one-to-many' | 'many-to-one' | 'many-to-many' = (() => {
          const sourceCount = group.sourceItems.length;
          const targetVisualRows = groupTranslationLayers.reduce((n, tl) => {
            if (tl.id === groupPreferredTargetLayer?.id) {
              return n + (perSegTargetsPrimary ? group.targetItems.length : 1);
            }
            if (!primarySourceUnit) return n + 1;
            const ex = resolveComparisonExplicitTargetItemsForLayer(
              primarySourceUnit,
              tl,
              defaultTranscriptionLayerId,
              segmentsByLayer,
              segmentContentByLayer,
              unitByIdForSpeaker,
            );
            if (ex && ex.length > 1) return n + ex.length;
            return n + 1;
          }, 0);
          if (targetVisualRows > 1 && sourceCount > 1) return 'many-to-many';
          if (targetVisualRows > 1) return 'one-to-many';
          if (sourceCount > 1) return 'many-to-one';
          return 'balanced';
        })();
        const comparisonEditorGroupKey = `comparison-editor:${group.id}`;
        const comparisonEditorHeight = comparisonEditorHeightByGroup[comparisonEditorGroupKey] ?? defaultComparisonEditorHeight;
        const bundleKey = resolveComparisonHorizontalBundleKey(
          group,
          layerIdToHorizontalBundleRootId,
          sourceLayer?.id,
        );
        const bundleOrdinal = bundleOrdinalByKey.get(bundleKey) ?? null;
        const prevGroup = groupIndex > 0 ? visibleGroups[groupIndex - 1] : undefined;
        const startsNewBundle = groupIndex === 0
          || (prevGroup != null
            && resolveComparisonHorizontalBundleKey(
              group,
              layerIdToHorizontalBundleRootId,
              sourceLayer?.id,
            ) !== resolveComparisonHorizontalBundleKey(
              prevGroup,
              layerIdToHorizontalBundleRootId,
              sourceLayer?.id,
            ));
        const orthographies = displayStyleControl?.orthographies ?? [];
        const comparisonEditorResizingThisGroup = resizingComparisonEditorId === comparisonEditorGroupKey;

        return (
          <div
            key={group.id}
            data-comparison-group-id={group.id}
            data-comparison-layout={comparisonLayoutMode}
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
                      onContextMenu={(event) => {
                        openComparisonMenuAtPointer(event, buildComparisonHeaderMenuItems(sourceItemLayer, sourceRowTitle));
                      }}
                    >
                      {renderComparisonRailLaneBody({
                        layer: sourceItemLayer,
                        renderLaneLabel,
                        fallbackTitle: sourceRowTitle,
                        mode: 'full',
                      })}
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
                      const unitDoc = unitByIdForSpeaker.get(item.unitId);
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

            <div
              className={`timeline-comparison-target-column${isTargetColumnFocused ? ' timeline-comparison-target-column-active' : ''}`}
              data-comparison-translation-layer-count={groupTranslationLayers.length}
            >
              {groupTranslationLayers.length === 0 ? (
                <div
                  className="timeline-comparison-target-empty"
                  data-testid={`comparison-target-empty-${group.id}`}
                >
                  <p className="timeline-comparison-target-empty-hint">
                    {targetEmptyReason === 'orphan-needs-repair'
                      ? t(locale, 'transcription.comparison.orphanTranslationLayerNeedsRepair')
                      : t(locale, 'transcription.comparison.noChildTranslationLayers')}
                  </p>
                </div>
              ) : (
              groupTranslationLayers.map((tLayer) => {
                const isPrimaryLayer = tLayer.id === groupPreferredTargetLayer?.id;
                const layerTargetItems: ComparisonTargetItem[] = isPrimaryLayer
                  ? group.targetItems
                  : (() => {
                    if (!primarySourceUnit) {
                      return [{
                        id: `${group.id}:${tLayer.id}:placeholder`,
                        text: '',
                        anchorUnitIds: primaryUnitId ? [primaryUnitId] : [],
                      }];
                    }
                    const explicit = resolveComparisonExplicitTargetItemsForLayer(
                      primarySourceUnit,
                      tLayer,
                      defaultTranscriptionLayerId,
                      segmentsByLayer,
                      segmentContentByLayer,
                      unitByIdForSpeaker,
                    );
                    if (explicit != null && explicit.length > 0) return explicit;
                    const plain = resolveComparisonTargetPlainTextForLayer(
                      primarySourceUnit,
                      tLayer,
                      defaultTranscriptionLayerId,
                      segmentsByLayer,
                      segmentContentByLayer,
                      translationTextByLayer,
                      unitByIdForSpeaker,
                    );
                    return buildComparisonTargetItemsFromRawText(primarySourceUnit.id, plain);
                  })();
                const layerPerSeg = isPrimaryLayer ? perSegTargetsPrimary : layerTargetItems.length > 1;
                const layerHeaderLabel = resolveComparisonLayerLabel(
                  tLayer,
                  locale,
                  t(locale, 'transcription.comparison.translationHeader'),
                );
                const layerHeaderContent = (() => {
                  const inline = buildLaneHeaderInlineDotSeparatedLabel(
                    tLayer,
                    locale,
                    comparisonHeaderOrthographies,
                  ).trim();
                  return inline.length > 0 ? inline : layerHeaderLabel;
                })();
                const translationSegmentsForAudio = segmentsByLayer?.get(tLayer.id) ?? [];
                const audioAnchorSeg = layerUsesOwnSegments(tLayer, defaultTranscriptionLayerId)
                  ? pickTranslationSegmentForPersist(translationSegmentsForAudio, group.startTime, group.endTime)
                  : undefined;
                const audioScopeUnitId = resolveComparisonTranslationAudioScopeUnitId({
                  audioAnchorSeg,
                  anchorUnitIds,
                  contextMenuSourceUnitId,
                  activeUnitId,
                  primaryUnitId,
                  translationAudioByLayer,
                  targetLayerId: tLayer.id,
                });
                const voiceSourceDoc = unitByIdForSpeaker.get(audioScopeUnitId) ?? primarySourceUnit;
                const layerNoteIndicator = anchorForUi.unitId
                  ? resolveNoteIndicatorTarget?.(anchorForUi.unitId, tLayer.id) ?? null
                  : null;
                const audioTranslation = translationAudioByLayer?.get(tLayer.id)?.get(audioScopeUnitId);
                const audioMedia = audioTranslation?.translationAudioMediaId
                  ? mediaItemById.get(audioTranslation.translationAudioMediaId)
                  : undefined;
                const isCurrentRecording = recording && recordingUnitId === audioScopeUnitId && recordingLayerId === tLayer.id;
                const shouldShowLayerAudio = Boolean(audioMedia) || isCurrentRecording;
                const layerAudioControls = shouldShowLayerAudio && voiceSourceDoc ? (
                  <TimelineTranslationAudioControls
                    {...(audioMedia ? { mediaItem: audioMedia } : {})}
                    isRecording={isCurrentRecording}
                    disabled={recording && !isCurrentRecording}
                    compact
                    onStartRecording={() => {
                      void startRecordingForUnit?.(voiceSourceDoc, tLayer);
                    }}
                    {...(stopRecording ? { onStopRecording: stopRecording } : {})}
                    {...(audioMedia && deleteVoiceTranslation ? {
                      onDeleteRecording: () => deleteVoiceTranslation(voiceSourceDoc, tLayer),
                    } : {})}
                  />
                ) : null;
                const layerPreviewFont = comparisonEditorResizingThisGroup
                  ? comparisonResizeFontPreviewByLayerId[tLayer.id]
                  : undefined;
                const layerTypography = buildOrthographyPreviewTextProps(
                  resolveOrthographyRenderPolicy(tLayer.languageId, orthographies, tLayer.orthographyId),
                  layerPreviewFont != null
                    ? { ...tLayer.displaySettings, fontSize: layerPreviewFont }
                    : tLayer.displaySettings,
                );
                const layerDraftKeyBase = `cmp:${tLayer.id}:${group.id}`;
                const layerCellKeyBase = `cmp-target:${tLayer.id}:${group.id}`;
                const cmpAutoSaveKey = `cmp-${tLayer.id}-${group.id}`;

                return (
                  <div key={tLayer.id} className="timeline-comparison-target-layer-stack">
                    {layerPerSeg
                      ? layerTargetItems.map((targetItem, ti) => {
                        const itemDraftKey = `${layerDraftKeyBase}:${targetItem.id}`;
                        const itemInitial = normalizeComparisonText(targetItem.text || '');
                        const itemDraft = translationDrafts[itemDraftKey] ?? itemInitial;
                        const itemCellKey = `${layerCellKeyBase}:${targetItem.id}`;
                        const itemSaveStatus = saveStatusByCellKey[itemCellKey];
                        const isItemDraftEmpty = normalizeComparisonText(itemDraft).trim().length === 0;
                        const isThisTargetRowActive = isGroupActive && comparisonTargetSide === 'target'
                          && activeComparisonCellId === `target:${group.id}:${tLayer.id}:${targetItem.id}`;
                        const segAutoSaveKey = `cmp-seg-${tLayer.id}-${group.id}-${targetItem.id}`;
                        const buildCombinedTargetValue = (nextValue: string): string => (
                          layerTargetItems
                            .map((item) => {
                              if (item.id === targetItem.id) return normalizeComparisonText(nextValue);
                              const otherDraftKey = `${layerDraftKeyBase}:${item.id}`;
                              return normalizeComparisonText(translationDrafts[otherDraftKey] ?? item.text ?? '');
                            })
                            .join('\n')
                        );
                        return (
                          <div key={`${tLayer.id}-${targetItem.id}`} className="timeline-comparison-editor-row timeline-comparison-editor-row-target">
                            <button
                              type="button"
                              className={`timeline-comparison-row-rail timeline-comparison-row-rail-target${isTargetHeaderActive ? ' is-active' : ''}`}
                              aria-pressed={isTargetHeaderActive}
                              aria-label={tf(locale, 'transcription.comparison.rowRailFocusLayer', { layer: layerHeaderContent })}
                              title={layerHeaderContent}
                              data-testid={`comparison-target-rail-${group.id}-${tLayer.id}-${targetItem.id}`}
                              onClick={() => {
                                patchComparisonFocus({ comparisonTargetSide: 'target' });
                                onFocusLayer(tLayer.id);
                              }}
                              onContextMenu={(event) => {
                                openComparisonMenuAtPointer(event, buildComparisonHeaderMenuItems(tLayer, layerHeaderContent));
                              }}
                            >
                              {renderComparisonRailLaneBody({
                                layer: tLayer,
                                renderLaneLabel,
                                fallbackTitle: layerHeaderContent,
                                mode: layerPerSeg && ti > 0 ? 'continuation' : 'full',
                              })}
                            </button>
                            <TimelineDraftEditorSurface
                              multiline
                              wrapperClassName={[
                                'timeline-comparison-target-surface',
                                isItemDraftEmpty ? 'timeline-comparison-target-surface-empty' : '',
                                isThisTargetRowActive ? 'timeline-comparison-target-surface-active' : '',
                                layerNoteIndicator ? 'timeline-comparison-target-surface-has-side-badges' : '',
                              ].filter(Boolean).join(' ')}
                              inputClassName={[
                                'timeline-comparison-target-input',
                                isItemDraftEmpty ? 'timeline-comparison-target-input-empty' : '',
                              ].filter(Boolean).join(' ')}
                              value={itemDraft}
                              rows={resolveComparisonEditorRows(itemDraft)}
                              placeholder={t(locale, 'transcription.timeline.placeholder.translation')}
                              {...(layerTypography.dir ? { dir: layerTypography.dir } : {})}
                              inputStyle={layerTypography.style}
                              {...(itemSaveStatus !== undefined ? { saveStatus: itemSaveStatus } : {})}
                              overlay={renderComparisonOverlay({
                                locale,
                                certainty: undefined,
                                ambiguous: false,
                                laneLabel: layerHeaderLabel,
                                noteCount: layerNoteIndicator?.count ?? 0,
                                ...(layerNoteIndicator && anchorForUi.unitId && handleNoteClick
                                  ? {
                                      onNoteClick: (event: React.MouseEvent<SVGSVGElement>) => {
                                        handleNoteClick(anchorForUi.unitId, layerNoteIndicator.layerId, event);
                                      },
                                    }
                                  : {}),
                              })}
                              onResizeHandlePointerDown={(event, edge) => {
                                handleComparisonEditorResizeStart(event, group.id, comparisonEditorHeight, edge);
                              }}
                              onRetry={() => {
                                void runComparisonSaveWithStatus(itemCellKey, async () => {
                                  await persistComparisonTargetTranslation(
                                    tLayer,
                                    targetItem,
                                    group,
                                    persistAnchorUnitIds,
                                    normalizeComparisonText(itemDraft),
                                    buildCombinedTargetValue(itemDraft),
                                  );
                                });
                              }}
                              {...(ti === 0 && layerAudioControls ? { tools: layerAudioControls } : {})}
                              toolsClassName="timeline-comparison-target-tools"
                              onFocus={() => {
                                patchComparisonFocus({
                                  activeComparisonGroupId: group.id,
                                  activeComparisonCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                  comparisonTargetSide: 'target',
                                  contextMenuSourceUnitId: anchorForUi.unitId || primaryUnitId || null,
                                });
                                focusedTranslationDraftKeyRef.current = itemDraftKey;
                                onFocusLayer(tLayer.id);
                              }}
                              onChange={(event) => {
                                const value = normalizeComparisonText(event.target.value);
                                patchComparisonFocus({
                                  activeComparisonGroupId: group.id,
                                  activeComparisonCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                  comparisonTargetSide: 'target',
                                });
                                setTranslationDrafts((prev) => ({ ...prev, [itemDraftKey]: value }));
                                if (value !== itemInitial) {
                                  setComparisonCellSaveStatus(itemCellKey, 'dirty');
                                  scheduleAutoSave(segAutoSaveKey, async () => {
                                    await runComparisonSaveWithStatus(itemCellKey, async () => {
                                      await persistComparisonTargetTranslation(
                                        tLayer,
                                        targetItem,
                                        group,
                                        persistAnchorUnitIds,
                                        value,
                                        buildCombinedTargetValue(value),
                                      );
                                    });
                                  });
                                } else {
                                  clearAutoSaveTimer(segAutoSaveKey);
                                  setComparisonCellSaveStatus(itemCellKey);
                                }
                              }}
                              onBlur={(event) => {
                                focusedTranslationDraftKeyRef.current = null;
                                const value = normalizeComparisonText(event.target.value);
                                clearAutoSaveTimer(segAutoSaveKey);
                                if (value !== itemInitial) {
                                  void runComparisonSaveWithStatus(itemCellKey, async () => {
                                    await persistComparisonTargetTranslation(
                                      tLayer,
                                      targetItem,
                                      group,
                                      persistAnchorUnitIds,
                                      value,
                                      buildCombinedTargetValue(value),
                                    );
                                  });
                                } else {
                                  setComparisonCellSaveStatus(itemCellKey);
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
                                clearAutoSaveTimer(segAutoSaveKey);
                                setTranslationDrafts((prev) => ({ ...prev, [itemDraftKey]: itemInitial }));
                                setComparisonCellSaveStatus(itemCellKey);
                                focusedTranslationDraftKeyRef.current = null;
                                event.currentTarget.blur();
                              }}
                              onClick={(event) => {
                                if (!anchorForUi.unitId) return;
                                patchComparisonFocus({
                                  activeComparisonGroupId: group.id,
                                  activeComparisonCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                  comparisonTargetSide: 'target',
                                  contextMenuSourceUnitId: anchorForUi.unitId,
                                });
                                handleAnnotationClick(anchorForUi.unitId, anchorForUi.startTime, tLayer.id, event);
                              }}
                              onContextMenu={(event) => {
                                if (!handleAnnotationContextMenu) return;
                                const menuSourceId = contextMenuSourceUnitId != null
                                  && group.sourceItems.some((si) => si.unitId === contextMenuSourceUnitId)
                                  ? contextMenuSourceUnitId
                                  : primaryUnitId;
                                const menuUnitDoc = menuSourceId ? unitByIdForSpeaker.get(menuSourceId) : undefined;
                                if (!menuUnitDoc) return;
                                patchComparisonFocus({
                                  activeComparisonGroupId: group.id,
                                  activeComparisonCellId: `target:${group.id}:${tLayer.id}:${targetItem.id}`,
                                  comparisonTargetSide: 'target',
                                });
                                handleAnnotationContextMenu(menuSourceId, unitToView(menuUnitDoc, tLayer.id), tLayer.id, event);
                              }}
                            />
                          </div>
                        );
                      })
                      : (() => {
                        const draftKey = layerDraftKeyBase;
                        const initialTargetText = layerTargetItems.map((item) => item.text).join('\n');
                        const draft = translationDrafts[draftKey] ?? initialTargetText;
                        const targetCellKey = layerCellKeyBase;
                        const targetSaveStatus = saveStatusByCellKey[targetCellKey];
                        const isTargetDraftEmpty = normalizeComparisonText(draft).trim().length === 0;
                        const isMergedTargetRowActive = isGroupActive && comparisonTargetSide === 'target'
                          && activeComparisonCellId === `target:${group.id}:${tLayer.id}:editor`;
                        return (
                  <div className="timeline-comparison-editor-row timeline-comparison-editor-row-target">
                    <button
                      type="button"
                      className={`timeline-comparison-row-rail timeline-comparison-row-rail-target${isTargetHeaderActive ? ' is-active' : ''}`}
                      aria-pressed={isTargetHeaderActive}
                      aria-label={tf(locale, 'transcription.comparison.rowRailFocusLayer', { layer: layerHeaderContent })}
                      title={layerHeaderContent}
                      data-testid={`comparison-target-rail-${group.id}-${tLayer.id}`}
                      onClick={() => {
                        patchComparisonFocus({ comparisonTargetSide: 'target' });
                        onFocusLayer(tLayer.id);
                      }}
                      onContextMenu={(event) => {
                        openComparisonMenuAtPointer(event, buildComparisonHeaderMenuItems(tLayer, layerHeaderContent));
                      }}
                    >
                      {renderComparisonRailLaneBody({
                        layer: tLayer,
                        renderLaneLabel,
                        fallbackTitle: layerHeaderContent,
                        mode: 'full',
                      })}
                    </button>
                    <TimelineDraftEditorSurface
                      multiline
                      wrapperClassName={[
                        'timeline-comparison-target-surface',
                        isTargetDraftEmpty ? 'timeline-comparison-target-surface-empty' : '',
                        isMergedTargetRowActive ? 'timeline-comparison-target-surface-active' : '',
                        layerNoteIndicator ? 'timeline-comparison-target-surface-has-side-badges' : '',
                      ].filter(Boolean).join(' ')}
                      inputClassName={[
                        'timeline-comparison-target-input',
                        isTargetDraftEmpty ? 'timeline-comparison-target-input-empty' : '',
                      ].filter(Boolean).join(' ')}
                      value={draft}
                      rows={resolveComparisonEditorRows(draft)}
                      placeholder={t(locale, 'transcription.timeline.placeholder.translation')}
                      {...(isPrimaryLayer && group.editingTargetPolicy === 'multi-target-items'
                        ? { title: t(locale, 'transcription.comparison.multiTargetHint') }
                        : {})}
                      {...(layerTypography.dir ? { dir: layerTypography.dir } : {})}
                      inputStyle={layerTypography.style}
                      {...(targetSaveStatus !== undefined ? { saveStatus: targetSaveStatus } : {})}
                      overlay={renderComparisonOverlay({
                        locale,
                        certainty: undefined,
                        ambiguous: false,
                        laneLabel: layerHeaderLabel,
                        noteCount: layerNoteIndicator?.count ?? 0,
                        ...(layerNoteIndicator && anchorForUi.unitId && handleNoteClick
                          ? {
                              onNoteClick: (event: React.MouseEvent<SVGSVGElement>) => {
                                handleNoteClick(anchorForUi.unitId, layerNoteIndicator.layerId, event);
                              },
                            }
                          : {}),
                      })}
                      onResizeHandlePointerDown={(event, edge) => {
                        handleComparisonEditorResizeStart(event, group.id, comparisonEditorHeight, edge);
                      }}
                      onRetry={() => {
                        void runComparisonSaveWithStatus(targetCellKey, async () => {
                          await persistGroupTranslation(
                            tLayer,
                            group,
                            persistAnchorUnitIds,
                            normalizeComparisonText(draft),
                          );
                        });
                      }}
                      {...(layerAudioControls ? { tools: layerAudioControls } : {})}
                      toolsClassName="timeline-comparison-target-tools"
                      onFocus={() => {
                        patchComparisonFocus({
                          activeComparisonGroupId: group.id,
                          activeComparisonCellId: `target:${group.id}:${tLayer.id}:editor`,
                          comparisonTargetSide: 'target',
                          contextMenuSourceUnitId: anchorForUi.unitId || primaryUnitId || null,
                        });
                        focusedTranslationDraftKeyRef.current = draftKey;
                        onFocusLayer(tLayer.id);
                      }}
                      onChange={(event) => {
                        const value = normalizeComparisonText(event.target.value);
                        patchComparisonFocus({
                          activeComparisonGroupId: group.id,
                          activeComparisonCellId: `target:${group.id}:${tLayer.id}:editor`,
                          comparisonTargetSide: 'target',
                        });
                        setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
                        if (value !== initialTargetText) {
                          setComparisonCellSaveStatus(targetCellKey, 'dirty');
                          scheduleAutoSave(cmpAutoSaveKey, async () => {
                            await runComparisonSaveWithStatus(targetCellKey, async () => {
                              await persistGroupTranslation(tLayer, group, persistAnchorUnitIds, value);
                            });
                          });
                        } else {
                          clearAutoSaveTimer(cmpAutoSaveKey);
                          setComparisonCellSaveStatus(targetCellKey);
                        }
                      }}
                      onBlur={(event) => {
                        focusedTranslationDraftKeyRef.current = null;
                        const value = normalizeComparisonText(event.target.value);
                        clearAutoSaveTimer(cmpAutoSaveKey);
                        if (value !== initialTargetText) {
                          void runComparisonSaveWithStatus(targetCellKey, async () => {
                            await persistGroupTranslation(tLayer, group, persistAnchorUnitIds, value);
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
                        clearAutoSaveTimer(cmpAutoSaveKey);
                        setTranslationDrafts((prev) => ({ ...prev, [draftKey]: initialTargetText }));
                        setComparisonCellSaveStatus(targetCellKey);
                        focusedTranslationDraftKeyRef.current = null;
                        event.currentTarget.blur();
                      }}
                      onClick={(event) => {
                        if (!anchorForUi.unitId) return;
                        patchComparisonFocus({
                          activeComparisonGroupId: group.id,
                          activeComparisonCellId: `target:${group.id}:${tLayer.id}:editor`,
                          comparisonTargetSide: 'target',
                          contextMenuSourceUnitId: anchorForUi.unitId,
                        });
                        handleAnnotationClick(anchorForUi.unitId, anchorForUi.startTime, tLayer.id, event);
                      }}
                      onContextMenu={(event) => {
                        if (!handleAnnotationContextMenu) return;
                        const menuSourceId = contextMenuSourceUnitId != null
                          && group.sourceItems.some((si) => si.unitId === contextMenuSourceUnitId)
                          ? contextMenuSourceUnitId
                          : primaryUnitId;
                        const menuUnitDoc = menuSourceId ? unitByIdForSpeaker.get(menuSourceId) : undefined;
                        if (!menuUnitDoc) return;
                        patchComparisonFocus({
                          activeComparisonGroupId: group.id,
                          activeComparisonCellId: `target:${group.id}:${tLayer.id}:editor`,
                          comparisonTargetSide: 'target',
                        });
                        handleAnnotationContextMenu(menuSourceId, unitToView(menuUnitDoc, tLayer.id), tLayer.id, event);
                      }}
                    />
                  </div>
                        );
                      })()}
                  </div>
                );
              })
              )}
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
      {layerAction ? (
        <LayerActionPopover
          action={layerAction.action}
          layerId={layerAction.layerId}
          deletableLayers={effectiveDeletableLayers}
          {...(defaultLanguageId !== undefined ? { defaultLanguageId } : {})}
          {...(defaultOrthographyId !== undefined ? { defaultOrthographyId } : {})}
          createLayer={createLayer}
          {...(updateLayerMetadata !== undefined ? { updateLayerMetadata } : {})}
          deleteLayer={deleteLayer}
          {...(deleteLayerWithoutConfirm !== undefined ? { deleteLayerWithoutConfirm } : {})}
          {...(checkLayerHasContent !== undefined ? { checkLayerHasContent } : {})}
          onClose={() => setLayerAction(null)}
        />
      ) : null}
      <DeleteLayerConfirmDialog
        open={deleteLayerConfirm != null}
        layerName={deleteLayerConfirm?.layerName ?? ''}
        layerType={deleteLayerConfirm?.layerType ?? 'transcription'}
        textCount={deleteLayerConfirm?.textCount ?? 0}
        {...(deleteLayerConfirm?.warningMessage !== undefined ? { warningMessage: deleteLayerConfirm.warningMessage } : {})}
        keepUnits={deleteConfirmKeepUnits}
        onKeepUnitsChange={setDeleteConfirmKeepUnits}
        onCancel={cancelDeleteLayerConfirm}
        onConfirm={() => {
          void confirmDeleteLayer();
        }}
      />
      {layerContextMenu ? (
        <ContextMenu
          x={layerContextMenu.x}
          y={layerContextMenu.y}
          anchorOrigin={layerContextMenu.anchorOrigin ?? 'bottom-left'}
          items={layerContextMenu.items}
          onClose={() => setLayerContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
