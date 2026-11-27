import type { MouseEvent as ReactMouseEvent } from 'react';
import { msToSec } from '../utils/timeMs';
import type { DesktopPlaybackUnit } from './useDesktopTranscriptionMediaController';
import { clickModsFromEvent } from './desktopTranscriptionSelection';

/** Timed units from the project read model, shaped for playback / selection. */
export function playbackUnitsFromSource(
  sourceUnits:
    | readonly {
        id: string;
        layerId: string;
        startMs: number | null;
        endMs: number | null;
        text: string;
        confidence?: number | null;
        selfCertainty?: 'not_understood' | 'uncertain' | 'certain' | null;
        skipProcessing?: boolean;
      }[]
    | undefined,
): readonly DesktopPlaybackUnit[] {
  return (sourceUnits ?? []).flatMap((unit) => {
    if (unit.startMs === null || unit.endMs === null) return [];
    const next: DesktopPlaybackUnit = {
      id: unit.id,
      startTime: msToSec(unit.startMs),
      endTime: msToSec(unit.endMs),
      text: unit.text,
      layerId: unit.layerId,
    };
    if (unit.skipProcessing === true) next.skipProcessing = true;
    if (typeof unit.confidence === 'number' || unit.confidence === null) {
      next.confidence = unit.confidence;
    }
    if (
      unit.selfCertainty === null ||
      unit.selfCertainty === 'not_understood' ||
      unit.selfCertainty === 'uncertain' ||
      unit.selfCertainty === 'certain'
    ) {
      next.selfCertainty = unit.selfCertainty;
    }
    return [next];
  });
}

/** Main-row annotation click: modifiers go to batch select when enabled; else edit / select. */
export function handleMainUnitClick(input: {
  event: ReactMouseEvent;
  unit: DesktopPlaybackUnit;
  selected: boolean;
  focused: boolean;
  onClickUnit?: (unit: DesktopPlaybackUnit, mods: { toggle: boolean; range: boolean }) => void;
  onSelectUnit: (unit: DesktopPlaybackUnit) => void;
  onLeave: (go: () => void) => void;
  openEdit: () => void;
  clearFocus: () => void;
}): void {
  const mods = clickModsFromEvent(input.event);
  if (input.onClickUnit && (mods.toggle || mods.range)) {
    input.onLeave(() => {
      input.clearFocus();
      input.onClickUnit?.(input.unit, mods);
    });
    return;
  }
  if (input.selected && !input.focused) {
    input.openEdit();
    return;
  }
  if (input.selected) {
    input.onLeave(() => input.clearFocus());
    return;
  }
  input.onSelectUnit(input.unit);
}

/** Menu delete label count after context-menu keep/replace. */
export function menuDeleteCount(
  menuUnitId: string | undefined,
  selectedUnitIds: readonly string[],
): number {
  return menuUnitId !== undefined && selectedUnitIds.includes(menuUnitId)
    ? selectedUnitIds.length
    : 1;
}

/** One selection identity per structure unit, even when several text layers project it. */
export function selectablePlaybackUnits(
  layers:
    | readonly {
        id: string;
        units: readonly {
          id: string;
          layerId?: string;
          startMs: number | null;
          endMs: number | null;
          text: string;
          speakerId?: string | null;
        }[];
      }[]
    | undefined,
  visible: (speakerId: string | null | undefined) => boolean,
): readonly DesktopPlaybackUnit[] | undefined {
  if (layers === undefined) return undefined;
  const units = new Map<
    string,
    { id: string; layerId: string; startMs: number | null; endMs: number | null; text: string }
  >();
  for (const layer of layers)
    for (const unit of layer.units) {
      if (visible(unit.speakerId) && !units.has(unit.id))
        units.set(unit.id, { ...unit, layerId: unit.layerId ?? layer.id });
    }
  return playbackUnitsFromSource([...units.values()]);
}
