import type { LayerDocType, LayerLinkDocType } from '../db';
import { layerTranscriptionTreeParentId } from '../db';
import { getLayerLabelParts } from '../utils/transcriptionFormatters';
import { readAnyMultiLangLabel } from '../utils/multiLangLabels';
import { buildTranscriptionIdByKeyMap, getPreferredHostTranscriptionLayerIdForTranslation } from '../utils/translationHostLinkQuery';

export type LayerOrderingMessageLevel = 'info' | 'warning' | 'error';

export type LayerOrderIssueCode = 'non-canonical-sort-order';

export interface LayerOrderIssue {
  layerId: string;
  code: LayerOrderIssueCode;
  message: string;
}

export interface LayerOrderRepair {
  layerId: string;
  code: LayerOrderIssueCode;
  message: string;
}

export interface LayerBundle {
  root: LayerDocType;
  transcriptionDependents: LayerDocType[];
  translationDependents: LayerDocType[];
  detached?: boolean;
}

/** 拖拽重排后需写入的 link 变更 | Link update produced by resolveLayerDrop */
export interface LayerDropLinkUpdate {
  layerId: string;
  hostTranscriptionLayerId: string;
  transcriptionLayerKey: string;
}

export interface ResolveLayerDropResult {
  layers: LayerDocType[];
  changed: boolean;
  /** 译文层宿主变更指令（调用方据此更新 layer_links）| Translation host link updates for the caller */
  linkUpdates?: LayerDropLinkUpdate[];
  message?: string;
  messageLevel?: LayerOrderingMessageLevel;
}

type LayerOrderLink = Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>;

function getEffectiveConstraint(layer: LayerDocType): NonNullable<LayerDocType['constraint']> {
  return layer.constraint ?? (layer.layerType === 'translation' ? 'symbolic_association' : 'independent_boundary');
}

function isIndependentTranscriptionRoot(layer: LayerDocType): boolean {
  return layer.layerType === 'transcription' && getEffectiveConstraint(layer) === 'independent_boundary';
}

function compareLayers(left: LayerDocType, right: LayerDocType): number {
  const leftSort = typeof left.sortOrder === 'number' ? left.sortOrder : Number.MAX_SAFE_INTEGER;
  const rightSort = typeof right.sortOrder === 'number' ? right.sortOrder : Number.MAX_SAFE_INTEGER;
  if (leftSort !== rightSort) return leftSort - rightSort;
  const createdAtDiff = left.createdAt.localeCompare(right.createdAt);
  if (createdAtDiff !== 0) return createdAtDiff;
  return left.id.localeCompare(right.id);
}

function flattenBundle(bundle: LayerBundle): LayerDocType[] {
  return [bundle.root, ...bundle.transcriptionDependents, ...bundle.translationDependents];
}

function cloneBundle(bundle: LayerBundle): LayerBundle {
  return {
    root: bundle.root,
    transcriptionDependents: [...bundle.transcriptionDependents],
    translationDependents: [...bundle.translationDependents],
    ...(bundle.detached ? { detached: true } : {}),
  };
}

function findBundleIndexContainingLayer(bundles: LayerBundle[], layerId: string): number {
  return bundles.findIndex((bundle) => flattenBundle(bundle).some((layer) => layer.id === layerId));
}

function canonicalizeFromBundles(bundles: LayerBundle[]): LayerDocType[] {
  return bundles
    .flatMap((bundle) => flattenBundle(bundle))
    .map((layer, index) => {
      if (layer.sortOrder === index) return layer;
      return { ...layer, sortOrder: index };
    });
}

function resolveBundleInsertIndex(bundles: LayerBundle[], targetIndex: number): number {
  if (bundles.length === 0) return 0;

  let cursor = 0;
  for (let index = 0; index < bundles.length; index += 1) {
    const bundleLength = flattenBundle(bundles[index]!).length;
    if (targetIndex <= cursor) return index;
    if (targetIndex < cursor + bundleLength) return index + 1;
    cursor += bundleLength;
  }

  return bundles.length;
}

