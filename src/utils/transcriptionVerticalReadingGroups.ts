import { layerTranscriptionTreeParentId, type LayerDocType, type LayerLinkDocType, type LayerUnitDocType } from '../db';
import { listInboundTranscriptionHostIdsForTranscriptionLane } from './transcriptionUnitLaneReadScope';
import { normalizeSingleLine } from './transcriptionFormatters';

export interface PairedReadingSourceItem {
  unitId: string;
  text: string;
  startTime: number;
  endTime: number;
  layerId?: string;
}

export interface PairedReadingTargetItem {
  id: string;
  text: string;
  anchorUnitIds: string[];
  /** 译文独立语段 id：有则纵向对读按语段分项编辑并写回该段 | Translation segment id for per-segment paired-reading rows */
  translationSegmentId?: string;
}

export interface VerticalReadingGroup {
  id: string;
  startTime: number;
  endTime: number;
  sourceItems: PairedReadingSourceItem[];
  targetItems: PairedReadingTargetItem[];
  bundleRootId?: string;
  speakerSummary: string;
  primaryAnchorUnitId: string;
  primaryAnchorLayerId?: string;
  editingTargetPolicy: 'group-target' | 'multi-target-items';
  /** 多条原文并入同一对照组（N:1 / 合并组） */
  isMultiAnchorGroup: boolean;
}

/**
 * 与 [rangeStart, rangeEnd] 时间相交的 segments，按起点排序 | Segments overlapping a time range, sorted by start
 */
export function listSegmentsOverlappingTimeRange(
  segments: readonly LayerUnitDocType[] | undefined,
  rangeStart: number,
  rangeEnd: number,
): LayerUnitDocType[] {
  if (!segments?.length) return [];
  return segments
    .filter((s) => s.startTime < rangeEnd && s.endTime > rangeStart)
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
}

/**
 * 对照源行为子语段时，按宿主父句拉平译文子段（与横向轨「一父多译」行一致） |
 * When the comparison source row is a child segment, list translation segments under the same parent host.
 */
export function listTranslationSegmentsForVerticalReadingSourceUnit(
  unit: LayerUnitDocType,
  translationSegments: readonly LayerUnitDocType[] | undefined,
  unitById: ReadonlyMap<string, LayerUnitDocType>,
): LayerUnitDocType[] {
  if (!translationSegments?.length) return [];
  const parentId = typeof unit.parentUnitId === 'string' ? unit.parentUnitId.trim() : '';
  const parent = parentId ? unitById.get(parentId) : undefined;
  if (parent) {
    const byParentField = translationSegments.filter((s) => {
      const sid = typeof s.parentUnitId === 'string' ? s.parentUnitId.trim() : '';
      return sid.length > 0 && sid === parent.id;
    });
    /**
     * 仅 `parentUnitId` 命中父句时，曾直接返回子集；若另有译文段落在父时间窗内但未写 parent（或写错），
     * 横向轨仍占一行，纵向会少一条。合并「父链」与「父时间窗相交」并去重，与空链时回落逻辑一致。 |
     * Merge parent-linked segments with any overlapping the host window so vertical parity with horizontal rows.
     */
    const overlapOnParentWindow = listSegmentsOverlappingTimeRange(
      translationSegments,
      parent.startTime,
      parent.endTime,
    );
    const mergedById = new Map<string, LayerUnitDocType>();
    for (const s of byParentField) mergedById.set(s.id, s);
    for (const s of overlapOnParentWindow) mergedById.set(s.id, s);
    if (mergedById.size > 0) {
      return [...mergedById.values()].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
    }
    return listSegmentsOverlappingTimeRange(
      translationSegments,
      unit.startTime,
      unit.endTime,
    );
  }
  return listSegmentsOverlappingTimeRange(
    translationSegments,
    unit.startTime,
    unit.endTime,
  );
}

