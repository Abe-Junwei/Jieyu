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

export interface MergeFrozenText {
  others?: Record<string, string>;
  keep: string;
  remove: string;
}

export interface MergePairView {
  keepId: string;
  removeId: string;
  gapMs: number;
  noteCount: number;
  earlier: { id: string }[];
  later: { id: string }[];
}

export function mergeFrozenText(
  textOf: (unitId: string) => string,
  keepId: string,
  removeId: string,
  unitIds?: readonly string[],
): MergeFrozenText {
  return {
    keep: textOf(keepId),
    remove: textOf(removeId),
    ...(unitIds && unitIds.length > 2
      ? { others: Object.fromEntries(unitIds.map((id) => [id, textOf(id)])) }
      : {}),
  };
}

export function sameMergeText(left: MergeFrozenText, right: MergeFrozenText): boolean {
  return (
    left.keep === right.keep &&
    left.remove === right.remove &&
    JSON.stringify(left.others ?? {}) === JSON.stringify(right.others ?? {})
  );
}

export function sameMergeEditor(
  now: {
    sessionId: string | null;
    textLayerId: string | null;
    textOf: (unitId: string) => string;
  },
  sessionId: string,
  textLayerId: string | null,
  frozen: MergeFrozenText,
  preview: { keepId: string; removeId: string; unitIds?: string[] },
): boolean {
  const text = mergeFrozenText(now.textOf, preview.keepId, preview.removeId, preview.unitIds);
  return (
    now.sessionId === sessionId && now.textLayerId === textLayerId && sameMergeText(text, frozen)
  );
}

export function sameMergePair(opened: MergePairView, fresh: MergePairView): boolean {
  const ids = (preview: MergePairView) =>
    [...preview.earlier, ...preview.later].map((clip) => clip.id).join('\n');
  return (
    opened.keepId === fresh.keepId &&
    opened.removeId === fresh.removeId &&
    opened.gapMs === fresh.gapMs &&
    opened.noteCount === fresh.noteCount &&
    ids(opened) === ids(fresh)
  );
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

export function mergeTargetIds(
  units: readonly MergeSourceUnit[],
  selected: readonly string[] | undefined,
  hit: string,
): string[] | null {
  if (selected && selected.length > 1 && selected.includes(hit)) {
    const rows = units
      .filter((unit) => selected.includes(unit.id))
      .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
    if (
      rows.length !== selected.length ||
      rows.some((unit) => unit.startMs === null || unit.endMs === null)
    )
      return null;
    for (let i = 1; i < rows.length; i++)
      if (nextMergeId(timedUnits(units), rows[i - 1]!.id) !== rows[i]!.id) return null;
    return rows.map((unit) => unit.id);
  }
  const next = nextMergeId(timedUnits(units), hit);
  return next === null ? null : [hit, next];
}

export function freezeMergeOffer<
  T extends { keepId: string; removeId: string; unitIds?: string[] },
>(preview: T, input: { textOf: (id: string) => string; filterRevision?: string }) {
  return {
    preview,
    frozen: mergeFrozenText(input.textOf, preview.keepId, preview.removeId, preview.unitIds),
    filterRevision: input.filterRevision ?? '',
  };
}
