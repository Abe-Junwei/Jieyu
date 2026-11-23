import type { CSSProperties } from 'react';
import { buildSpeakerLayerLayoutWithOptions } from '../utils/speakerLayerLayout';

export type SpeakerLaneMode = 'single' | 'auto' | 'one-per-speaker';

export interface SpeakerLaneUnit {
  id: string;
  /** Seconds, the unit the layout function already uses. */
  startTime: number;
  endTime: number;
  speakerId: string | null;
}

export interface SpeakerLaneCard {
  row: number;
  front: boolean;
  speakerId: string | null;
  cycle: { index: number; total: number } | null;
}

export interface SpeakerLaneChrome {
  layoutOf: (layerId: string) => SpeakerLaneLayout | undefined;
  modeOf: (layerId: string) => SpeakerLaneMode;
  nameOf: (speakerId: string | null) => string;
  menu: {
    recent: { id: string; name: string }[];
    rest: { id: string; name: string }[];
  };
  setMode: (layerId: string, mode: SpeakerLaneMode) => void;
  cycle: (layerId: string) => void;
  lock: (layerId: string) => void;
  clearConflicts: (layerId: string) => void;
  assign: (unitId: string, speakerId: string) => void;
  clear: (unitId: string) => void;
}

export interface SpeakerLaneLayout {
  cards: Map<string, SpeakerLaneCard>;
  rowCount: number;
  /** Overlap places. Only single-row layout counts them; the header shows the number. */
  overlapCount: number;
  conflictSpeakerIds: string[];
}

const ROW_TOP = 4;
const ROW_PITCH = 42;
const CARD_HEIGHT = 38;

export function readLaneModes(raw: string | null): Record<string, SpeakerLaneMode> {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const modes: Record<string, SpeakerLaneMode> = {};
    for (const [layerId, value] of Object.entries(parsed)) {
      if (value === 'single' || value === 'auto' || value === 'one-per-speaker') {
        modes[layerId] = value;
      }
    }
    return modes;
  } catch {
    return {};
  }
}

/**
 * Paint rows for one layer. Single stays one row and cycles. One-per-speaker reads locks as
 * preferences and does not return a map to store. Callers must not write `cards` back.
 */
export function layoutSpeakerLane(
  units: readonly SpeakerLaneUnit[],
  mode: SpeakerLaneMode,
  locks: Readonly<Record<string, number>>,
  cycleStep = 0,
): SpeakerLaneLayout {
  const laid = buildSpeakerLayerLayoutWithOptions(
    [...units],
    mode === 'one-per-speaker'
      ? { trackMode: 'multi-speaker-fixed', laneLockMap: locks }
      : mode === 'auto'
        ? { trackMode: 'multi-auto', laneLockMap: locks }
        : { trackMode: 'single' },
  );
  const cards = new Map<string, SpeakerLaneCard>();
  const cycleOrder = mode === 'single' ? singleRowCycleOrder(units, laid.placements) : new Map();
  let overlapCount = 0;
  for (const unit of units) {
    const placement = laid.placements.get(unit.id);
    const order = placement === undefined ? undefined : cycleOrder.get(placement.overlapGroupId);
    const pile = order !== undefined && order.length > 1 ? order : undefined;
    const index = pile === undefined ? 0 : cycleStep % pile.length;
    const frontId = pile === undefined ? unit.id : pile[index];
    cards.set(unit.id, {
      row: mode === 'single' ? 0 : (placement?.subTrackIndex ?? 0),
      front: frontId === unit.id,
      speakerId: unit.speakerId,
      cycle: pile === undefined ? null : { index: index + 1, total: pile.length },
    });
  }
  if (mode === 'single') {
    for (const group of laid.overlapGroups) {
      if (group.speakerCount > 1) overlapCount += 1;
    }
  }
  return {
    cards,
    rowCount: mode === 'single' ? 1 : Math.max(1, laid.subTrackCount),
    overlapCount,
    conflictSpeakerIds: mode === 'auto' ? laid.lockConflictSpeakerIds : [],
  };
}

export function speakerCardFrame(
  layout: SpeakerLaneLayout | undefined,
  unitId: string,
): CSSProperties | undefined {
  if (layout === undefined) return undefined;
  const card = layout.cards.get(unitId);
  if (card === undefined) return undefined;
  const stacked = layout.rowCount > 1;
  if (!stacked && card.cycle === null) return undefined;
  return {
    ...(stacked
      ? { top: ROW_TOP + card.row * ROW_PITCH, height: CARD_HEIGHT, bottom: 'auto' }
      : {}),
    zIndex: card.front ? 3 : 1,
  };
}

export function lanePaintHeight(
  stored: number | null | undefined,
  rowCount: number,
): number | undefined {
  if (rowCount <= 1) return undefined;
  return Math.max(stored ?? 54, 8 + rowCount * ROW_PITCH);
}

