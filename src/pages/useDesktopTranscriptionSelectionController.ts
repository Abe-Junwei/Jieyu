import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getTranscriptionPlaybackClockSnapshot } from '../hooks/transcription/transcriptionPlaybackClock';
import {
  clickSelection,
  contextMenuSelection,
  emptySelection,
  pruneSelection,
  selectedIds,
  setSelectionFromUnits,
  type ClickModifiers,
  type SelectionState,
  type SelectionUnit,
} from './desktopTranscriptionSelection';

type SelectableUnit = {
  id: string;
  startTime: number;
  endTime?: number;
  layerId?: string;
};

function asSelectionUnit(unit: SelectableUnit): SelectionUnit {
  return {
    id: unit.id,
    layerId: unit.layerId ?? '',
    startMs: Math.round(unit.startTime * 1000),
  };
}

function seekIfOutside(unit: SelectableUnit, seekTo: (time: number) => void) {
  const time = getTranscriptionPlaybackClockSnapshot();
  if (unit.endTime === undefined || time < unit.startTime || time >= unit.endTime) {
    seekTo(unit.startTime);
  }
}

function sameSelection(a: SelectionState, b: SelectionState): boolean {
  return (
    a.primaryId === b.primaryId &&
    a.anchorId === b.anchorId &&
    a.extraIds.length === b.extraIds.length &&
    a.extraIds.every((id, i) => id === b.extraIds[i])
  );
}

export function useDesktopTranscriptionSelectionController(
  locateUnitId: string | null,
  units?: readonly SelectableUnit[],
) {
  const [state, setState] = useState<SelectionState>(() =>
    locateUnitId === null ? emptySelection() : setSelectionFromUnits([locateUnitId]),
  );
  const seekToRef = useRef<(time: number) => void>(() => undefined);
  const unitsRef = useRef<readonly SelectionUnit[]>([]);
  unitsRef.current = (units ?? []).map(asSelectionUnit);

  useEffect(() => {
    if (units === undefined) return;
    const existing = units.map((unit) => unit.id);
    setState((current) => {
      const next = pruneSelection(current, existing);
      return sameSelection(current, next) ? current : next;
    });
  }, [units]);

  const selectUnit = useCallback((unit: SelectableUnit) => {
    setState(setSelectionFromUnits([unit.id]));
    seekIfOutside(unit, (time) => seekToRef.current(time));
  }, []);

  /** A box select: the first unit is the primary (edges, keys), the rest are highlighted too. */
  const selectUnits = useCallback((unitsNext: readonly SelectableUnit[]) => {
    const [first, ...rest] = unitsNext;
    if (!first) return;
    setState(setSelectionFromUnits([first.id, ...rest.map((unit) => unit.id)]));
    seekToRef.current(first.startTime);
  }, []);

  const clickUnit = useCallback((unit: SelectableUnit, mods: ClickModifiers) => {
    setState((current) => clickSelection(current, asSelectionUnit(unit), unitsRef.current, mods));
    seekIfOutside(unit, (time) => seekToRef.current(time));
  }, []);

  const applyContextMenuTarget = useCallback((unitId: string) => {
    setState((current) => contextMenuSelection(current, unitId));
  }, []);

  const pruneToExisting = useCallback((existingIds: readonly string[]) => {
    setState((current) => {
      const next = pruneSelection(current, existingIds);
      return sameSelection(current, next) ? current : next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setState(emptySelection());
  }, []);

  const selectedUnitIds = useMemo(() => selectedIds(state), [state]);
  const selectedUnitId = state.primaryId;

  return {
    selectedUnitId,
    selectedUnitIds,
    selectUnit,
    selectUnits,
    clickUnit,
    applyContextMenuTarget,
    pruneToExisting,
    clearSelection,
    seekToRef,
  };
}
