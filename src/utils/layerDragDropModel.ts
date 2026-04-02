export interface LayerBundleRange {
  rootId: string;
  start: number;
  end: number;
}

export type LayerDragKind = 'root-bundle' | 'dependent';

export interface LayerDropIntent {
  draggedId: string;
  dragKind: LayerDragKind;
  sourceIndex: number;
  sourceSpan: number;
  previewIndex: number;
  commitIndex: number;
  boundaryProbeIndex: number;
  targetRootId: string | null;
}

interface BuildLayerDropIntentParams {
  draggedId: string;
  sourceIndex: number;
  sourceSpan: number;
  baseTargetIndex: number;
  rowCount: number;
  bundleRanges: readonly LayerBundleRange[];
  isRootBundleDrag: boolean;
}

export function buildLayerDropIntent(params: BuildLayerDropIntentParams): LayerDropIntent {
  const {
    draggedId,
    sourceIndex,
    sourceSpan,
    baseTargetIndex,
    rowCount,
    bundleRanges,
    isRootBundleDrag,
  } = params;

  const resolveCommitIndex = (targetRange?: LayerBundleRange): number => {
    if (!targetRange) return baseTargetIndex;
    if (sourceIndex < targetRange.start) return targetRange.end;
    if (sourceIndex >= targetRange.end) return targetRange.start;
    return baseTargetIndex;
  };

  if (isRootBundleDrag) {
    const boundaryProbeIndex = Math.max(0, Math.min(baseTargetIndex, Math.max(rowCount - 1, 0)));
    const targetRange = bundleRanges.find((range) => (
      boundaryProbeIndex >= range.start && boundaryProbeIndex < range.end && range.rootId !== draggedId
    ));
    return {
      draggedId,
      dragKind: 'root-bundle',
      sourceIndex,
      sourceSpan,
      previewIndex: targetRange ? targetRange.start : baseTargetIndex,
      commitIndex: resolveCommitIndex(targetRange),
      boundaryProbeIndex,
      targetRootId: targetRange?.rootId ?? null,
    };
  }

  const boundaryProbeIndex = baseTargetIndex <= 0
    ? 0
    : baseTargetIndex >= rowCount
      ? Math.max(0, rowCount - 1)
      : baseTargetIndex - 1;

  const targetRange = bundleRanges.find((range) => (
    boundaryProbeIndex >= range.start && boundaryProbeIndex < range.end
  ));

  return {
    draggedId,
    dragKind: 'dependent',
    sourceIndex,
    sourceSpan,
    previewIndex: targetRange ? targetRange.start : baseTargetIndex,
    commitIndex: resolveCommitIndex(targetRange),
    boundaryProbeIndex,
    targetRootId: targetRange?.rootId ?? null,
  };
}