function resolveTargetBundleIndex(bundles: LayerBundle[], targetIndex: number): number | null {
  const validBundleIndexes = bundles
    .map((bundle, index) => (isIndependentTranscriptionRoot(bundle.root) ? index : -1))
    .filter((index) => index >= 0);
  if (validBundleIndexes.length === 0) return null;

  const flattened = bundles.flatMap((bundle) => flattenBundle(bundle));
  if (targetIndex <= 0) return validBundleIndexes[0] ?? null;

  const targetLayer = flattened[Math.min(targetIndex, flattened.length - 1)];
  if (targetLayer) {
    const targetBundleIndex = findBundleIndexContainingLayer(bundles, targetLayer.id);
    if (targetBundleIndex >= 0) {
      const targetBundle = bundles[targetBundleIndex];
      if (targetBundle && isIndependentTranscriptionRoot(targetBundle.root)) {
        return targetBundleIndex;
      }
    }
  }

  for (let cursor = Math.min(targetIndex - 1, flattened.length - 1); cursor >= 0; cursor -= 1) {
    const candidateLayer = flattened[cursor];
    if (!candidateLayer) continue;
    const bundleIndex = findBundleIndexContainingLayer(bundles, candidateLayer.id);
    if (bundleIndex < 0) continue;
    const bundle = bundles[bundleIndex];
    if (bundle && isIndependentTranscriptionRoot(bundle.root)) {
      return bundleIndex;
    }
  }

  return validBundleIndexes[0] ?? null;
}

function describeLayer(layer: LayerDocType): string {
  const { type, lang, alias } = getLayerLabelParts(layer);
  if (alias) {
    return `${type}\u300c${alias}\u300d (${lang})`;
  }
  return `${type}\uff08${lang}\uff09`;
}

function getBundleRanges(bundles: LayerBundle[]): Array<{ start: number; end: number }> {
  let cursor = 0;
  return bundles.map((bundle) => {
    const start = cursor;
    cursor += flattenBundle(bundle).length;
    return { start, end: cursor };
  });
}

function findBundleIndexAtPosition(bundles: LayerBundle[], position: number): number | null {
  if (bundles.length === 0) return null;
  const ranges = getBundleRanges(bundles);
  const totalLength = ranges[ranges.length - 1]?.end ?? 0;
  if (totalLength <= 0) return null;
  const clamped = Math.max(0, Math.min(position, totalLength - 1));
  return ranges.findIndex((range) => clamped >= range.start && clamped < range.end);
}

function getBundleStartIndex(bundles: LayerBundle[], bundleIndex: number): number {
  let cursor = 0;
  for (let index = 0; index < bundleIndex; index += 1) {
    cursor += flattenBundle(bundles[index]!).length;
  }
  return cursor;
}

function countSiblingLayersBeforeTarget(
  bundles: LayerBundle[],
  bundleIndex: number,
  targetIndex: number,
  layerType: LayerDocType['layerType'],
): number {
  const bundle = bundles[bundleIndex];
  if (!bundle) return 0;

  const flattened = bundles.flatMap((entry) => flattenBundle(entry));
  const bundleStart = getBundleStartIndex(bundles, bundleIndex);
  const bundleEnd = bundleStart + flattenBundle(bundle).length;
  const clampedTarget = Math.max(bundleStart, Math.min(targetIndex, bundleEnd));
  return flattened
    .slice(bundleStart, clampedTarget)
    .filter((layer) => {
      if (layerType === 'translation') return layer.layerType === 'translation';
      return layer.layerType === 'transcription' && !isIndependentTranscriptionRoot(layer);
    })
    .length;
}