/**
 * 在相交的翻译层 segment 中，选与区间重叠时长最大的一条用于持久化（避免多段时整段重复写入） |
 * Pick the translation segment with maximum overlap for persistence.
 */
export function pickTranslationSegmentForPersist(
  segments: readonly LayerUnitDocType[] | undefined,
  rangeStart: number,
  rangeEnd: number,
): LayerUnitDocType | undefined {
  const overlapping = listSegmentsOverlappingTimeRange(segments, rangeStart, rangeEnd);
  if (overlapping.length === 0) return undefined;
  if (overlapping.length === 1) return overlapping[0];
  let best = overlapping[0]!;
  let bestOverlap = 0;
  for (const s of overlapping) {
    const s0 = Math.max(s.startTime, rangeStart);
    const s1 = Math.min(s.endTime, rangeEnd);
    const overlap = Math.max(0, s1 - s0);
    if (overlap > bestOverlap || (overlap === bestOverlap && s.id.localeCompare(best.id) < 0)) {
      bestOverlap = overlap;
      best = s;
    }
  }
  return best;
}

type VerticalReadingGroupBuild = Omit<VerticalReadingGroup, 'isMultiAnchorGroup'> & {
  targetSignature: string;
  speakerLabels: string[];
};

export type VerticalReadingGroupLayerLink = Pick<
  LayerLinkDocType,
  'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'
>;

interface BuildVerticalReadingGroupsInput {
  units: LayerUnitDocType[];
  /** 入站 layer_links：无树父字段的依赖轨并入组时用于解析宿主 | Inbound links for link-only dependent lanes */
  layerLinks?: readonly VerticalReadingGroupLayerLink[];
  /** 可选：仅把这些层视为左列原文来源，避免把翻译层单位误并入原文列 */
  sourceLayerIds?: readonly string[];
  /**
   * 纵向多轨源行已 stamp 不同 `layerId` 时，用该列表的树深度与顺序稳定排序（父轨先于依赖子轨）；
   * 不传则时间相同时仍按 `layerId` 字典序（旧行为） |
   * When multi-lane source rows carry distinct `layerId`, order ties by tree depth (parent before dependent).
   */
  transcriptionLayersForSourceWalkOrder?: readonly LayerDocType[];
  getSourceText: (unit: LayerUnitDocType) => string;
  getTargetText: (unit: LayerUnitDocType) => string;
  /**
   * 若返回非空数组则替代 getTargetText 拆行结果（用于译文按 segment 分项） |
   * When non-empty, replaces newline-split target items (e.g. one row per translation segment).
   */
  getTargetItems?: (unit: LayerUnitDocType) => PairedReadingTargetItem[] | undefined;
  getSpeakerLabel?: (unit: LayerUnitDocType) => string;
  /**
   * 相邻源单位可合并的最大时间间隔（秒）。传入负数（如 -1）则永不按相邻规则合并，
   * 用于语段化转写与媒体轨「一语段一译文行」对齐。
   */
  maxMergeGapSec?: number;
}

function resolvePairedReadingBundleRootId(unit: LayerUnitDocType): string | undefined {
  const bundleRootId = typeof unit.rootUnitId === 'string' && unit.rootUnitId.trim().length > 0
    ? unit.rootUnitId.trim()
    : undefined;
  return bundleRootId;
}

function resolvePairedReadingSpeakerLabel(unit: LayerUnitDocType, preferredLabel?: string): string {
  const normalizedPreferred = normalizeSingleLine(preferredLabel ?? '');
  if (normalizedPreferred.length > 0) return normalizedPreferred;

  const normalizedSpeaker = normalizeSingleLine(typeof unit.speaker === 'string' ? unit.speaker.trim() : '');
  if (normalizedSpeaker.length > 0 && normalizedSpeaker !== unit.speakerId?.trim()) {
    return normalizedSpeaker;
  }

  const speakerId = typeof unit.speakerId === 'string' ? unit.speakerId.trim() : '';
  if (/^speaker[_:-]/i.test(speakerId)) {
    return '';
  }
  return normalizeSingleLine(speakerId);
}

