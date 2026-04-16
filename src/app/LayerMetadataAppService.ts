import type { LayerDocType } from '../db';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';

export interface ILayerMetadataAppService {
  updateLayer(layer: LayerDocType): Promise<void>;
}

const layerMetadataAppService: ILayerMetadataAppService = {
  async updateLayer(layer: LayerDocType): Promise<void> {
    await LayerTierUnifiedService.updateLayer(layer);
  },
};

export function getLayerMetadataAppService(): ILayerMetadataAppService {
  return layerMetadataAppService;
}