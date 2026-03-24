import { useCallback, useState } from 'react';
import type { TranslationLayerDocType } from '../db';
import { formatLayerRailLabel } from '../utils/transcriptionFormatters';
import { useLayerRailContextOrFallback } from '../contexts/LayerRailContext';

export type LayerDeleteConfirmState = {
  layerId: string;
  layerName: string;
  layerType: 'transcription' | 'translation';
  textCount: number;
} | null;

type UseLayerDeleteConfirmInput = {
  deletableLayers?: TranslationLayerDocType[];
  checkLayerHasContent?: (layerId: string) => Promise<number>;
  deleteLayer?: (layerId: string, options?: { keepUtterances?: boolean }) => Promise<void>;
  deleteLayerWithoutConfirm?: (layerId: string) => Promise<void>;
};

export function useLayerDeleteConfirm({
  deletableLayers: deletableLayersProp,
  checkLayerHasContent: checkLayerHasContentProp,
  deleteLayer: deleteLayerProp,
  deleteLayerWithoutConfirm: deleteLayerWithoutConfirmProp,
}: UseLayerDeleteConfirmInput = {}) {
  const shouldUseContext = (
    deletableLayersProp === undefined
    || checkLayerHasContentProp === undefined
    || deleteLayerProp === undefined
    || deleteLayerWithoutConfirmProp === undefined
  );
  const ctx = useLayerRailContextOrFallback({ warnOnMissing: shouldUseContext });
  const deletableLayers = deletableLayersProp ?? ctx.deletableLayers;
  const checkLayerHasContent = checkLayerHasContentProp ?? ctx.checkLayerHasContent;
  const deleteLayer = deleteLayerProp ?? ctx.deleteLayer;
  const deleteLayerWithoutConfirm = deleteLayerWithoutConfirmProp ?? ctx.deleteLayerWithoutConfirm;
  const [deleteLayerConfirm, setDeleteLayerConfirm] = useState<LayerDeleteConfirmState>(null);
  const [deleteConfirmKeepUtterances, setDeleteConfirmKeepUtterances] = useState(false);

  const requestDeleteLayer = useCallback(async (layerId: string) => {
    const layer = deletableLayers.find((item) => item.id === layerId);
    if (!layer) return;
    const textCount = await checkLayerHasContent(layerId);
    if (textCount === 0) {
      await deleteLayerWithoutConfirm(layerId);
      return;
    }
    setDeleteConfirmKeepUtterances(false);
    setDeleteLayerConfirm({
      layerId,
      layerName: formatLayerRailLabel(layer),
      layerType: layer.layerType,
      textCount,
    });
  }, [checkLayerHasContent, deleteLayerWithoutConfirm, deletableLayers]);

  const cancelDeleteLayerConfirm = useCallback(() => {
    setDeleteLayerConfirm(null);
    setDeleteConfirmKeepUtterances(false);
  }, []);

  const confirmDeleteLayer = useCallback(async () => {
    if (!deleteLayerConfirm) return;
    await deleteLayer(deleteLayerConfirm.layerId, { keepUtterances: deleteConfirmKeepUtterances });
    setDeleteLayerConfirm(null);
    setDeleteConfirmKeepUtterances(false);
  }, [deleteConfirmKeepUtterances, deleteLayer, deleteLayerConfirm]);

  return {
    deleteLayerConfirm,
    deleteConfirmKeepUtterances,
    setDeleteConfirmKeepUtterances,
    requestDeleteLayer,
    cancelDeleteLayerConfirm,
    confirmDeleteLayer,
  };
}
