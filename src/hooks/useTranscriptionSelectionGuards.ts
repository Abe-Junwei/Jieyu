import { useEffect } from 'react';
import type { LayerDocType } from '../db';

type Params = {
  selectedLayerId: string;
  setSelectedLayerId: (id: string) => void;
  layers: LayerDocType[];
  layerToDeleteId: string;
  setLayerToDeleteId: (id: string) => void;
  deletableLayers: LayerDocType[];
};

export function useTranscriptionSelectionGuards({
  selectedLayerId,
  setSelectedLayerId,
  layers,
  layerToDeleteId,
  setLayerToDeleteId,
  deletableLayers,
}: Params) {
  useEffect(() => {
    if (!selectedLayerId) return;
    const exists = layers.some((item) => item.id === selectedLayerId);
    if (!exists) {
      // 回退到任一可用层，避免在独立层场景把 selectedLayerId 清空 | Fallback to any existing layer to avoid clearing selection for independent-layer flows.
      setSelectedLayerId(layers[0]?.id ?? '');
    }
  }, [layers, selectedLayerId, setSelectedLayerId]);

  useEffect(() => {
    if (!layerToDeleteId) {
      setLayerToDeleteId(deletableLayers[0]?.id ?? '');
      return;
    }
    const exists = deletableLayers.some((item) => item.id === layerToDeleteId);
    if (!exists) {
      setLayerToDeleteId(deletableLayers[0]?.id ?? '');
    }
  }, [deletableLayers, layerToDeleteId, setLayerToDeleteId]);

}