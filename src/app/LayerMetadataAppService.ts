import type { LayerDocType } from '../db';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
import {
  applyLayerMetadataUpdate,
  type ApplyLayerMetadataUpdateInput,
} from '../services/LayerMetadataUpdateService';

export interface ILayerMetadataAppService {
  updateLayer(layer: LayerDocType): Promise<void>;
  /** 层、链接、层定义一个事务写入（JY-18）| Layer, links and tier in one transaction (JY-18) */
  applyMetadataUpdate(input: ApplyLayerMetadataUpdateInput): Promise<void>;
}

const layerMetadataAppService: ILayerMetadataAppService = {
  async updateLayer(layer: LayerDocType): Promise<void> {
    await LayerTierUnifiedService.updateLayer(layer);
  },
  async applyMetadataUpdate(input: ApplyLayerMetadataUpdateInput): Promise<void> {
    await applyLayerMetadataUpdate(input);
  },
};

export function getLayerMetadataAppService(): ILayerMetadataAppService {
  return layerMetadataAppService;
}
