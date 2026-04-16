import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { getLayerMetadataAppService } from '../app/LayerMetadataAppService';
import type { LayerDocType } from '../types/transcriptionDomain.types';

type UpdateLayerMetadataInput = {
  dialect?: string;
  vernacular?: string;
  alias?: string;
};

type UseTranscriptionLayerMetadataControllerInput = {
  layers: LayerDocType[];
  overlayMetadataLayerId: string | null;
  setOverlayMetadataLayerId: Dispatch<SetStateAction<string | null>>;
  setLayerCreateMessage: Dispatch<SetStateAction<string>>;
  setLayers: Dispatch<SetStateAction<LayerDocType[]>>;
};

export function useTranscriptionLayerMetadataController(input: UseTranscriptionLayerMetadataControllerInput) {
  const layerMetadataAppService = getLayerMetadataAppService();
  const overlayMetadataLayer = useMemo(
    () => (input.overlayMetadataLayerId
      ? input.layers.find((layer) => layer.id === input.overlayMetadataLayerId) ?? null
      : null),
    [input.layers, input.overlayMetadataLayerId],
  );

  const handleOpenLayerMetadataFromOverlayMenu = useCallback((layerId: string) => {
    input.setOverlayMetadataLayerId(layerId);
  }, [input.setOverlayMetadataLayerId]);

  const updateLayerMetadata = useCallback(async (
    layerId: string,
    updates: UpdateLayerMetadataInput,
  ): Promise<boolean> => {
    const targetLayer = input.layers.find((layer) => layer.id === layerId);
    if (!targetLayer) return false;

    const nextDialect = (updates.dialect ?? '').trim();
    const nextVernacular = (updates.vernacular ?? '').trim();
    const nextAlias = (updates.alias ?? '').trim();
    const typeLabel = targetLayer.layerType === 'translation' ? '翻译' : '转写';
    const nextName = nextAlias ? `${typeLabel} · ${nextAlias}` : typeLabel;
    const updatedLayer = {
      ...targetLayer,
      name: {
        ...(targetLayer.name ?? {}),
        zho: nextName,
      },
      updatedAt: new Date().toISOString(),
    };

    if (nextDialect) {
      updatedLayer.dialect = nextDialect;
    } else {
      delete updatedLayer.dialect;
    }
    if (nextVernacular) {
      updatedLayer.vernacular = nextVernacular;
    } else {
      delete updatedLayer.vernacular;
    }

    try {
      await layerMetadataAppService.updateLayer(updatedLayer);
      input.setLayers((prev) => prev.map((layer) => (layer.id === updatedLayer.id ? updatedLayer : layer)));
      input.setLayerCreateMessage('');
      return true;
    } catch (error) {
      input.setLayerCreateMessage(error instanceof Error ? error.message : '更新层元信息失败');
      return false;
    }
  }, [input.layers, input.setLayerCreateMessage, input.setLayers, layerMetadataAppService]);

  return {
    overlayMetadataLayer,
    handleOpenLayerMetadataFromOverlayMenu,
    updateLayerMetadata,
  };
}
