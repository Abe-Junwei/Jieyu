import type { LayerUnitDocType } from '../db';
import { normalizeSingleLine } from './transcriptionFormatters';

export interface ComparisonSourceItem {
  unitId: string;
  text: string;
  startTime: number;
  endTime: number;
  layerId?: string;
}

export interface ComparisonTargetItem {
  id: string;
  text: string;
  anchorUnitIds: string[];
  /** 译文独立语段 id：有则纵向对照按语段分项编辑并写回该段 | Translation segment id for per-segment comparison rows */
  translationSegmentId?: string;
}

export interface ComparisonGroup {
  id: string;
  startTime: number;
  endTime: number;
  sourceItems: ComparisonSourceItem[];
  targetItems: ComparisonTargetItem[];
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
export function listTranslationSegmentsForComparisonSourceUnit(
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
    if (byParentField.length > 0) {
      return [...byParentField].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
    }
    return listSegmentsOverlappingTimeRange(
      translationSegments,
      parent.startTime,
      parent.endTime,
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

type ComparisonGroupBuild = Omit<ComparisonGroup, 'isMultiAnchorGroup'> & {
  targetSignature: string;
  speakerLabels: string[];
};

interface BuildComparisonGroupsInput {
  units: LayerUnitDocType[];
  /** 可选：仅把这些层视为左列原文来源，避免把翻译层单位误并入原文列 */
  sourceLayerIds?: readonly string[];
  getSourceText: (unit: LayerUnitDocType) => string;
  getTargetText: (unit: LayerUnitDocType) => string;
  /**
   * 若返回非空数组则替代 getTargetText 拆行结果（用于译文按 segment 分项） |
   * When non-empty, replaces newline-split target items (e.g. one row per translation segment).
   */
  getTargetItems?: (unit: LayerUnitDocType) => ComparisonTargetItem[] | undefined;
  getSpeakerLabel?: (unit: LayerUnitDocType) => string;
  /**
   * 相邻源单位可合并的最大时间间隔（秒）。传入负数（如 -1）则永不按相邻规则合并，
   * 用于语段化转写与媒体轨「一语段一译文行」对齐。
   */
  maxMergeGapSec?: number;
}

function resolveComparisonBundleRootId(unit: LayerUnitDocType): string | undefined {
  const bundleRootId = typeof unit.rootUnitId === 'string' && unit.rootUnitId.trim().length > 0
    ? unit.rootUnitId.trim()
    : undefined;
  return bundleRootId;
}

function resolveComparisonSpeakerLabel(unit: LayerUnitDocType, preferredLabel?: string): string {
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

function buildComparisonSpeakerSummary(labels: string[]): string {
  const uniqueLabels = Array.from(new Set(labels.filter((label) => label.length > 0)));
  if (uniqueLabels.length === 0) return '';
  if (uniqueLabels.length <= 2) return uniqueLabels.join(' · ');
  return `${uniqueLabels[0]} +${uniqueLabels.length - 1}`;
}

/** 与 buildComparisonGroups 内联逻辑一致：供对照视图按层从纯文本拆出多条译文编辑项 */
export function buildComparisonTargetItemsFromRawText(unitId: string, rawText: string): ComparisonTargetItem[] {
  return buildComparisonTargetItems(unitId, rawText);
}

function buildComparisonTargetItems(unitId: string, rawText: string): ComparisonTargetItem[] {
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

function buildComparisonTargetSignature(targetItems: ComparisonTargetItem[]): string {
  return targetItems
    .map((item) => item.text.trim().toLocaleLowerCase())
    .join('\n');
}

/**
 * 构建左右对照分组 | Build lightweight side-by-side comparison groups
 */
export function buildComparisonGroups(input: BuildComparisonGroupsInput): ComparisonGroup[] {
  const maxMergeGapSec = typeof input.maxMergeGapSec === 'number' ? input.maxMergeGapSec : 0.12;
  const sourceLayerIdSet = new Set(
    (input.sourceLayerIds ?? [])
      .map((layerId) => layerId.trim())
      .filter((layerId) => layerId.length > 0),
  );
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
    .sort((left, right) => left.startTime - right.startTime || left.endTime - right.endTime || left.id.localeCompare(right.id));
  const groups: ComparisonGroupBuild[] = [];

  for (const unit of orderedUnits) {
    const sourceText = normalizeSingleLine(input.getSourceText(unit) ?? '');
    const explicitTargetItems = input.getTargetItems?.(unit);
    const targetItems = explicitTargetItems != null && explicitTargetItems.length > 0
      ? explicitTargetItems
      : buildComparisonTargetItems(unit.id, input.getTargetText(unit) ?? '');
    const targetSignature = buildComparisonTargetSignature(targetItems);
    const speakerLabel = resolveComparisonSpeakerLabel(unit, input.getSpeakerLabel?.(unit));
    const bundleRootId = resolveComparisonBundleRootId(unit);
    const previous = groups[groups.length - 1];
    const sameBundle = previous?.bundleRootId === bundleRootId;
    const sameResolvedTarget = previous?.targetSignature === targetSignature;
    const canMerge = Boolean(
      previous
      && unit.startTime - previous.endTime <= maxMergeGapSec
      && (
        (sameResolvedTarget && targetSignature.length > 0)
        || (sameBundle && bundleRootId !== undefined && targetSignature.length === 0 && previous.targetSignature.length === 0)
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
        previous.speakerSummary = buildComparisonSpeakerSummary(previous.speakerLabels);
      }
      for (const targetItem of previous.targetItems) {
        targetItem.anchorUnitIds.push(unit.id);
      }
      continue;
    }

    groups.push({
      id: `cmp-${unit.id}`,
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
      speakerSummary: buildComparisonSpeakerSummary(speakerLabel.length > 0 ? [speakerLabel] : []),
      primaryAnchorUnitId: unit.id,
      ...(typeof unit.layerId === 'string' && unit.layerId.length > 0 ? { primaryAnchorLayerId: unit.layerId } : {}),
      editingTargetPolicy: targetItems.length > 1 ? 'multi-target-items' : 'group-target',
      targetSignature,
      speakerLabels: speakerLabel.length > 0 ? [speakerLabel] : [],
    });
  }

  return groups.map(({ targetSignature: _targetSignature, speakerLabels: _speakerLabels, ...group }): ComparisonGroup => ({
    ...group,
    isMultiAnchorGroup: group.sourceItems.length > 1,
  }));
}