function buildPairedReadingSpeakerSummary(labels: string[]): string {
  const uniqueLabels = Array.from(new Set(labels.filter((label) => label.length > 0)));
  if (uniqueLabels.length === 0) return '';
  if (uniqueLabels.length <= 2) return uniqueLabels.join(' · ');
  return `${uniqueLabels[0]} +${uniqueLabels.length - 1}`;
}

/** 与 buildVerticalReadingGroups 内联逻辑一致：供纵向对读壳内按层从纯文本拆出多条译文编辑项 */
export function buildVerticalReadingTargetItemsFromRawText(unitId: string, rawText: string): PairedReadingTargetItem[] {
  return buildPairedReadingTargetItemsFromRawTextLines(unitId, rawText);
}

function buildPairedReadingTargetItemsFromRawTextLines(unitId: string, rawText: string): PairedReadingTargetItem[] {
  const normalizedLines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => normalizeSingleLine(line));
  const hasVisibleText = normalizedLines.some((line) => line.length > 0);
  const targetLines = hasVisibleText ? normalizedLines.filter((line) => line.length > 0) : [''];

  return targetLines.map((text, index) => ({
    id: `${unitId}:target:${index}`,
    text,
    anchorUnitIds: [unitId],
  }));
}

function buildPairedReadingTargetSignature(targetItems: PairedReadingTargetItem[]): string {
  return targetItems
    .map((item) => item.text.trim().toLocaleLowerCase())
    .join('\n');
}

function isBlankPairedReadingTargetSignature(sig: string): boolean {
  if (sig.trim().length === 0) return true;
  return sig.split('\n').every((line) => line.trim().length === 0);
}

function rangesOverlap1D(a0: number, a1: number, b0: number, b1: number): boolean {
  return b0 < a1 + 1e-4 && b1 > a0 - 1e-4;
}

/**
 * 当前单位所在转写轨是否为「上一组已收录的某条转写轨」在树中的后代（依赖轨并入父轨对读组）。 |
 * True when `unit`'s transcription lane is a descendant of some lane already present in `previousSourceItems`.
 */
function transcriptionDependentLaneMergesIntoSourceGroup(
  previousSourceItems: readonly PairedReadingSourceItem[],
  unit: LayerUnitDocType,
  walkLayerById: ReadonlyMap<string, LayerDocType>,
  walkLaneIds: ReadonlySet<string>,
  layerLinks: readonly VerticalReadingGroupLayerLink[],
): boolean {
  const uid = typeof unit.layerId === 'string' ? unit.layerId.trim() : '';
  if (!uid || !walkLaneIds.has(uid)) return false;
  const hostLayerIds = new Set(
    previousSourceItems
      .map((s) => (typeof s.layerId === 'string' ? s.layerId.trim() : ''))
      .filter((id) => id.length > 0 && walkLaneIds.has(id)),
  );
  if (hostLayerIds.size === 0) return false;
  if (hostLayerIds.has(uid)) return false;
  let cur: LayerDocType | undefined = walkLayerById.get(uid);
  const guard = new Set<string>();
  for (let i = 0; i < 64 && cur; i += 1) {
    if (guard.has(cur.id)) break;
    guard.add(cur.id);
    const p = layerTranscriptionTreeParentId(cur)?.trim() ?? '';
    if (p.length > 0 && walkLaneIds.has(p)) {
      if (hostLayerIds.has(p)) return true;
      cur = walkLayerById.get(p);
      continue;
    }
    if (layerLinks.length > 0) {
      const hosts = listInboundTranscriptionHostIdsForTranscriptionLane(cur.id, layerLinks, walkLayerById, walkLaneIds);
      let stepped = false;
      for (const hid of hosts) {
        if (hostLayerIds.has(hid)) return true;
        const next = walkLayerById.get(hid);
        if (next) {
          cur = next;
          stepped = true;
          break;
        }
      }
      if (stepped) continue;
    }
    break;
  }
  return false;
}

