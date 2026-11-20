import { useCallback, useRef, useState } from 'react';

export function useDesktopTranscriptionSelectionController(locateUnitId: string | null) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(locateUnitId);
  const seekToRef = useRef<(time: number) => void>(() => undefined);
  const selectUnit = useCallback((unit: { id: string; startTime: number }) => {
    setSelectedUnitId(unit.id);
    seekToRef.current(unit.startTime);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedUnitId(null);
  }, []);
  return { selectedUnitId, selectUnit, clearSelection, seekToRef };
}
