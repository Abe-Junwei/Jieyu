export type SelectionState = {
  primaryId: string;
  ids: Set<string>;
};

export type TimingUndoState = {
  utteranceId: string;
  atMs: number;
};

export function normalizeSelection(primaryId: string, ids: Iterable<string>): SelectionState {
  const nextIds = new Set(ids);
  if (nextIds.size === 0) {
    return { primaryId: '', ids: nextIds };
  }

  if (primaryId && nextIds.has(primaryId)) {
    return { primaryId, ids: nextIds };
  }

  const fallback = nextIds.values().next().value as string | undefined;
  return { primaryId: fallback ?? '', ids: nextIds };
}

export function shouldPushTimingUndo(
  previous: TimingUndoState | null,
  utteranceId: string,
  nowMs: number,
  windowMs = 500,
): { shouldPush: boolean; next: TimingUndoState } {
  const shouldPush = !previous
    || previous.utteranceId !== utteranceId
    || nowMs - previous.atMs > windowMs;

  return {
    shouldPush,
    next: { utteranceId, atMs: nowMs },
  };
}
