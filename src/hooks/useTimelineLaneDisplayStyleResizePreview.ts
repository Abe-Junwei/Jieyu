import { useCallback, useState } from 'react';
import type { LayerDisplaySettings, LayerDocType, OrthographyDocType } from '../db';
import { BASE_FONT_SIZE, computeFontSizeFromRenderPolicy, resolveOrthographyRenderPolicy } from '../utils/layerDisplayStyle';

export type TimelineLaneDisplayStyleControlLike = {
  orthographies: OrthographyDocType[];
  onUpdate: (layerId: string, patch: Partial<LayerDisplaySettings>) => void;
};

/**
 * 轨高拖拽过程中按 orthography 反推预览字号，松手后写回 displaySettings（TextOnly / MediaLanes 共用）。
 */
export function useTimelineLaneDisplayStyleResizePreview(
  allLayersOrdered: LayerDocType[],
  displayStyleControl: TimelineLaneDisplayStyleControlLike | undefined,
) {
  const [previewFontSizeByLayerId, setPreviewFontSizeByLayerId] = useState<Record<string, number>>({});

  const handleResizePreview = useCallback((layerId: string, previewHeight: number) => {
    if (!displayStyleControl) return;
    const layer = allLayersOrdered.find((candidate) => candidate.id === layerId);
    if (!layer) return;
    const renderPolicy = resolveOrthographyRenderPolicy(layer.languageId, displayStyleControl.orthographies, layer.orthographyId);
    const previewFontSize = computeFontSizeFromRenderPolicy(previewHeight, renderPolicy);
    setPreviewFontSizeByLayerId((prev) => (
      prev[layerId] === previewFontSize ? prev : { ...prev, [layerId]: previewFontSize }
    ));
  }, [allLayersOrdered, displayStyleControl]);

  const handleResizeEnd = useCallback((layerId: string, finalHeight: number) => {
    setPreviewFontSizeByLayerId((prev) => {
      if (!(layerId in prev)) return prev;
      const next = { ...prev };
      delete next[layerId];
      return next;
    });
    if (!displayStyleControl) return;
    const layer = allLayersOrdered.find((l) => l.id === layerId);
    if (!layer) return;
    const renderPolicy = resolveOrthographyRenderPolicy(layer.languageId, displayStyleControl.orthographies, layer.orthographyId);
    const newFontSize = computeFontSizeFromRenderPolicy(finalHeight, renderPolicy);
    const oldFontSize = layer.displaySettings?.fontSize ?? BASE_FONT_SIZE;
    if (Math.abs(newFontSize - oldFontSize) > 0.1) {
      displayStyleControl.onUpdate(layerId, { fontSize: newFontSize });
    }
  }, [allLayersOrdered, displayStyleControl]);

  return { previewFontSizeByLayerId, handleResizePreview, handleResizeEnd };
}
