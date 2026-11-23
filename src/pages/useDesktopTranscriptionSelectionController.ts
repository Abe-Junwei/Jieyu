import { useCallback, useMemo, useRef, useState } from 'react';

import { getTranscriptionPlaybackClockSnapshot } from '../hooks/transcription/transcriptionPlaybackClock';

type SelectableUnit = { id: string; startTime: number; endTime?: number };

export function useDesktopTranscriptionSelectionController(locateUnitId: string | null) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(locateUnitId);
  const [extraIds, setExtraIds] = useState<readonly string[]>([]);
  const seekToRef = useRef<(time: number) => void>(() => undefined);
  const selectUnit = useCallback((unit: SelectableUnit) => {
    setSelectedUnitId(unit.id);
    setExtraIds([]);
    const time = getTranscriptionPlaybackClockSnapshot();
    if (unit.endTime === undefined || time < unit.startTime || time >= unit.endTime) {
      seekToRef.current(unit.startTime);
    }
  }, []);
  /** A box select: the first unit is the primary (edges, keys), the rest are highlighted too. */
  const selectUnits = useCallback((units: readonly SelectableUnit[]) => {
    const [first, ...rest] = units;
    if (!first) return;
    setSelectedUnitId(first.id);
    setExtraIds(rest.map((unit) => unit.id));
    seekToRef.current(first.startTime);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedUnitId(null);
    setExtraIds([]);
  }, []);
  const selectedUnitIds = useMemo(
    () => (selectedUnitId === null ? extraIds : [selectedUnitId, ...extraIds]),
    [selectedUnitId, extraIds],
  );
  return { selectedUnitId, selectedUnitIds, selectUnit, selectUnits, clearSelection, seekToRef };
}
