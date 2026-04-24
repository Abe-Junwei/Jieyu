import type { ReactNode } from 'react';
import {
  layerTranscriptionTreeParentId,
  type LayerDocType,
  type LayerLinkDocType,
  type LayerUnitContentDocType,
  type LayerUnitDocType,
} from '../db';
import { DEFAULT_TIMELINE_LANE_HEIGHT, MAX_TIMELINE_LANE_HEIGHT, MIN_TIMELINE_LANE_HEIGHT } from '../hooks/useTimelineLaneHeightResize';
import { layerUsesOwnSegments, resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import type { Locale } from '../i18n';
import { TimelineBadges } from './TimelineBadges';
import { normalizeSpeakerFocusKey, resolveSpeakerFocusKeyFromSegment } from './transcriptionTimelineSegmentSpeakerLayout';
import {
  buildVerticalReadingTargetItemsFromRawText,
  listTranslationSegmentsForVerticalReadingSourceUnit,
  type VerticalReadingGroup,
  type PairedReadingSourceItem,
  type PairedReadingTargetItem,
} from '../utils/transcriptionVerticalReadingGroups';
import { buildLayerBundles } from '../services/LayerOrderingService';
import {
  filterTranslationLayersForVerticalReadingGroup,
  filterTranslationLayersForVerticalReadingSourceUnit,
  type VerticalReadingHostLink,
} from '../utils/verticalReadingHostFilter';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';
import { buildTimelineSelfCertaintyTitle } from '../utils/timelineSelfCertainty';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import {
  listInboundTranscriptionHostIdsForTranscriptionLane,
  resolveCanonicalUnitForTranscriptionLaneRow,
  resolvePrimaryUnscopedTranscriptionHostId,
} from '../utils/transcriptionUnitLaneReadScope';

/**
 * 该转写轨是否为「宿主上的依赖轨」（树子层或入站 layer_links 指向宿主转写），且 segment 列表可能不完整，
 * 需在 segment 遍历之后补 canonical 镜像行，避免纵向对读丢行。 |
 * Dependent transcription lanes whose segment lists may be sparse vs the host timeline.
 */
function isTranscriptionDependentLaneForVerticalSourceWalk(
  layer: LayerDocType,
  transcriptionLaneIds: ReadonlySet<string>,
  layerLinks: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>,
  layerById: ReadonlyMap<string, LayerDocType>,
): boolean {
  if (layer.layerType !== 'transcription') return false;
  const tp = layerTranscriptionTreeParentId(layer)?.trim() ?? '';
  if (tp.length > 0 && transcriptionLaneIds.has(tp)) return true;
  if (layerLinks.length === 0) return false;
  return listInboundTranscriptionHostIdsForTranscriptionLane(layer.id, layerLinks, layerById, transcriptionLaneIds).length > 0;
}

function resolveTranscriptionDependentHostTranscriptionLayerId(
  layer: LayerDocType,
  transcriptionLaneIds: ReadonlySet<string>,
  layerLinks: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>,
  layerById: ReadonlyMap<string, LayerDocType>,
): string | undefined {
  if (layer.layerType !== 'transcription') return undefined;
  const tp = layerTranscriptionTreeParentId(layer)?.trim() ?? '';
  if (tp.length > 0 && transcriptionLaneIds.has(tp)) return tp;
  if (layerLinks.length === 0) return undefined;
  const hosts = listInboundTranscriptionHostIdsForTranscriptionLane(layer.id, layerLinks, layerById, transcriptionLaneIds);
  const hid = hosts[0]?.trim();
  return hid && hid.length > 0 ? hid : undefined;
}

/**
 * 父轨 segment 时间轴在 `unitsOnCurrentMedia` 里未必有句级镜像；把宿主 segment 再 stamp 到依赖轨，避免后半段只有父语段、依赖轨纵向整段消失。 |
 * Stamp host transcription segments onto dependent lane (deduped by lane+id).
 */
function pushHostTranscriptionSegmentsOntoDependentLane(input: {
  layer: LayerDocType;
  transcriptionLaneIds: ReadonlySet<string>;
  layerLinks: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>;
  layerById: ReadonlyMap<string, LayerDocType>;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined;
  speakerKey: string;
  unitByIdForSpeaker: ReadonlyMap<string, LayerUnitDocType>;
  push: (laneLayer: LayerDocType, u: LayerUnitDocType) => void;
  defaultTranscriptionLayerId: string | undefined;
  /** 已收集行：句级依赖轨上若已有与宿主 segment 时间重叠的行（canonical），不再 stamp 同窗 segment，避免 seg/u 双行 | Unit-mode dependents only */
  existingRows: ReadonlyArray<LayerUnitDocType>;
}): void {
  const {
    layer,
    transcriptionLaneIds,
    layerLinks,
    layerById,
    segmentsByLayer,
    speakerKey,
    unitByIdForSpeaker,
    push,
    defaultTranscriptionLayerId,
    existingRows,
  } = input;
  if (!isTranscriptionDependentLaneForVerticalSourceWalk(layer, transcriptionLaneIds, layerLinks, layerById)) return;
  const hostId = resolveTranscriptionDependentHostTranscriptionLayerId(layer, transcriptionLaneIds, layerLinks, layerById);
  if (!hostId) return;
  const laneId = layer.id;
  const skipHostSegIfOverlappingCanonical =
    !layerUsesOwnSegments(layer, defaultTranscriptionLayerId);
  const hasOverlapOnDependentLane = (start: number, end: number) => {
    for (const r of existingRows) {
      if (r.layerId !== laneId) continue;
      if (r.endTime <= start || r.startTime >= end) continue;
      return true;
    }
    return false;
  };
  const hostSegs = segmentsByLayer?.get(hostId) ?? [];
  for (const segment of hostSegs) {
    if (speakerKey !== 'all') {
      const k = resolveSpeakerFocusKeyFromSegment(segment, unitByIdForSpeaker);
      if (k !== normalizeSpeakerFocusKey(speakerKey)) continue;
    }
    if (skipHostSegIfOverlappingCanonical && hasOverlapOnDependentLane(segment.startTime, segment.endTime)) continue;
    push(layer, { ...segment, layerId: layer.id });
  }
}

/** 译文区点击/录音：优先用当前菜单锚点、再 global 选中，再回落主锚点 | Target-side UI anchor resolution */
export function resolveVerticalReadingGroupAnchorForUi(
  group: VerticalReadingGroup,
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
export function resolvePairedReadingTranslationAudioScopeUnitId(input: {
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

export function normalizePairedReadingPlainText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => normalizeSingleLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function renderPairedReadingOverlay(input: {
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
      noteClassName="timeline-paired-reading-note-icon timeline-paired-reading-note-icon-active"
      wrapperClassName="timeline-paired-reading-surface-badges"
      {...(input.onNoteClick ? { onNoteClick: input.onNoteClick } : {})}
    />
  );
}

/** 首条语段顶相对层头再下移的余量（发丝线、subpixel、hover 外光）| clearance below dual-column header */
export const PAIRED_READING_GLOBAL_SPLITTER_LINE_EXTRA_OFFSET_PX = 12;

/** 多目标译文时，纵向对照右列按子项逐行展示；segment 与换行拆分都适用 | Split target rows for one-to-many comparison groups */
export function verticalReadingUsesSplitTargetEditors(group: VerticalReadingGroup): boolean {
  return group.editingTargetPolicy === 'multi-target-items' && group.targetItems.length > 1;
}

/**
 * `activeUnitId` 同步到译文单元格 id 时，须与 `TranscriptionTimelineVerticalViewGroupList` 的
 * `layerTargetItems` / `layerPerSeg` 一致；勿仅用 `group.targetItems[0]`（多译文层或 pick 层与聚焦层不一致时会错指 `:editor`）。 |
 * Sync focus cell id parity with paired-reading target row rendering.
 */
export function resolvePairedReadingSyncedTargetCellId(input: {
  group: VerticalReadingGroup;
  syncTranslationLayer: LayerDocType;
  translationLayers: readonly LayerDocType[];
  transcriptionLayers: readonly LayerDocType[];
  targetLayer: LayerDocType | undefined;
  sourceLayer: LayerDocType | undefined;
  defaultTranscriptionLayerId: string | undefined;
  layerLinks: readonly VerticalReadingHostLink[];
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>> | undefined;
  translationTextByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>> | undefined;
  unitByIdForSpeaker: ReadonlyMap<string, LayerUnitDocType>;
}): string {
  const {
    group,
    syncTranslationLayer,
    translationLayers,
    transcriptionLayers,
    targetLayer,
    sourceLayer,
    defaultTranscriptionLayerId,
    layerLinks,
    segmentsByLayer,
    segmentContentByLayer,
    translationTextByLayer,
    unitByIdForSpeaker,
  } = input;

  const hostMatchedTranslationLayers = filterTranslationLayersForVerticalReadingGroup(
    group,
    translationLayers,
    transcriptionLayers,
    defaultTranscriptionLayerId,
    sourceLayer?.id,
    layerLinks,
  );
  const groupTranslationAnchorUnitIds = Array.from(new Set(group.targetItems.flatMap((item) => item.anchorUnitIds)));
  const textMap = translationTextByLayer ?? new Map<string, ReadonlyMap<string, LayerUnitContentDocType>>();
  const textBackedFallbackTranslationLayers = hostMatchedTranslationLayers.length === 0
    ? translationLayers.filter((layer) => {
        const layerTextMap = textMap.get(layer.id);
        if (!layerTextMap || layerTextMap.size === 0) return false;
        return groupTranslationAnchorUnitIds.some((unitId) => {
          const content = layerTextMap.get(unitId);
          const text = normalizePairedReadingPlainText(content?.text ?? '');
          return text.length > 0;
        });
      })
    : [];
  const groupTranslationLayers = hostMatchedTranslationLayers.length > 0
    ? hostMatchedTranslationLayers
    : textBackedFallbackTranslationLayers;
  const groupPreferredTargetLayer = groupTranslationLayers.find((l) => l.id === targetLayer?.id)
    ?? groupTranslationLayers[0];

  const primaryUnitId = group.sourceItems[0]?.unitId ?? '';
  const primarySourceUnit = primaryUnitId ? unitByIdForSpeaker.get(primaryUnitId) : undefined;

  const baseReuseGroupTargetItems = !(
    hostMatchedTranslationLayers.length === 0
    && group.targetItems.every((item) => normalizePairedReadingPlainText(item.text ?? '').length === 0)
  );
  const isPrimaryLayer = syncTranslationLayer.id === groupPreferredTargetLayer?.id;
  const shouldReuseGroupTargetItems = isPrimaryLayer
    && translationLayers.length <= 1
    && baseReuseGroupTargetItems;

  const layerTargetItems: PairedReadingTargetItem[] = (() => {
    if (shouldReuseGroupTargetItems) return group.targetItems;
    if (!primarySourceUnit) {
      return [{
        id: `${group.id}:${syncTranslationLayer.id}:placeholder`,
        text: '',
        anchorUnitIds: primaryUnitId ? [primaryUnitId] : [],
      }];
    }
    const explicit = resolvePairedReadingExplicitTargetItemsForLayer(
      primarySourceUnit,
      syncTranslationLayer,
      defaultTranscriptionLayerId,
      segmentsByLayer,
      segmentContentByLayer,
      unitByIdForSpeaker,
    );
    if (explicit != null && explicit.length > 0) return explicit;
    const plain = resolvePairedReadingTargetPlainTextForLayer(
      primarySourceUnit,
      syncTranslationLayer,
      defaultTranscriptionLayerId,
      segmentsByLayer,
      segmentContentByLayer,
      textMap,
      unitByIdForSpeaker,
    );
    return buildVerticalReadingTargetItemsFromRawText(primarySourceUnit.id, plain);
  })();

  const perSegTargetsPrimary = verticalReadingUsesSplitTargetEditors(group);
  const layerPerSeg = isPrimaryLayer
    ? (translationLayers.length <= 1 ? perSegTargetsPrimary : layerTargetItems.length > 1)
    : layerTargetItems.length > 1;

  if (layerPerSeg && layerTargetItems[0]) {
    return `target:${group.id}:${syncTranslationLayer.id}:${layerTargetItems[0].id}`;
  }
  return `target:${group.id}:${syncTranslationLayer.id}:editor`;
}

/** 对照组锚定到的原文层 id（用于对齐横向 buildLayerBundles 根块） | Source layer id for horizontal bundle mapping */
export function resolveVerticalReadingGroupSourceAnchorLayerId(
  group: VerticalReadingGroup,
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
  layerLinks: readonly VerticalReadingHostLink[] = [],
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
 * Paired-reading bundle aligns with horizontal layer bundle root id
 */
export function resolvePairedReadingHorizontalBundleKey(
  group: VerticalReadingGroup,
  layerIdToBundleRootId: ReadonlyMap<string, string>,
  fallbackSourceLayerId: string | undefined,
): string {
  const anchorLayerId = resolveVerticalReadingGroupSourceAnchorLayerId(group, fallbackSourceLayerId);
  if (anchorLayerId) {
    const root = layerIdToBundleRootId.get(anchorLayerId);
    if (root) return root;
  }
  return `__cmp_group:${group.id}`;
}

/** 纵向对照菜单文案小助手 | Small locale helper for comparison menus */
export function pairedReadingMenuText(locale: Locale, zh: string, en: string): string {
  return locale === 'zh-CN' ? zh : en;
}

export function resolvePairedReadingTargetPlainTextForLayer(
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
    const overlapping = listTranslationSegmentsForVerticalReadingSourceUnit(
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

export function resolvePairedReadingExplicitTargetItemsForLayer(
  unit: LayerUnitDocType,
  tLayer: LayerDocType,
  defaultTranscriptionLayerId: string | undefined,
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined,
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>> | undefined,
  unitByIdForSpeaker: ReadonlyMap<string, LayerUnitDocType>,
): PairedReadingTargetItem[] | undefined {
  const targetUsesSegments = layerUsesOwnSegments(tLayer, defaultTranscriptionLayerId);
  const translationSegmentsForTarget = segmentsByLayer?.get(tLayer.id);
  const layerContent = segmentContentByLayer?.get(tLayer.id);
  if (!targetUsesSegments || !layerContent || !translationSegmentsForTarget?.length) return undefined;
  const overlapping = listTranslationSegmentsForVerticalReadingSourceUnit(
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

/**
 * 按 `filterTranslationLayersForVerticalReadingSourceUnit` 的层序，把各层 explicit 语段或纯文本行压平为
 * 单一 `targetItems` 列表，与横向多译文轨在当前源单位下的可见内容对齐（合并签名 / `editingTargetPolicy` 同源）。 |
 * Aggregate per-layer targets for one source unit (parity with horizontal multi-translation lanes).
 */
export function buildAggregatePairedReadingTargetItemsForSourceUnit(input: {
  unit: LayerUnitDocType;
  translationLayers: readonly LayerDocType[];
  transcriptionLayers: readonly LayerDocType[];
  defaultTranscriptionLayerId: string | undefined;
  layerLinks: readonly VerticalReadingHostLink[];
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>> | undefined;
  translationTextByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  unitByIdForSpeaker: ReadonlyMap<string, LayerUnitDocType>;
  fallbackFocusedSourceLayerId: string | undefined;
}): PairedReadingTargetItem[] {
  const applicable = filterTranslationLayersForVerticalReadingSourceUnit(
    input.unit,
    input.translationLayers,
    input.transcriptionLayers,
    input.defaultTranscriptionLayerId,
    input.fallbackFocusedSourceLayerId,
    input.layerLinks,
  );
  const out: PairedReadingTargetItem[] = [];
  for (const tl of applicable) {
    const explicit = resolvePairedReadingExplicitTargetItemsForLayer(
      input.unit,
      tl,
      input.defaultTranscriptionLayerId,
      input.segmentsByLayer,
      input.segmentContentByLayer,
      input.unitByIdForSpeaker,
    );
    if (explicit != null && explicit.length > 0) {
      for (const it of explicit) {
        out.push({
          ...it,
          id: `${it.id}:layer:${tl.id}`,
        });
      }
      continue;
    }
    const plain = resolvePairedReadingTargetPlainTextForLayer(
      input.unit,
      tl,
      input.defaultTranscriptionLayerId,
      input.segmentsByLayer,
      input.segmentContentByLayer,
      input.translationTextByLayer,
      input.unitByIdForSpeaker,
    );
    const rowPrefix = `${input.unit.id}:layer:${tl.id}`;
    // `buildVerticalReadingTargetItemsFromRawText` 用首参生成稳定行 id；首参不能当 anchor（否则会变成 `u1:layer:…` 伪 id，纵向保存写错句段）。
    out.push(
      ...buildVerticalReadingTargetItemsFromRawText(rowPrefix, plain).map((item) => ({
        ...item,
        anchorUnitIds: [input.unit.id],
      })),
    );
  }
  return out;
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

export const PAIRED_READING_COLUMN_LEFT_GROW_KEY = 'jieyu:paired-reading-column-left-grow';
export const PAIRED_READING_EDITOR_HEIGHT_STORAGE_KEY = 'jieyu:paired-reading-editor-min-height';
const LEGACY_SHARED_TIMELINE_EDITOR_MIN_HEIGHT = Math.max(42, DEFAULT_TIMELINE_LANE_HEIGHT - 12);
const SHARED_TIMELINE_EDITOR_MIN_HEIGHT = Math.max(
  63,
  Math.round(LEGACY_SHARED_TIMELINE_EDITOR_MIN_HEIGHT * 1.5),
);

export function readStoredPairedReadingColumnLeftGrow(): number {
  if (typeof window === 'undefined') return 50;
  try {
    const raw = localStorage.getItem(PAIRED_READING_COLUMN_LEFT_GROW_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 20 && n <= 80) return Math.round(n);
  } catch {
    /* ignore */
  }
  return 50;
}

export function readStoredPairedReadingEditorMinHeight(): number {
  if (typeof window === 'undefined') return SHARED_TIMELINE_EDITOR_MIN_HEIGHT;
  try {
    const raw = localStorage.getItem(PAIRED_READING_EDITOR_HEIGHT_STORAGE_KEY);
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

export function readStoredPairedReadingEditorHeightMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PAIRED_READING_EDITOR_HEIGHT_STORAGE_KEY);
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

export function mergePairedReadingTimelineUnitById(
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

/** 在「当前时间轴上的转写轨」集合内，沿树父链数深度；根为 0，子依赖轨递增 | Depth among timeline transcription lanes */
function transcriptionTreeDepthAmongLanes(
  layer: LayerDocType,
  layerById: ReadonlyMap<string, LayerDocType>,
  transcriptionLaneIds: ReadonlySet<string>,
  layerLinks: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>,
): number {
  if (layer.layerType !== 'transcription') return 0;
  let depth = 0;
  let cur: LayerDocType | undefined = layer;
  const guard = new Set<string>();
  for (let i = 0; i < 64 && cur; i += 1) {
    if (guard.has(cur.id)) break;
    guard.add(cur.id);
    const p = layerTranscriptionTreeParentId(cur)?.trim() ?? '';
    if (p && transcriptionLaneIds.has(p)) {
      depth += 1;
      cur = layerById.get(p);
      continue;
    }
    if (layerLinks.length > 0) {
      const hosts = listInboundTranscriptionHostIdsForTranscriptionLane(cur.id, layerLinks, layerById, transcriptionLaneIds);
      const step = hosts[0];
      if (step) {
        depth += 1;
        cur = layerById.get(step);
        continue;
      }
    }
    break;
  }
  return depth;
}

/** 父转写轨先于子依赖轨，再按 sortOrder / id，供纵向源行遍历与稳定排序 | Parent lanes before dependent child lanes */
function sortTranscriptionLayersForVerticalReadingSourceWalk(
  layers: LayerDocType[],
  layerById: ReadonlyMap<string, LayerDocType>,
  layerLinks: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>,
): LayerDocType[] {
  const transcriptionLaneIds = new Set(layers.map((l) => l.id));
  return [...layers].sort((a, b) => {
    const da = transcriptionTreeDepthAmongLanes(a, layerById, transcriptionLaneIds, layerLinks);
    const db = transcriptionTreeDepthAmongLanes(b, layerById, transcriptionLaneIds, layerLinks);
    if (da !== db) return da - db;
    const ao = a.sortOrder ?? 0;
    const bo = b.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id);
  });
}

/** 与 `resolveVerticalReadingGroupSourceUnits` 一致的转写轨遍历顺序（父先于子） | Same lane walk order as vertical source resolver */
export function transcriptionLayersOrderedForVerticalReadingSourceWalk(input: {
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  allLayersOrdered: LayerDocType[] | undefined;
  layerLinks?: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>;
}): LayerDocType[] {
  const layerById = new Map(
    (input.allLayersOrdered ?? [...input.transcriptionLayers, ...input.translationLayers]).map((l) => [l.id, l] as const),
  );
  return sortTranscriptionLayersForVerticalReadingSourceWalk(input.transcriptionLayers, layerById, input.layerLinks ?? []);
}

/**
 * 无译文层时：纵向对读右列用于展示树中更深的转写轨；左列保留最浅（父）轨，避免被误当成「缺译文」空壳 |
 * With zero translation layers, pin the shallowest transcription lane as the primary stack and treat deeper lanes as dependents.
 * Dependents are rendered stacked under their overlapping primary row in the source column (not a separate grid column).
 */
export function partitionPairedReadingSourceItemsForDualTranscriptionColumns(input: {
  sourceItems: ReadonlyArray<PairedReadingSourceItem>;
  translationLayers: readonly { id: string }[];
  orderedTranscriptionLanes: readonly LayerDocType[];
}): { primaryColumnItems: PairedReadingSourceItem[]; secondaryColumnItems: PairedReadingSourceItem[] } {
  const { sourceItems, translationLayers, orderedTranscriptionLanes } = input;
  if (translationLayers.length > 0 || sourceItems.length <= 1) {
    return { primaryColumnItems: [...sourceItems], secondaryColumnItems: [] };
  }
  const laneOf = (s: PairedReadingSourceItem) => (typeof s.layerId === 'string' ? s.layerId.trim() : '');
  const distinctLaneIds = [...new Set(sourceItems.map(laneOf).filter((id) => id.length > 0))];
  if (distinctLaneIds.length < 2) {
    return { primaryColumnItems: [...sourceItems], secondaryColumnItems: [] };
  }
  const orderMap = new Map(orderedTranscriptionLanes.map((l, i) => [l.id, i] as const));
  const lanesSorted = [...distinctLaneIds].sort((a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999));
  const primaryLaneId = lanesSorted[0]!;
  const secondaryLaneIds = new Set(lanesSorted.slice(1));
  const primaryColumnItems = sourceItems.filter((s) => laneOf(s) === primaryLaneId);
  const secondaryColumnItems = sourceItems.filter((s) => secondaryLaneIds.has(laneOf(s)));
  if (primaryColumnItems.length === 0) {
    return { primaryColumnItems: [...sourceItems], secondaryColumnItems: [] };
  }
  return { primaryColumnItems, secondaryColumnItems };
}

/**
 * Buckets dependent-lane source rows under the primary row whose time range they overlap.
 * Unmatched secondaries attach to the last primary row.
 */
export function partitionSecondarySourceItemsUnderPrimaryItems(
  primaryColumnItems: ReadonlyArray<PairedReadingSourceItem>,
  secondaryColumnItems: ReadonlyArray<PairedReadingSourceItem>,
): PairedReadingSourceItem[][] {
  if (primaryColumnItems.length === 0 || secondaryColumnItems.length === 0) return [];
  const epsilon = 1e-4;
  const overlap = (p: PairedReadingSourceItem, s: PairedReadingSourceItem) => (
    s.startTime < p.endTime + epsilon && s.endTime > p.startTime - epsilon
  );
  const buckets: PairedReadingSourceItem[][] = primaryColumnItems.map(() => []);
  for (const s of secondaryColumnItems) {
    let placed = false;
    for (let i = 0; i < primaryColumnItems.length; i++) {
      if (overlap(primaryColumnItems[i]!, s)) {
        buckets[i]!.push(s);
        placed = true;
        break;
      }
    }
    if (!placed) {
      buckets[buckets.length - 1]!.push(s);
    }
  }
  return buckets;
}

export function resolveVerticalReadingGroupSourceUnits(input: {
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  layerLinks: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>;
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
    layerLinks,
    unitsOnCurrentMedia,
    segmentParentUnitLookup: _segmentParentUnitLookup,
    segmentsByLayer,
    allLayersOrdered,
    defaultTranscriptionLayerId,
    activeSpeakerFilterKey,
    unitByIdForSpeaker,
  } = input;

  const filteredHostUnits = unitsOnCurrentMedia.filter((u) => u.tags?.skipProcessing !== true);

  const layerById = new Map(
    (allLayersOrdered ?? [...transcriptionLayers, ...translationLayers]).map((l) => [l.id, l] as const),
  );

  const transcriptionLaneIds = new Set(transcriptionLayers.map((l) => l.id));
  const transcriptionLayersOrdered = sortTranscriptionLayersForVerticalReadingSourceWalk(
    transcriptionLayers,
    layerById,
    layerLinks,
  );

  const depthForLaneId = (laneId: string): number => {
    const trimmed = laneId.trim();
    if (!trimmed) return 0;
    const layer = layerById.get(trimmed);
    if (!layer) return 0;
    return transcriptionTreeDepthAmongLanes(layer, layerById, transcriptionLaneIds, layerLinks);
  };

  const speakerKey = activeSpeakerFilterKey ?? 'all';
  const seen = new Set<string>();
  const out: LayerUnitDocType[] = [];

  const rowDedupeKey = (laneLayerId: string, rowId: string) => `${laneLayerId}:${rowId}`;

  const push = (laneLayer: LayerDocType, u: LayerUnitDocType) => {
    if (u.tags?.skipProcessing === true) return;
    const key = rowDedupeKey(laneLayer.id, u.id);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(u);
  };

  const primaryUnscopedHostId = resolvePrimaryUnscopedTranscriptionHostId(
    transcriptionLayers,
    defaultTranscriptionLayerId,
  );

  const pushCanonicalRowsForLane = (layer: LayerDocType) => {
    for (const u of unitsOnCurrentMedia) {
      const resolved = resolveCanonicalUnitForTranscriptionLaneRow({
        unit: u,
        laneLayer: layer,
        layerById,
        transcriptionLaneIds,
        primaryUnscopedHostId,
        ...(layerLinks.length > 0 ? { layerLinks } : {}),
      });
      if (!resolved.include) continue;
      push(layer, resolved.row);
    }
  };

  for (const layer of transcriptionLayersOrdered) {
    if (layerUsesOwnSegments(layer, defaultTranscriptionLayerId)) {
      const segmentSourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId, layerLinks);
      const segmentSourceLayerId = segmentSourceLayer?.id ?? '';
      const segs = segmentsByLayer?.get(segmentSourceLayerId) ?? [];
      if (segs.length > 0) {
        for (const segment of segs) {
          if (speakerKey !== 'all') {
            const k = resolveSpeakerFocusKeyFromSegment(segment, unitByIdForSpeaker);
            if (k !== normalizeSpeakerFocusKey(speakerKey)) continue;
          }
          /** 始终 stamp 当前遍历轨，避免 segment 仍带宿主 layerId 时被归进父列、依赖轨纵向缺行 | Always stamp walk lane */
          const row = { ...segment, layerId: layer.id };
          push(layer, row);
        }
        /**
         * 依赖轨自有 segment 列表往往只覆盖已编辑窗，父轨 segment/句级在该窗仍有内容时若不补镜像，
         * 纵向对读组里会只剩父轨（用户见「有的组有子轨、有的组没有」）。宿主轨勿补，以免与 segment 行重复。 |
         * Dependent lanes: fill gaps with canonical projection; host lanes skip to avoid duplicate rows.
         */
        if (isTranscriptionDependentLaneForVerticalSourceWalk(layer, transcriptionLaneIds, layerLinks, layerById)) {
          pushCanonicalRowsForLane(layer);
        }
      } else {
        /** 独立边界/时间细分轨尚无 segment 行时，与句级轨一致从 canonical 读模型镜像，避免纵向对读只剩父轨 | Empty segment bucket: mirror canonical like unit-mode lanes */
        pushCanonicalRowsForLane(layer);
      }
    } else {
      pushCanonicalRowsForLane(layer);
    }
    /**
     * 任意依赖转写轨（含 symbolic_association）：父轨 segment 在句级 `unitsOnCurrentMedia` 中未必有对应行，canonical 补不齐后半段窗。
     * 产品上依赖层多为 symbolic，并非 independent_boundary；仍在此统一补宿主 segment 行。 |
     * All dependent transcription lanes: mirror host segment timeline; common case is symbolic_association, not segment-first.
     */
    pushHostTranscriptionSegmentsOntoDependentLane({
      layer,
      transcriptionLaneIds,
      layerLinks,
      layerById,
      segmentsByLayer,
      speakerKey,
      unitByIdForSpeaker,
      push,
      defaultTranscriptionLayerId,
      existingRows: out,
    });
  }

  if (out.length === 0) {
    return filteredHostUnits;
  }

  return out.sort((left, right) => {
    const dt = left.startTime - right.startTime;
    if (dt !== 0) return dt;
    const de = left.endTime - right.endTime;
    if (de !== 0) return de;
    const ll = typeof left.layerId === 'string' ? left.layerId.trim() : '';
    const rl = typeof right.layerId === 'string' ? right.layerId.trim() : '';
    const depthDiff = depthForLaneId(ll) - depthForLaneId(rl);
    if (depthDiff !== 0) return depthDiff;
    const li = transcriptionLayersOrdered.findIndex((l) => l.id === ll);
    const ri = transcriptionLayersOrdered.findIndex((l) => l.id === rl);
    if (li !== ri) return (li < 0 ? 9999 : li) - (ri < 0 ? 9999 : ri);
    return left.id.localeCompare(right.id);
  });
}

/** 行左侧窄轨可见字符：取展示名首字素，避免整段层头塞进每一行 | One grapheme for row rail */
function pairedReadingRowRailMark(fullLabel: string): string {
  const trimmed = normalizeSingleLine(fullLabel);
  if (trimmed.length === 0) return '·';
  const first = Array.from(trimmed)[0];
  return first ?? '·';
}

type PairedReadingRailLaneLabelMode = 'full' | 'continuation';

/** 与横向时间轴 renderLaneLabel 一致的多行层头；无层或回调空时回落单字标记 */
export function renderPairedReadingRailLaneBody(input: {
  layer: LayerDocType | undefined;
  renderLaneLabel: (layer: LayerDocType) => ReactNode;
  fallbackTitle: string;
  mode: PairedReadingRailLaneLabelMode;
}): ReactNode {
  if (input.mode === 'continuation') {
    return (
      <span
        className="timeline-paired-reading-row-rail-lane-label timeline-paired-reading-row-rail-lane-label-continuation"
        aria-hidden
      >
        ·
      </span>
    );
  }
  if (input.layer) {
    const body = input.renderLaneLabel(input.layer);
    if (body != null && body !== false && body !== '') {
      return <span className="timeline-paired-reading-row-rail-lane-label" aria-hidden>{body}</span>;
    }
  }
  return (
    <span className="timeline-paired-reading-row-rail-mark" aria-hidden>
      {pairedReadingRowRailMark(input.fallbackTitle)}
    </span>
  );
}

export function resolvePairedReadingLayerLabel(layer: LayerDocType | undefined, locale: Locale, fallback: string): string {
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

export function resolvePairedReadingEditorRows(value: string): number {
  return Math.min(6, Math.max(1, normalizePairedReadingPlainText(value).split('\n').length));
}

export type PairedReadingLayerLink = LayerLinkDocType;
