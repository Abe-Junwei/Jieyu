import { useCallback, useRef, useState } from 'react';
import type { LayerDocType } from '../db';
import { t, useLocale } from '../i18n';
import { formatSidePaneLayerLabel } from '../utils/transcriptionFormatters';
import { useSidePaneLayerContextOrFallback } from '../contexts/SidePaneContext';

export type LayerDeleteConfirmState = {
  layerId: string;
  layerName: string;
  layerType: 'transcription' | 'translation';
  textCount: number;
  warningMessage?: string;
} | null;

type UseLayerDeleteConfirmInput = {
  deletableLayers?: LayerDocType[];
  checkLayerHasContent?: (layerId: string) => Promise<number>;
  deleteLayer?: (layerId: string, options?: { keepUnits?: boolean }) => Promise<void>;
  deleteLayerWithoutConfirm?: (layerId: string) => Promise<void>;
};

export function useLayerDeleteConfirm({
  deletableLayers: deletableLayersProp,
  checkLayerHasContent: checkLayerHasContentProp,
  deleteLayer: deleteLayerProp,
  deleteLayerWithoutConfirm: deleteLayerWithoutConfirmProp,
}: UseLayerDeleteConfirmInput = {}) {
  const locale = useLocale();
  const shouldUseContext = (
    deletableLayersProp === undefined
    || checkLayerHasContentProp === undefined
    || deleteLayerProp === undefined
    || deleteLayerWithoutConfirmProp === undefined
  );
  const ctx = useSidePaneLayerContextOrFallback({ warnOnMissing: shouldUseContext });
  const deletableLayers = deletableLayersProp ?? ctx.deletableLayers;
  const checkLayerHasContent = checkLayerHasContentProp ?? ctx.checkLayerHasContent;
  const deleteLayer = deleteLayerProp ?? ctx.deleteLayer;
  const deleteLayerWithoutConfirm = deleteLayerWithoutConfirmProp ?? ctx.deleteLayerWithoutConfirm;
  const [deleteLayerConfirm, setDeleteLayerConfirm] = useState<LayerDeleteConfirmState>(null);
  const [deleteConfirmKeepUnits, setDeleteConfirmKeepUnits] = useState(false);
  const deleteLayerFlowVersionRef = useRef(0);

  const requestDeleteLayer = useCallback(async (layerId: string) => {
    const layer = deletableLayers.find((item) => item.id === layerId);
    if (!layer) return;

    const requestVersion = deleteLayerFlowVersionRef.current + 1;
    deleteLayerFlowVersionRef.current = requestVersion;

    const transcriptionCount = deletableLayers.filter((item) => item.layerType === 'transcription').length;
    const translationCount = deletableLayers.filter((item) => item.layerType === 'translation').length;
    const deletingLastTranscriptionWithTranslations =
      layer.layerType === 'transcription' && transcriptionCount <= 1 && translationCount > 0;

    const warningMessage = deletingLastTranscriptionWithTranslations
      ? t(locale, 'transcription.dialog.deleteLayerLastTranscriptionCascadeWarning')
      : undefined;

    const textCount = await checkLayerHasContent(layerId);
    if (deleteLayerFlowVersionRef.current !== requestVersion) return;

    if (textCount === 0 && !warningMessage) {
      await deleteLayerWithoutConfirm(layerId);
      return;
    }

    setDeleteConfirmKeepUnits(false);
    setDeleteLayerConfirm({
      layerId,
      layerName: formatSidePaneLayerLabel(layer),
      layerType: layer.layerType,
      textCount,
      ...(warningMessage ? { warningMessage } : {}),
    });
  }, [checkLayerHasContent, deleteLayerWithoutConfirm, deletableLayers, locale]);

  const cancelDeleteLayerConfirm = useCallback(() => {
    deleteLayerFlowVersionRef.current += 1;
    setDeleteLayerConfirm(null);
    setDeleteConfirmKeepUnits(false);
  }, []);

  const confirmDeleteLayer = useCallback(async () => {
    if (!deleteLayerConfirm) return;

    const confirmVersion = deleteLayerFlowVersionRef.current;
    const { layerId } = deleteLayerConfirm;
    const keepUnits = deleteConfirmKeepUnits;

    await deleteLayer(layerId, { keepUnits });
    if (deleteLayerFlowVersionRef.current !== confirmVersion) return;

    deleteLayerFlowVersionRef.current += 1;
    setDeleteLayerConfirm(null);
    setDeleteConfirmKeepUnits(false);
  }, [deleteConfirmKeepUnits, deleteLayer, deleteLayerConfirm]);

  return {
    deleteLayerConfirm,
    deleteConfirmKeepUnits,
    setDeleteConfirmKeepUnits,
    requestDeleteLayer,
    cancelDeleteLayerConfirm,
    confirmDeleteLayer,
  };
}