function transcriptionLaneDepthAmongOrderedLanes(
  laneId: string,
  layerById: ReadonlyMap<string, LayerDocType>,
  laneIds: ReadonlySet<string>,
): number {
  const layer = layerById.get(laneId);
  if (!layer || layer.layerType !== 'transcription') return 0;
  let depth = 0;
  let cur: LayerDocType | undefined = layer;
  const guard = new Set<string>();
  for (let i = 0; i < 64 && cur; i += 1) {
    if (guard.has(cur.id)) break;
    guard.add(cur.id);
    const p = layerTranscriptionTreeParentId(cur)?.trim() ?? '';
    if (!p || !laneIds.has(p)) break;
    depth += 1;
    cur = layerById.get(p);
  }
  return depth;
}

/**
 * 构建纵向对读分组 | Build lightweight paired-reading column groups
 */
export function buildVerticalReadingGroups(input: BuildVerticalReadingGroupsInput): VerticalReadingGroup[] {
  const maxMergeGapSec = typeof input.maxMergeGapSec === 'number' ? input.maxMergeGapSec : 0.12;
  const layerLinks = input.layerLinks ?? [];
  const sourceLayerIdSet = new Set(
    (input.sourceLayerIds ?? [])
      .map((layerId) => layerId.trim())
      .filter((layerId) => layerId.length > 0),
  );
  const walkOrderLayers = input.transcriptionLayersForSourceWalkOrder ?? [];
  const walkLaneIds = new Set(walkOrderLayers.map((l) => l.id));
  const walkLayerById = new Map(walkOrderLayers.map((l) => [l.id, l] as const));

  const orderedUnits = [...input.units]
    .filter((unit) => unit.tags?.skipProcessing !== true)
    .filter((unit) => {
      if (sourceLayerIdSet.size === 0) return true;
      const layerId = typeof unit.layerId === 'string' ? unit.layerId.trim() : '';
      // Canonical `unit` 读模型常省略 layerId（见 projectUnitDocFromLayerUnit），但仍属于当前转写时间轴；
      // 若此处一律按 layerId 过滤，对照模式会得到 0 组、只剩空壳。
      // | Read-model unit rows often omit layerId; excluding them yields an empty comparison shell.
      if (layerId.length === 0) return true;
      return sourceLayerIdSet.has(layerId);
    })
    .sort((left, right) => {
      const dt = left.startTime - right.startTime;
      if (dt !== 0) return dt;
      const de = left.endTime - right.endTime;
      if (de !== 0) return de;
      const ll = typeof left.layerId === 'string' ? left.layerId.trim() : '';
      const rl = typeof right.layerId === 'string' ? right.layerId.trim() : '';
      if (walkOrderLayers.length > 0) {
        const depthDiff = transcriptionLaneDepthAmongOrderedLanes(ll, walkLayerById, walkLaneIds)
          - transcriptionLaneDepthAmongOrderedLanes(rl, walkLayerById, walkLaneIds);
        if (depthDiff !== 0) return depthDiff;
        const li = walkOrderLayers.findIndex((l) => l.id === ll);
        const ri = walkOrderLayers.findIndex((l) => l.id === rl);
        if (li !== ri) return (li < 0 ? 9999 : li) - (ri < 0 ? 9999 : ri);
      } else {
        const dl = ll.localeCompare(rl);
        if (dl !== 0) return dl;
      }
      return left.id.localeCompare(right.id);
    });
  const groups: VerticalReadingGroupBuild[] = [];

  for (const unit of orderedUnits) {
    const sourceText = normalizeSingleLine(input.getSourceText(unit) ?? '');
    const explicitTargetItems = input.getTargetItems?.(unit);
    const targetItems = explicitTargetItems != null && explicitTargetItems.length > 0
      ? explicitTargetItems
      : buildPairedReadingTargetItemsFromRawTextLines(unit.id, input.getTargetText(unit) ?? '');
    const targetSignature = buildPairedReadingTargetSignature(targetItems);
    const speakerLabel = resolvePairedReadingSpeakerLabel(unit, input.getSpeakerLabel?.(unit));
    const bundleRootId = resolvePairedReadingBundleRootId(unit);
    const previous = groups[groups.length - 1];
    const sameBundle = previous?.bundleRootId === bundleRootId;
    const sameResolvedTarget = previous?.targetSignature === targetSignature;
    const canMergeDependentTranscriptionLane = Boolean(
      previous
      && walkOrderLayers.length > 0
      && rangesOverlap1D(previous.startTime, previous.endTime, unit.startTime, unit.endTime)
      && (
        sameResolvedTarget
        || (isBlankPairedReadingTargetSignature(previous.targetSignature)
          && isBlankPairedReadingTargetSignature(targetSignature))
      )
      && transcriptionDependentLaneMergesIntoSourceGroup(
        previous.sourceItems,
        unit,
        walkLayerById,
        walkLaneIds,
        layerLinks,
      ),
    );
    const canMerge = Boolean(
      previous
      && (
        (
          unit.startTime - previous.endTime <= maxMergeGapSec
          && (
            (sameResolvedTarget && targetSignature.length > 0)
            || (sameBundle && bundleRootId !== undefined && targetSignature.length === 0 && previous.targetSignature.length === 0)
          )
        )
        || canMergeDependentTranscriptionLane
      ),
    );

    if (canMerge && previous) {
      previous.endTime = Math.max(previous.endTime, unit.endTime);
      previous.sourceItems.push({
        unitId: unit.id,
        text: sourceText,
        startTime: unit.startTime,
        endTime: unit.endTime,
        ...(typeof unit.layerId === 'string' && unit.layerId.length > 0 ? { layerId: unit.layerId } : {}),
      });
      if (speakerLabel.length > 0 && !previous.speakerLabels.includes(speakerLabel)) {
        previous.speakerLabels.push(speakerLabel);
        previous.speakerSummary = buildPairedReadingSpeakerSummary(previous.speakerLabels);
      }
      for (const targetItem of previous.targetItems) {
        targetItem.anchorUnitIds.push(unit.id);
      }
      continue;
    }

    const sourceLaneKey = (typeof unit.layerId === 'string' && unit.layerId.trim().length > 0)
      ? unit.layerId.trim()
      : '__na__';
    groups.push({
      id: `pr-${unit.id}-src-${sourceLaneKey}`,
      startTime: unit.startTime,
      endTime: unit.endTime,
      sourceItems: [{
        unitId: unit.id,
        text: sourceText,
        startTime: unit.startTime,
        endTime: unit.endTime,
        ...(typeof unit.layerId === 'string' && unit.layerId.length > 0 ? { layerId: unit.layerId } : {}),
      }],
      targetItems,
      ...(bundleRootId !== undefined ? { bundleRootId } : {}),
      speakerSummary: buildPairedReadingSpeakerSummary(speakerLabel.length > 0 ? [speakerLabel] : []),
      primaryAnchorUnitId: unit.id,
      ...(typeof unit.layerId === 'string' && unit.layerId.length > 0 ? { primaryAnchorLayerId: unit.layerId } : {}),
      editingTargetPolicy: targetItems.length > 1 ? 'multi-target-items' : 'group-target',
      targetSignature,
      speakerLabels: speakerLabel.length > 0 ? [speakerLabel] : [],
    });
  }

  return groups.map(({ targetSignature: _targetSignature, speakerLabels: _speakerLabels, ...group }): VerticalReadingGroup => ({
    ...group,
    isMultiAnchorGroup: group.sourceItems.length > 1,
  }));
}
