import type { ReactNode } from 'react';
import type {
  LayerDocType,
  LayerLinkDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
} from '../db';
import { DEFAULT_TIMELINE_LANE_HEIGHT, MAX_TIMELINE_LANE_HEIGHT, MIN_TIMELINE_LANE_HEIGHT } from '../hooks/useTimelineLaneHeightResize';
import { layerUsesOwnSegments, resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import type { Locale } from '../i18n';
import { TimelineBadges } from './TimelineBadges';
import { normalizeSpeakerFocusKey, resolveSpeakerFocusKeyFromSegment } from './transcriptionTimelineSegmentSpeakerLayout';
import {
  listTranslationSegmentsForComparisonSourceUnit,
  type ComparisonGroup,
  type ComparisonTargetItem,
} from '../utils/transcriptionComparisonGroups';
import { buildLayerBundles } from '../services/LayerOrderingService';
import type { ComparisonHostLink } from '../utils/comparisonHostFilter';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';
import { buildTimelineSelfCertaintyTitle } from '../utils/timelineSelfCertainty';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';

/** 译文区点击/录音：优先用当前菜单锚点、再 global 选中，再回落主锚点 | Target-side UI anchor resolution */
export function resolveComparisonGroupAnchorForUi(
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
export function resolveComparisonTranslationAudioScopeUnitId(input: {
  audioAnchorSeg: LayerUnitDocType | undefined;
  anchorUnitIds: string[];
  contextMenuSourceUnitId: string | null | undefined;
  activeUnitId: string | undefined;
  primaryUnitId: string;
  translationAudioByLayer: Map<string, Map<string, LayerUnitContentDocType>> | undefined;
  targetLayerId: string | undefined;
}): string {
  const layerId = typeof input.targetLayerId === 'string' ? input.targetLayerId.trim() : '';
  const byKey = layerId.length > 0 ? input.translationAudioByLayer?.get(layerId) : undefined;
  const segmentId = input.audioAnchorSeg?.id;
  if (byKey && byKey.size > 0) {
    if (segmentId) {
      const segRow = byKey.get(segmentId);
      if (segRow?.translationAudioMediaId) return segmentId;
    }
    const ordered = [
      input.contextMenuSourceUnitId,
      input.activeUnitId,
      input.audioAnchorSeg?.parentUnitId,
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
  return segmentId ?? input.primaryUnitId;
}

export function normalizeComparisonText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => normalizeSingleLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function renderComparisonOverlay(input: {
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
export const COMPARISON_GLOBAL_SPLITTER_LINE_EXTRA_OFFSET_PX = 12;

/** 多目标译文时，纵向对照右列按子项逐行展示；segment 与换行拆分都适用 | Split target rows for one-to-many comparison groups */
export function comparisonUsesSplitTargetEditors(group: ComparisonGroup): boolean {
  return group.editingTargetPolicy === 'multi-target-items' && group.targetItems.length > 1;
}

/** 对照组锚定到的原文层 id（用于对齐横向 buildLayerBundles 根块） | Source layer id for horizontal bundle mapping */
export function resolveComparisonGroupSourceAnchorLayerId(
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

/** 与横向时间轴 buildLayerBundles 一致：每层 id → 其所属 bundle 根层 id | Same bundle roots as horizontal timeline */
export function buildLayerIdToHorizontalBundleRootIdMap(
  layers: readonly LayerDocType[],
  layerLinks: readonly ComparisonHostLink[] = [],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const bundle of buildLayerBundles([...layers], layerLinks)) {
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
 * 纵向“组块”= 横向 buildLayerBundles 的一条根 bundle（根层 id 为键）；无法映射时退回按对照组 id |
 * Comparison bundle aligns with horizontal layer bundle root id
 */
export function resolveComparisonHorizontalBundleKey(
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
export function comparisonMenuText(locale: Locale, zh: string, en: string): string {
  return locale === 'zh-CN' ? zh : en;
}

export function resolveComparisonTargetPlainTextForLayer(
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

export function resolveComparisonExplicitTargetItemsForLayer(
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

export function accumulatedOffsetTopUntil(el: HTMLElement | null, ancestor: HTMLElement | null): number | null {
  if (!el || !ancestor) return null;
  let sum = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    sum += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === ancestor ? sum : null;
}

export const COMPARISON_COLUMN_LEFT_GROW_KEY = 'jieyu:comparison-column-left-grow';
export const COMPARISON_EDITOR_HEIGHT_KEY = 'jieyu:comparison-editor-min-height';
const LEGACY_SHARED_TIMELINE_EDITOR_MIN_HEIGHT = Math.max(42, DEFAULT_TIMELINE_LANE_HEIGHT - 12);
const SHARED_TIMELINE_EDITOR_MIN_HEIGHT = Math.max(
  63,
  Math.round(LEGACY_SHARED_TIMELINE_EDITOR_MIN_HEIGHT * 1.5),
);

export function readStoredComparisonLeftGrow(): number {
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

export function readStoredComparisonEditorHeight(): number {
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

export function readStoredComparisonEditorHeightMap(): Record<string, number> {
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

export function mergeComparisonUnitById(
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

export function resolveComparisonGroupSourceUnits(input: {
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

/** 与横向时间轴 renderLaneLabel 一致的多行层头；无层或回调空时回落单字标记 */
export function renderComparisonRailLaneBody(input: {
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

export function resolveComparisonLayerLabel(layer: LayerDocType | undefined, locale: Locale, fallback: string): string {
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

export function resolveComparisonEditorRows(value: string): number {
  return Math.min(6, Math.max(1, normalizeComparisonText(value).split('\n').length));
}

export type ComparisonViewLayerLink = LayerLinkDocType;