/** One front card per overlap group, in start order. A chain shares that order. */
function singleRowCycleOrder(
  units: readonly SpeakerLaneUnit[],
  placements: ReadonlyMap<string, { overlapGroupId: string }>,
): Map<string, string[]> {
  const members = new Map<string, SpeakerLaneUnit[]>();
  for (const unit of units) {
    const groupId = placements.get(unit.id)?.overlapGroupId;
    if (groupId === undefined) continue;
    const list = members.get(groupId) ?? [];
    list.push(unit);
    members.set(groupId, list);
  }
  const order = new Map<string, string[]>();
  for (const [groupId, list] of members) {
    order.set(
      groupId,
      [...list]
        .sort(
          (left, right) =>
            left.startTime - right.startTime ||
            left.endTime - right.endTime ||
            left.id.localeCompare(right.id),
        )
        .map((unit) => unit.id),
    );
  }
  return order;
}

/** The painted row of the selected segment on this layer. Another layer, or no speaker, is null. */
export function laneLockRow(
  units: readonly { id: string; speakerId: string | null }[],
  selectedUnitId: string | null,
  cards: ReadonlyMap<string, { row: number }> | undefined,
): { speakerId: string; row: number } | null {
  const unit = units.find((item) => item.id === selectedUnitId);
  if (unit?.speakerId == null) return null;
  const row = cards?.get(unit.id)?.row;
  return row === undefined ? null : { speakerId: unit.speakerId, row };
}

/** This manuscript's 3 most recently updated speakers, then everyone else by name. */
export function speakerMenuOrder(
  speakers: readonly { id: string; name: string }[],
  units: readonly { speakerId: string | null; updatedAt: string }[],
): { recent: { id: string; name: string }[]; rest: { id: string; name: string }[] } {
  const latest = new Map<string, string>();
  for (const unit of units) {
    if (unit.speakerId === null) continue;
    const prev = latest.get(unit.speakerId);
    if (prev === undefined || unit.updatedAt > prev) latest.set(unit.speakerId, unit.updatedAt);
  }
  const named = speakers.map((speaker) => ({ id: speaker.id, name: speaker.name }));
  const recentIds = [...latest.entries()]
    .sort((left, right) => right[1].localeCompare(left[1]) || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([id]) => id);
  const recent = recentIds.flatMap((id) => {
    const speaker = named.find((item) => item.id === id);
    return speaker === undefined ? [] : [speaker];
  });
  const rest = named
    .filter((speaker) => !recentIds.includes(speaker.id))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh'));
  return { recent, rest };
}

export function laneLabelProps(chrome: SpeakerLaneChrome | undefined, layerId: string) {
  if (chrome === undefined) return {};
  const layout = chrome.layoutOf(layerId);
  return {
    ...(layout !== undefined && layout.overlapCount > 0
      ? { overlapCount: layout.overlapCount }
      : {}),
    lane: {
      mode: chrome.modeOf(layerId),
      conflicts: (layout?.conflictSpeakerIds.length ?? 0) > 0,
      onMode: (mode: SpeakerLaneMode) => chrome.setMode(layerId, mode),
      onLock: () => chrome.lock(layerId),
      onClearConflicts: () => chrome.clearConflicts(layerId),
    },
  };
}

export function speakerMenuProps(
  chrome: SpeakerLaneChrome | undefined,
  layers: readonly { units: readonly { id: string; speakerId?: string | null }[] }[] | undefined,
  menu: { unitId: string } | null,
  close: () => void,
) {
  if (chrome === undefined || menu === null) return {};
  const unitId = menu.unitId;
  return {
    speakers: {
      recent: chrome.menu.recent,
      rest: chrome.menu.rest,
      currentId: speakerOn(layers, unitId),
      onAssign: (speakerId: string) => {
        chrome.assign(unitId, speakerId);
        close();
      },
      onClear: () => {
        chrome.clear(unitId);
        close();
      },
    },
  };
}

function speakerOn(
  layers: readonly { units: readonly { id: string; speakerId?: string | null }[] }[] | undefined,
  unitId: string,
): string | null {
  for (const layer of layers ?? []) {
    const unit = layer.units.find((item) => item.id === unitId);
    if (unit) return unit.speakerId ?? null;
  }
  return null;
}

export function speakerPaint(
  chrome: SpeakerLaneChrome | undefined,
  layerId: string,
  unitId: string,
) {
  const layout = chrome?.layoutOf(layerId);
  const card = layout?.cards.get(unitId);
  const frameStyle = speakerCardFrame(layout, unitId);
  const name = chrome?.nameOf(card?.speakerId ?? null) ?? '';
  return {
    ...(frameStyle === undefined ? {} : { frameStyle }),
    ...(name === '' ? {} : { speakerName: name }),
    ...(card?.cycle === null || card?.cycle === undefined
      ? {}
      : { overlapCycleIndicator: card.cycle, onCycleOverlap: () => chrome?.cycle(layerId) }),
  };
}
