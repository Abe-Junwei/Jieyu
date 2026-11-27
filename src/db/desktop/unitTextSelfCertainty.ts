/** Per-layer human self-certainty on unit_texts (ADR-0144). */

export type UnitTextSelfCertainty = 'not_understood' | 'uncertain' | 'certain';

const RANK: Record<UnitTextSelfCertainty, number> = {
  not_understood: 0,
  uncertain: 1,
  certain: 2,
};

export function isUnitTextSelfCertainty(value: unknown): value is UnitTextSelfCertainty {
  return value === 'not_understood' || value === 'uncertain' || value === 'certain';
}

/** Missing or unmarked source → null; else the less certain of the two. */
export function mergeLayerSelfCertainty(
  left: string | null | undefined,
  right: string | null | undefined,
): UnitTextSelfCertainty | null {
  if (!isUnitTextSelfCertainty(left) || !isUnitTextSelfCertainty(right)) return null;
  return RANK[left] <= RANK[right] ? left : right;
}
