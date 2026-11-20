import { useCallback, useEffect, useState } from 'react';
import { emptyFold, parseFold, toggleIn, type LayerFold } from './desktopTranscriptionLayerTree';

const FOLD_KEY = 'jieyu.desktop.layerFold.';
const HEADER_KEY = 'jieyu.desktop.layerHeaderFolded.';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A view preference only; losing it never blocks editing.
  }
}

/** Layer fold and header fold: a local per-manuscript view preference, never written to the project. */
export function useDesktopLayerView(manuscriptId: string | null) {
  const [fold, setFold] = useState<LayerFold>(emptyFold);
  const [headerFolded, setHeaderFolded] = useState(false);
  useEffect(() => {
    setFold(manuscriptId === null ? emptyFold() : parseFold(read(FOLD_KEY + manuscriptId)));
    setHeaderFolded(manuscriptId === null ? false : read(HEADER_KEY + manuscriptId) === '1');
  }, [manuscriptId]);
  const update = useCallback(
    (next: LayerFold) => {
      setFold(next);
      if (manuscriptId !== null) write(FOLD_KEY + manuscriptId, JSON.stringify(next));
    },
    [manuscriptId],
  );
  const toggleGroup = useCallback(
    (layerId: string) => update({ ...fold, groups: toggleIn(fold.groups, layerId) }),
    [fold, update],
  );
  const toggleRow = useCallback(
    (layerId: string) => update({ ...fold, rows: toggleIn(fold.rows, layerId) }),
    [fold, update],
  );
  const toggleHeader = useCallback(() => {
    const next = !headerFolded;
    setHeaderFolded(next);
    if (manuscriptId !== null) write(HEADER_KEY + manuscriptId, next ? '1' : '0');
  }, [headerFolded, manuscriptId]);
  return { fold, headerFolded, toggleGroup, toggleRow, toggleHeader };
}

export type DesktopLayerView = ReturnType<typeof useDesktopLayerView>;
