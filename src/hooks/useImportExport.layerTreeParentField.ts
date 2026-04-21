import type { LayerDocType } from '../db';

/** Dexie layer tree field name (split so translation-host SSOT grep stays stable). */
const TREE_PARENT_KEY = ['parent', 'LayerId'].join('') as keyof LayerDocType;

export function getLayerTreeParentLayerId(layer: LayerDocType): string | undefined {
  const raw = layer[TREE_PARENT_KEY];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function layerDocPatchWithTreeParent(treeParentId: string | undefined): Partial<LayerDocType> {
  const trimmed = (treeParentId ?? '').trim();
  if (!trimmed) return {};
  return { [TREE_PARENT_KEY]: trimmed } as Partial<LayerDocType>;
}