function sameFlattenedIds(left: LayerDocType[], right: LayerDocType[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((layer, index) => layer.id === right[index]?.id);
}

function resolvePreferredHostTranscriptionLayerId(
  translationLayerId: string,
  linksByTranslationLayerId: Map<string, LayerOrderLink[]>,
  transcriptionByKey: Map<string, LayerDocType>,
): string | undefined {
  const links = linksByTranslationLayerId.get(translationLayerId) ?? [];
  const transcriptionIdByKey = buildTranscriptionIdByKeyMap([...transcriptionByKey.values()]);
  return getPreferredHostTranscriptionLayerIdForTranslation(translationLayerId, links, transcriptionIdByKey);
}

export function buildLayerBundles(
  layers: LayerDocType[],
  layerLinks: ReadonlyArray<LayerOrderLink> = [],
): LayerBundle[] {
  const sortedLayers = [...layers].sort(compareLayers);
  const rootBundles = new Map<string, LayerBundle>();
  const detachedBundles: LayerBundle[] = [];
  const transcriptionByKey = new Map<string, LayerDocType>();
  const linksByTranslationLayerId = new Map<string, LayerOrderLink[]>();

  for (const layer of sortedLayers) {
    if (layer.layerType === 'transcription') {
      transcriptionByKey.set(layer.key, layer);
    }
  }

  for (const link of layerLinks) {
    const items = linksByTranslationLayerId.get(link.layerId) ?? [];
    items.push(link);
    linksByTranslationLayerId.set(link.layerId, items);
  }

  for (const layer of sortedLayers) {
    if (isIndependentTranscriptionRoot(layer)) {
      rootBundles.set(layer.id, {
        root: layer,
        transcriptionDependents: [],
        translationDependents: [],
      });
    }
  }

  for (const layer of sortedLayers) {
    if (isIndependentTranscriptionRoot(layer)) continue;
    const preferredHostTranscriptionLayerId = layer.layerType === 'translation'
      ? resolvePreferredHostTranscriptionLayerId(layer.id, linksByTranslationLayerId, transcriptionByKey)
      : undefined;
    const treeParentId = layerTranscriptionTreeParentId(layer);
    const parentBundle = layer.layerType === 'translation'
      ? (preferredHostTranscriptionLayerId ? rootBundles.get(preferredHostTranscriptionLayerId) : undefined)
      : (treeParentId ? rootBundles.get(treeParentId) : undefined);
    if (parentBundle && getEffectiveConstraint(layer) !== 'independent_boundary') {
      if (layer.layerType === 'translation') {
        parentBundle.translationDependents.push(layer);
      } else {
        parentBundle.transcriptionDependents.push(layer);
      }
      continue;
    }

    detachedBundles.push({
      root: layer,
      transcriptionDependents: [],
      translationDependents: [],
      detached: true,
    });
  }

  const orderedRootBundles = sortedLayers
    .filter((layer) => isIndependentTranscriptionRoot(layer))
    .map((layer) => rootBundles.get(layer.id))
    .filter((bundle): bundle is LayerBundle => Boolean(bundle));

  return [...orderedRootBundles, ...detachedBundles];
}

export function flattenLayerBundles(bundles: LayerBundle[]): LayerDocType[] {
  return bundles.flatMap((bundle) => flattenBundle(bundle));
}

export function resolveLayerDragGroup(
  layers: LayerDocType[],
  draggedLayerId: string,
  layerLinks: ReadonlyArray<LayerOrderLink> = [],
): string[] {
  const bundles = buildLayerBundles(layers, layerLinks);
  const sourceBundleIndex = findBundleIndexContainingLayer(bundles, draggedLayerId);
  if (sourceBundleIndex < 0) {
    return [draggedLayerId];
  }

  const sourceBundle = bundles[sourceBundleIndex]!;
  const draggedIsIndependentRoot = sourceBundle.root.id === draggedLayerId
    && !sourceBundle.detached
    && isIndependentTranscriptionRoot(sourceBundle.root);

  if (!draggedIsIndependentRoot) {
    return [draggedLayerId];
  }

  return flattenBundle(sourceBundle).map((layer) => layer.id);
}

export function computeCanonicalLayerOrder(
  layers: LayerDocType[],
  layerLinks: ReadonlyArray<LayerOrderLink> = [],
): LayerDocType[] {
  return canonicalizeFromBundles(buildLayerBundles(layers, layerLinks));
}

export function validateLayerOrder(
  layers: LayerDocType[],
  layerLinks: ReadonlyArray<LayerOrderLink> = [],
): LayerOrderIssue[] {
  const currentOrdered = [...layers].sort(compareLayers);
  const canonicalOrdered = computeCanonicalLayerOrder(layers, layerLinks);
  const expectedIndexById = new Map(canonicalOrdered.map((layer, index) => [layer.id, index] as const));

  return currentOrdered.flatMap((layer, actualIndex) => {
    const expectedIndex = expectedIndexById.get(layer.id);
    if (expectedIndex === undefined || expectedIndex === actualIndex) {
      return [];
    }
    return [{
      layerId: layer.id,
      code: 'non-canonical-sort-order' as const,
      message: `Layer ${readAnyMultiLangLabel(layer.name) ?? layer.key} is currently at position ${actualIndex + 1}; expected position ${expectedIndex + 1}.`,
    }];
  });
}

export function repairLayerOrder(
  layers: LayerDocType[],
  layerLinks: ReadonlyArray<LayerOrderLink> = [],
): { layers: LayerDocType[]; repairs: LayerOrderRepair[] } {
  const currentById = new Map(layers.map((layer) => [layer.id, layer] as const));
  const repairedLayers = computeCanonicalLayerOrder(layers, layerLinks);
  const repairs = repairedLayers.flatMap((layer, index) => {
    const previous = currentById.get(layer.id);
    if (!previous || (previous.sortOrder ?? index) === index) {
      return [];
    }
    return [{
      layerId: layer.id,
      code: 'non-canonical-sort-order' as const,
      message: `Moved layer ${readAnyMultiLangLabel(layer.name) ?? layer.key} to position ${index + 1}.`,
    }];
  });

  return {
    layers: repairedLayers,
    repairs,
  };
}

export function resolveLayerDrop(
  layers: LayerDocType[],
  draggedLayerId: string,
  targetIndex: number,
  layerLinks: ReadonlyArray<LayerOrderLink> = [],
): ResolveLayerDropResult {
  const bundles = buildLayerBundles(layers, layerLinks);
  const flattened = flattenLayerBundles(bundles);
  const layerById = new Map(layers.map((layer) => [layer.id, layer] as const));
  const transcriptionByKey = new Map(
    layers
      .filter((layer) => layer.layerType === 'transcription')
      .map((layer) => [layer.key, layer] as const),
  );
  const linksByTranslationLayerId = new Map<string, LayerOrderLink[]>();
  for (const link of layerLinks) {
    const items = linksByTranslationLayerId.get(link.layerId) ?? [];
    items.push(link);
    linksByTranslationLayerId.set(link.layerId, items);
  }
  const currentIndex = flattened.findIndex((layer) => layer.id === draggedLayerId);
  if (currentIndex < 0) {
    return { layers, changed: false };
  }

  const sourceBundleIndex = findBundleIndexContainingLayer(bundles, draggedLayerId);
  if (sourceBundleIndex < 0) {
    return { layers, changed: false };
  }

  const sourceBundle = cloneBundle(bundles[sourceBundleIndex]!);
  const draggedLayer = flattened[currentIndex]!;
  const draggedIsIndependentRoot = sourceBundle.root.id === draggedLayerId && isIndependentTranscriptionRoot(sourceBundle.root);
  const removedItemCount = draggedIsIndependentRoot ? flattenBundle(sourceBundle).length : 1;
  const normalizedTargetIndex = Math.max(0, Math.min(targetIndex, flattened.length));
  const adjustedTargetIndex = normalizedTargetIndex > currentIndex
    ? Math.max(0, normalizedTargetIndex - removedItemCount)
    : normalizedTargetIndex;

  if (draggedIsIndependentRoot) {
    const sourceRange = getBundleRanges(bundles)[sourceBundleIndex]!;
    const remainingBundles = bundles.filter((_, index) => index !== sourceBundleIndex).map(cloneBundle);
    let insertIndex = resolveBundleInsertIndex(remainingBundles, adjustedTargetIndex);

    if (!(normalizedTargetIndex > sourceRange.start && normalizedTargetIndex < sourceRange.end)) {
      if (normalizedTargetIndex >= sourceRange.end) {
        if (normalizedTargetIndex >= flattened.length) {
          insertIndex = remainingBundles.length;
        } else {
          const targetBundleIndex = findBundleIndexAtPosition(bundles, normalizedTargetIndex);
          insertIndex = targetBundleIndex == null ? remainingBundles.length : targetBundleIndex;
        }
      } else {
        const targetBundleIndex = findBundleIndexAtPosition(bundles, Math.max(0, normalizedTargetIndex));
        insertIndex = targetBundleIndex == null ? 0 : targetBundleIndex;
      }
    }

    const nextBundles = [...remainingBundles];
    nextBundles.splice(insertIndex, 0, sourceBundle);
    const nextLayers = canonicalizeFromBundles(nextBundles);
    return {
      layers: nextLayers,
      changed: !sameFlattenedIds(nextLayers, flattened),
    };
  }

  const remainingBundles = bundles.map(cloneBundle);
  const nextSourceBundle = remainingBundles[sourceBundleIndex]!;
  if (draggedLayer.layerType === 'translation') {
    nextSourceBundle.translationDependents = nextSourceBundle.translationDependents.filter((layer) => layer.id !== draggedLayerId);
  } else {
    nextSourceBundle.transcriptionDependents = nextSourceBundle.transcriptionDependents.filter((layer) => layer.id !== draggedLayerId);
  }

  const filteredBundles = remainingBundles.filter((bundle) => {
    if (!bundle.detached) return true;
    return bundle.root.id !== draggedLayerId;
  });

  const isMovingDownward = normalizedTargetIndex > currentIndex;
  const bundleProbeOrderedIndex = (() => {
    if (!isMovingDownward) return normalizedTargetIndex;
    if (normalizedTargetIndex > currentIndex + 1) return normalizedTargetIndex - 1;
    return normalizedTargetIndex;
  })();
  const clampedBundleProbeOrderedIndex = Math.max(
    0,
    Math.min(bundleProbeOrderedIndex, Math.max(flattened.length - 1, 0)),
  );
  const bundleAnchorLayer = flattened[clampedBundleProbeOrderedIndex];
  const anchorBundleIndex = bundleAnchorLayer
    ? findBundleIndexContainingLayer(filteredBundles, bundleAnchorLayer.id)
    : -1;
  const targetBundleIndex = anchorBundleIndex >= 0
    ? anchorBundleIndex
    : resolveTargetBundleIndex(filteredBundles, adjustedTargetIndex);
  if (targetBundleIndex == null) {
    return {
      layers,
      changed: false,
      message: `\u65e0\u6cd5\u653e\u7f6e${describeLayer(draggedLayer)}\uff1a\u76ee\u6807\u533a\u57df\u6ca1\u6709\u5408\u6cd5\u7684\u72ec\u7acb\u8f6c\u5199\u5c42\u3002`,
      messageLevel: 'error',
    };
  }

  const targetBundle = filteredBundles[targetBundleIndex]!;
  const nextParentLayerId = targetBundle.root.id;
  const previousHostTranscriptionLayerId = draggedLayer.layerType === 'translation'
    ? resolvePreferredHostTranscriptionLayerId(draggedLayer.id, linksByTranslationLayerId, transcriptionByKey)
    : layerTranscriptionTreeParentId(draggedLayer);
  const reparented = (previousHostTranscriptionLayerId ?? '') !== nextParentLayerId;
  // 译文层宿主关系由 layer_links 承载，不再写 parentLayerId | Translation host lives in layer_links, skip parentLayerId mutation
  const movedLayer = reparented && draggedLayer.layerType !== 'translation'
    ? { ...draggedLayer, parentLayerId: nextParentLayerId }
    : draggedLayer;

  const siblingInsertIndex = countSiblingLayersBeforeTarget(
    filteredBundles,
    targetBundleIndex,
    adjustedTargetIndex,
    draggedLayer.layerType,
  );

  if (draggedLayer.layerType === 'translation') {
    targetBundle.translationDependents.splice(siblingInsertIndex, 0, movedLayer);
  } else {
    targetBundle.transcriptionDependents.splice(siblingInsertIndex, 0, movedLayer);
  }

  const nextLayers = canonicalizeFromBundles(filteredBundles);
  const previousParent = previousHostTranscriptionLayerId ? layerById.get(previousHostTranscriptionLayerId) : undefined;

  // 译文层重新归属时返回 linkUpdates | Return linkUpdates when a translation layer is reparented
  const linkUpdates: LayerDropLinkUpdate[] | undefined = reparented && draggedLayer.layerType === 'translation'
    ? [{ layerId: draggedLayer.id, hostTranscriptionLayerId: nextParentLayerId, transcriptionLayerKey: targetBundle.root.key }]
    : undefined;

  return {
    layers: nextLayers,
    changed: reparented || !sameFlattenedIds(nextLayers, flattened),
    ...(linkUpdates ? { linkUpdates } : {}),
    ...(reparented
      ? {
          message: previousParent
            ? `\u5df2\u5c06${describeLayer(draggedLayer)}\u4ece ${describeLayer(previousParent)} \u6539\u4e3a\u4f9d\u8d56 ${describeLayer(targetBundle.root)}\u3002`
            : `\u5df2\u5c06${describeLayer(draggedLayer)}\u6539\u4e3a\u4f9d\u8d56 ${describeLayer(targetBundle.root)}\u3002`,
          messageLevel: 'warning' as const,
        }
      : {}),
  };
}
