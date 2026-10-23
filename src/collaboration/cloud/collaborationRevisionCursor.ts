/**
 * Contiguous inbound revision cursor (#361).
 * Higher revisions can be remembered in `pendingHigher` but the committed
 * cursor only advances through an unbroken sequence.
 */

export function normalizeProjectRevision(revision: number): number | null {
  if (!Number.isFinite(revision)) return null;
  return Math.max(0, Math.floor(revision));
}

/**
 * Record that `appliedRevision` was successfully applied. Advance `committed`
 * while `committed+1` is in the pending set (including the new revision).
 */
export function advanceContiguousRevision(
  committed: number,
  pendingHigher: Set<number>,
  appliedRevision: number,
): { committed: number; didAdvance: boolean } {
  const rev = normalizeProjectRevision(appliedRevision);
  if (rev === null) return { committed, didAdvance: false };
  if (rev <= committed) return { committed, didAdvance: false };

  pendingHigher.add(rev);
  let next = committed;
  while (pendingHigher.has(next + 1)) {
    next += 1;
    pendingHigher.delete(next);
  }
  return { committed: next, didAdvance: next !== committed };
}

/** Force the committed cursor to at least `revision` (outbound / hydration). */
export function forceRevisionCursor(committed: number, revision: number): number {
  const rev = normalizeProjectRevision(revision);
  if (rev === null) return committed;
  return Math.max(committed, rev);
}
