/** Structure-unit multi-select helpers for the desktop transcription workspace (1b-6 / 6a). */

export type SelectionUnit = {
  id: string;
  /** Structure layer that owns the unit. Linked projections share the host unit id. */
  layerId: string;
  startMs: number;
};

export type SelectionState = {
  primaryId: string | null;
  extraIds: readonly string[];
  /** Shift-range anchor; cleared on plain replace. */
  anchorId: string | null;
};

export type ClickModifiers = {
  toggle: boolean;
  range: boolean;
};

export function clickModsFromEvent(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}): ClickModifiers {
  return { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey };
}

export function emptySelection(): SelectionState {
  return { primaryId: null, extraIds: [], anchorId: null };
}

export function selectedIds(state: SelectionState): readonly string[] {
  if (state.primaryId === null) return state.extraIds;
  return [state.primaryId, ...state.extraIds];
}

export function dedupePreserveOrder(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Units of one structure layer, ordered by time then id (stable range). */
export function orderedLayerUnits(
  units: readonly SelectionUnit[],
  layerId: string,
): SelectionUnit[] {
  return units
    .filter((unit) => unit.layerId === layerId)
    .slice()
    .sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function replaceSelection(unitId: string): SelectionState {
  return { primaryId: unitId, extraIds: [], anchorId: unitId };
}

/** Box / multi pick: first is primary + anchor; rest are extras (deduped). */
export function setSelectionFromUnits(unitIds: readonly string[]): SelectionState {
  const [first, ...rest] = dedupePreserveOrder(unitIds);
  if (first === undefined) return emptySelection();
  return { primaryId: first, extraIds: rest, anchorId: first };
}

export function toggleSelection(
  state: SelectionState,
  unit: SelectionUnit,
  units: readonly SelectionUnit[],
): SelectionState {
  const current = selectedIds(state);
  if (current.length === 0) return replaceSelection(unit.id);
  const primary = units.find((item) => item.id === state.primaryId);
  if (primary !== undefined && primary.layerId !== unit.layerId) {
    return replaceSelection(unit.id);
  }
  if (current.includes(unit.id)) {
    const next = current.filter((id) => id !== unit.id);
    if (next.length === 0) return emptySelection();
    const [first, ...rest] = next;
    return {
      primaryId: first!,
      extraIds: rest,
      anchorId: state.anchorId === unit.id ? first! : state.anchorId,
    };
  }
  return {
    primaryId: state.primaryId ?? unit.id,
    extraIds: state.primaryId === null ? [] : dedupePreserveOrder([...state.extraIds, unit.id]),
    anchorId: state.anchorId ?? unit.id,
  };
}

export function rangeSelection(
  state: SelectionState,
  unit: SelectionUnit,
  units: readonly SelectionUnit[],
): SelectionState {
  const layer = orderedLayerUnits(units, unit.layerId);
  const anchorId = state.anchorId ?? state.primaryId;
  if (anchorId === null) return replaceSelection(unit.id);
  const anchor = layer.find((item) => item.id === anchorId);
  const target = layer.find((item) => item.id === unit.id);
  if (anchor === undefined || target === undefined) return replaceSelection(unit.id);
  const a = layer.indexOf(anchor);
  const b = layer.indexOf(target);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const ids = layer.slice(lo, hi + 1).map((item) => item.id);
  const [first, ...rest] = ids;
  if (first === undefined) return replaceSelection(unit.id);
  return { primaryId: first, extraIds: rest, anchorId };
}

/** Right-click: keep the set when the hit is already selected; otherwise select only the hit. */
export function contextMenuSelection(state: SelectionState, hitId: string): SelectionState {
  if (selectedIds(state).includes(hitId)) return state;
  return replaceSelection(hitId);
}

export function pruneSelection(
  state: SelectionState,
  existingIds: ReadonlySet<string> | readonly string[],
): SelectionState {
  const live = existingIds instanceof Set ? existingIds : new Set(existingIds);
  const kept = selectedIds(state).filter((id) => live.has(id));
  if (kept.length === 0) return emptySelection();
  const [first, ...rest] = kept;
  const anchor = state.anchorId !== null && live.has(state.anchorId) ? state.anchorId : first!;
  return { primaryId: first!, extraIds: rest, anchorId: anchor };
}

export function clickSelection(
  state: SelectionState,
  unit: SelectionUnit,
  units: readonly SelectionUnit[],
  mods: ClickModifiers,
): SelectionState {
  if (mods.range) return rangeSelection(state, unit, units);
  if (mods.toggle) return toggleSelection(state, unit, units);
  return replaceSelection(unit.id);
}
