import type { ViewScope, ViewScopeWrite } from '../app/desktopProjectReadPageAccess';

export type SpeakerFilterRow = {
  id: string;
  name: string;
  count: number;
};

export type SpeakerFilterState = {
  /** Checked speaker ids. Empty + `includeUnassigned` false ⇒ show all. */
  speakerIds: readonly string[];
  includeUnassigned: boolean;
};

export const EMPTY_SPEAKER_FILTER: SpeakerFilterState = {
  speakerIds: [],
  includeUnassigned: false,
};

export function speakerFilterActive(state: SpeakerFilterState): boolean {
  return state.includeUnassigned || state.speakerIds.length > 0;
}

export function speakerFilterRevision(state: SpeakerFilterState): string {
  const ids = [...state.speakerIds].sort().join(',');
  return `${state.includeUnassigned ? 1 : 0}:${ids}`;
}

export function toggleSpeakerFilterId(
  state: SpeakerFilterState,
  speakerId: string,
): SpeakerFilterState {
  const set = new Set(state.speakerIds);
  if (set.has(speakerId)) set.delete(speakerId);
  else set.add(speakerId);
  return {
    speakerIds: [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    includeUnassigned: state.includeUnassigned,
  };
}

export function toggleUnassignedFilter(state: SpeakerFilterState): SpeakerFilterState {
  return { speakerIds: state.speakerIds, includeUnassigned: !state.includeUnassigned };
}

export function clearSpeakerFilter(): SpeakerFilterState {
  return EMPTY_SPEAKER_FILTER;
}

export function unitVisibleInSpeakerFilter(
  speakerId: string | null | undefined,
  state: SpeakerFilterState,
): boolean {
  if (!speakerFilterActive(state)) return true;
  if (speakerId == null || speakerId === '') return state.includeUnassigned;
  return state.speakerIds.includes(speakerId);
}

export function viewScopeFromSpeakerFilter(
  manuscriptId: string,
  state: SpeakerFilterState,
): ViewScope {
  if (!speakerFilterActive(state)) return { manuscriptId, kind: 'all' };
  return {
    manuscriptId,
    kind: 'speakers',
    speakerIds: state.speakerIds,
    includeUnassigned: state.includeUnassigned,
  };
}

/** Workspace write protection payload. Empty when there is no manuscript yet. */
export function writeScopeArgs(
  manuscriptId: string | null | undefined,
  filter: SpeakerFilterState,
  affectedUnitIds: readonly string[],
): ViewScopeWrite {
  if (manuscriptId === null || manuscriptId === undefined) return {};
  return {
    viewScope: viewScopeFromSpeakerFilter(manuscriptId, filter),
    expectedAffectedUnitIds: [...affectedUnitIds],
  };
}

/** Unit plus subdivision children (by parentUnitId), matching desktop span moves. */
export function spanAffectedFromUnits(
  units: readonly { id: string; parentUnitId?: string | null }[],
  unitId: string,
): string[] {
  const kids = new Map<string, string[]>();
  for (const unit of units) {
    const parent = unit.parentUnitId;
    if (parent === null || parent === undefined) continue;
    const list = kids.get(parent) ?? [];
    list.push(unit.id);
    kids.set(parent, list);
  }
  const out = [unitId];
  const queue = [unitId];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const child of kids.get(id) ?? []) {
      if (visited.has(child)) continue;
      visited.add(child);
      out.push(child);
      queue.push(child);
    }
  }
  return out;
}

/** Rows for the sidebar: named speakers then a synthetic unassigned row. */
export function speakerFilterRows(
  speakers: readonly { id: string; name: string }[],
  units: readonly { id?: string; speakerId?: string | null }[],
  unassignedLabel: string,
): SpeakerFilterRow[] {
  const counts = new Map<string, number>();
  let unassigned = 0;
  const counted = new Set<string>();
  for (const unit of units) {
    if (unit.id !== undefined) {
      if (counted.has(unit.id)) continue;
      counted.add(unit.id);
    }
    const id = unit.speakerId;
    if (id == null || id === '') {
      unassigned += 1;
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const named = speakers.map((speaker) => ({
    id: speaker.id,
    name: speaker.name,
    count: counts.get(speaker.id) ?? 0,
  }));
  return [...named, { id: '', name: unassignedLabel, count: unassigned }];
}

export function speakerFilterHeaderMeta(
  state: SpeakerFilterState,
  totalSpeakers: number,
  text: { all: (n: number) => string; filtering: (n: number) => string },
): string {
  if (!speakerFilterActive(state)) return text.all(totalSpeakers);
  const n = state.speakerIds.length + (state.includeUnassigned ? 1 : 0);
  return text.filtering(n);
}

/** Keep layer identities and time coordinates while filtering every projection. */
export function visibleSpeakerLayers<
  T extends { units: readonly { speakerId?: string | null }[]; points?: readonly unknown[] },
>(layers: readonly T[] | undefined, filter: SpeakerFilterState): readonly T[] | undefined {
  if (!layers || !speakerFilterActive(filter)) return layers;
  return layers.map((layer) => ({
    ...layer,
    units: layer.units.filter((unit) => unitVisibleInSpeakerFilter(unit.speakerId, filter)),
    ...(layer.points === undefined ? {} : { points: [] }),
  }));
}
