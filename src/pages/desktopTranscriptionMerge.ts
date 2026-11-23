export interface MergeUnit {
  id: string;
  startMs: number;
  endMs: number;
  speakerId: string | null;
}

export interface MergeSourceUnit {
  id: string;
  startMs: number | null;
  endMs: number | null;
  speakerId: string | null;
}

/** Memory input, then a saved draft, then the official body. */
export function mergeBody(
  layerId: string | null,
  unitId: string,
  draft: { unitId: string; text: string } | null,
  units: readonly { id: string; text: string; draftText?: string | null }[] | undefined,
  keyOf: (layerId: string, unitId: string) => string,
): string {
  if (layerId === null) return '';
  if (draft?.unitId === keyOf(layerId, unitId)) return draft.text;
  const row = units?.find((unit) => unit.id === unitId);
  if (row?.draftText != null) return row.draftText;
  return row?.text ?? '';
}

export function timedUnits(units: readonly MergeSourceUnit[]): MergeUnit[] {
  return units.flatMap((unit) =>
    unit.startMs === null || unit.endMs === null
      ? []
      : [{ id: unit.id, startMs: unit.startMs, endMs: unit.endMs, speakerId: unit.speakerId }],
  );
}

/** The next later segment with the same speaker. Another speaker may sit in the gap. */
export function nextMergeId(units: readonly MergeUnit[], id: string): string | null {
  const current = units.find((unit) => unit.id === id);
  if (current === undefined) return null;
  const next = units
    .filter(
      (unit) =>
        unit.id !== id && unit.speakerId === current.speakerId && unit.startMs >= current.endMs,
    )
    .sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : 1))[0];
  return next?.id ?? null;
}
