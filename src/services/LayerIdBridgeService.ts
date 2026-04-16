import type { LayerLinkDocType, LayerUnitContentDocType } from '../db';

// ─── 类型 | Types ────────────────────────────────────────────────

export type UnitTextWithoutLayerId = Omit<LayerUnitContentDocType, 'layerId'>;

export interface LayerLinkEdge {
  transcriptionLayerKey: string;
  targetLayerId: string;
}

// ─── UnitText 层 ID 辅助 | UnitText layer helpers ─────

export function withUnitTextLayerId<T extends UnitTextWithoutLayerId>(
  doc: T,
  layer: string | { layerId: string },
): T & Pick<LayerUnitContentDocType, 'layerId'> {
  return {
    ...doc,
    layerId: typeof layer === 'string' ? layer : layer.layerId,
  };
}

// ─── LayerLink 辅助 | LayerLink helpers ──────────────────────────

export function createLayerLink(params: {
  id: string;
  createdAt: string;
} & LayerLinkEdge): LayerLinkDocType {
  return {
    id: params.id,
    transcriptionLayerKey: params.transcriptionLayerKey,
    layerId: params.targetLayerId,
    linkType: 'free',
    isPreferred: false,
    createdAt: params.createdAt,
  } as LayerLinkDocType;
}