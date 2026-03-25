import type { LayerLinkDocType, UtteranceTextDocType } from '../db';

// ─── 类型 | Types ────────────────────────────────────────────────

export type UtteranceTextWithoutLayerId = Omit<UtteranceTextDocType, 'layerId'>;

export interface LayerLinkEdge {
  transcriptionLayerKey: string;
  targetLayerId: string;
}

// ─── UtteranceText 层 ID 辅助 | UtteranceText layer helpers ─────

export function withUtteranceTextLayerId<T extends UtteranceTextWithoutLayerId>(
  doc: T,
  layer: string | { layerId: string },
): T & Pick<UtteranceTextDocType, 'layerId'> {
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