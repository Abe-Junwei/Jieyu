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

  if (isRootBundleDrag) {
    return {
      draggedId,
      dragKind: 'root-bundle',
      sourceIndex,
      sourceSpan,
      previewIndex: baseTargetIndex,
      boundaryProbeIndex: Math.max(0, Math.min(baseTargetIndex, Math.max(rowCount - 1, 0))),
      targetRootId: null,
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
    boundaryProbeIndex,
    targetRootId: targetRange?.rootId ?? null,
  };
}
