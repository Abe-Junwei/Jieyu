export type TimeSpan = {
  id: string;
  startTime: number;
  endTime: number;
};

export type LassoOutcome = {
  ids: Set<string>;
  hitCount: number;
  mode: 'select' | 'create';
  primaryId: string;
};

/**
 * Resolve drag-lasso selection result from a time window.
 * Overlap rule: unit.endTime > tStart && unit.startTime < tEnd
 */
export function computeLassoOutcome(
  units: TimeSpan[],
  tStart: number,
  tEnd: number,
  baseIds: Set<string>,
  preferBasePrimary = false,
): LassoOutcome {
  const lo = Math.min(tStart, tEnd);
  const hi = Math.max(tStart, tEnd);

  const ids = new Set(baseIds);
  const hits: string[] = [];
  for (const utt of units) {
    if (utt.endTime > lo && utt.startTime < hi) {
      ids.add(utt.id);
      hits.push(utt.id);
    }
  }

  const hitCount = hits.length;
  const mode: 'select' | 'create' = hitCount > 0 ? 'select' : 'create';

  let primaryId = '';
  if (hitCount > 0) {
    if (preferBasePrimary) {
      const firstNewHit = hits.find((id) => !baseIds.has(id));
      primaryId = firstNewHit ?? '';
    } else {
      primaryId = hits[0] ?? '';
    }
  }

  return { ids, hitCount, mode, primaryId };
}
