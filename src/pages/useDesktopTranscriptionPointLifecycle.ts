import { useEffect, type MutableRefObject } from 'react';
import { onPointKeyDown } from './desktopTranscriptionPointKeys';
import {
  sortedLayerPoints,
  type PointDragPreview,
  type PointLayer,
  type PointMenuState,
  type PointRef,
} from './desktopTranscriptionPointOps';

/** Scope reset, prune selection when layers change, and point keyboard routing. */
export function useDesktopTranscriptionPointLifecycle(input: {
  scopeKey: string;
  layers: readonly PointLayer[] | undefined;
  selected: PointRef | null;
  editingId: string | null;
  menu: PointMenuState | null;
  drag: PointDragPreview | null;
  dragOrigin: MutableRefObject<{ pointId: string; layerId: string; timeMs: number } | null>;
  stopDrag: MutableRefObject<(() => void) | null>;
  setSelected: (value: PointRef | null | ((current: PointRef | null) => PointRef | null)) => void;
  setEditingId: (value: string | null) => void;
  setMenu: (value: PointMenuState | null) => void;
  cancelEdit: () => void;
  pick: (ref: PointRef, timeMs: number) => void;
  beginEdit: (pointId: string, label: string) => void;
  createAt: (layerId: string, timeMs: number, edit: boolean) => Promise<void>;
  erase: (pointId: string) => Promise<void>;
  playheadSec: () => number;
}) {
  const { scopeKey } = input;

  useEffect(() => {
    input.setSelected(null);
    input.setEditingId(null);
    input.setMenu(null);
    return () => {
      input.stopDrag.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scopeKey is the reset signal
  }, [scopeKey]);

  useEffect(() => {
    input.setSelected((current) => {
      if (current === null) return current;
      const still = sortedLayerPoints(input.layers ?? [], current.layerId).some(
        (point) => point.id === current.pointId,
      );
      if (still) return current;
      input.setEditingId(null);
      input.setMenu(null);
      return null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layers drive prune
  }, [input.layers]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      onPointKeyDown(event, {
        layers: input.layers,
        selected: input.selected,
        editingId: input.editingId,
        menuOpen: input.menu !== null,
        dragging: input.dragOrigin.current !== null || input.drag !== null,
        clearDrag: () => {
          input.stopDrag.current?.();
        },
        cancelEdit: input.cancelEdit,
        clearMenu: () => input.setMenu(null),
        clearSelection: () => input.setSelected(null),
        pick: input.pick,
        beginEdit: input.beginEdit,
        createAtPlayhead: (layerId) =>
          void input.createAt(layerId, Math.round(input.playheadSec() * 1000), true),
        erase: (pointId) => void input.erase(pointId),
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}
