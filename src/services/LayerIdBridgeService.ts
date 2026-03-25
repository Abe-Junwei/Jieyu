import type { LayerLinkDocType, UtteranceTextDocType } from '../db';

export const LEGACY_LAYER_ID_FIELD = 'tierId' as const;

export type UtteranceTextWithoutLayerId = Omit<UtteranceTextDocType, typeof LEGACY_LAYER_ID_FIELD>;

type LegacyUtteranceTextLayerRef = Pick<UtteranceTextDocType, typeof LEGACY_LAYER_ID_FIELD>;
type LegacyLayerLinkTargetRef = Pick<LayerLinkDocType, typeof LEGACY_LAYER_ID_FIELD>;
type LegacyLayerLinkRef = Pick<LayerLinkDocType, 'transcriptionLayerKey' | typeof LEGACY_LAYER_ID_FIELD>;

export interface LayerIdRef {
  layerId: string;
}

export interface LayerLinkEdge {
  transcriptionLayerKey: string;
  targetLayerId: string;
}

function resolveLayerId(ref: LegacyUtteranceTextLayerRef | LayerIdRef): string {
  return 'layerId' in ref ? ref.layerId : ref.tierId;
}

function resolveTargetLayerId(ref: LegacyLayerLinkTargetRef | LayerLinkEdge): string {
  return 'targetLayerId' in ref ? ref.targetLayerId : ref.tierId;
}

export function getUtteranceTextLayerId(doc: LegacyUtteranceTextLayerRef | LayerIdRef): string {
  return resolveLayerId(doc);
}

export function matchesUtteranceTextLayer(
  doc: LegacyUtteranceTextLayerRef | LayerIdRef,
  layerId: string,
): boolean {
  return getUtteranceTextLayerId(doc) === layerId;
}

export function withUtteranceTextLayerId<T extends UtteranceTextWithoutLayerId>(
  doc: T,
  layer: string | LayerIdRef,
): T & Pick<UtteranceTextDocType, typeof LEGACY_LAYER_ID_FIELD> {
  return {
    ...doc,
    tierId: typeof layer === 'string' ? layer : layer.layerId,
  };
}

export function toLayerLinkEdge(doc: LegacyLayerLinkRef | LayerLinkEdge): LayerLinkEdge {
  if ('targetLayerId' in doc) {
    return {
      transcriptionLayerKey: doc.transcriptionLayerKey,
      targetLayerId: doc.targetLayerId,
    };
  }
  return {
    transcriptionLayerKey: doc.transcriptionLayerKey,
    targetLayerId: doc.tierId,
  };
}

export function getLayerLinkTargetLayerId(doc: LegacyLayerLinkTargetRef | LayerLinkEdge): string {
  return resolveTargetLayerId(doc);
}

export function matchesLayerLink(
  doc: LegacyLayerLinkRef | LayerLinkEdge,
  transcriptionLayerKey: string,
  targetLayerId: string,
): boolean {
  const edge = toLayerLinkEdge(doc);
  return edge.transcriptionLayerKey === transcriptionLayerKey && edge.targetLayerId === targetLayerId;
}

export function createLayerLink(params: {
  id: string;
  createdAt: string;
} & LayerLinkEdge): LayerLinkDocType {
  return {
    id: params.id,
    transcriptionLayerKey: params.transcriptionLayerKey,
    tierId: params.targetLayerId,
    linkType: 'free',
    isPreferred: false,
    createdAt: params.createdAt,
  } as LayerLinkDocType;
}