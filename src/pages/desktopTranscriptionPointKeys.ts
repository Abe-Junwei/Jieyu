import {
  neighborPoint,
  sortedLayerPoints,
  type PointLayer,
  type PointRef,
} from './desktopTranscriptionPointOps';

/** Point-lane keyboard: Esc / arrows / Home·End / Enter edit / ⌘Enter create / ⌫ delete. */
export function onPointKeyDown(
  event: KeyboardEvent,
  input: {
    layers: readonly PointLayer[] | undefined;
    selected: PointRef | null;
    editingId: string | null;
    menuOpen: boolean;
    dragging: boolean;
    clearDrag: () => void;
    cancelEdit: () => void;
    clearMenu: () => void;
    clearSelection: () => void;
    pick: (ref: PointRef, timeMs: number) => void;
    beginEdit: (pointId: string, label: string) => void;
    createAtPlayhead: (layerId: string) => void;
    erase: (pointId: string) => void;
  },
): void {
  if (event.defaultPrevented || event.isComposing) return;
  const target = event.target;
  if (
    target instanceof Element &&
    (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') ||
      (target instanceof HTMLElement && target.isContentEditable))
  )
    return;
  if (event.key === 'Escape') {
    if (input.dragging) {
      event.preventDefault();
      input.clearDrag();
      return;
    }
    if (input.editingId !== null) {
      event.preventDefault();
      input.cancelEdit();
      return;
    }
    if (input.menuOpen) {
      input.clearMenu();
      return;
    }
    if (input.selected !== null) input.clearSelection();
    return;
  }
  if (input.editingId !== null) return;
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    const layerId =
      input.selected?.layerId ??
      (input.layers ?? []).find((layer) => layer.contentType === 'point')?.id;
    if (layerId === undefined) return;
    event.preventDefault();
    input.createAtPlayhead(layerId);
    return;
  }
  if (input.selected === null) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const next = neighborPoint(
      input.layers ?? [],
      input.selected,
      event.key === 'ArrowLeft' ? -1 : 1,
    );
    if (next) input.pick({ layerId: input.selected.layerId, pointId: next.id }, next.timeMs);
    return;
  }
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    const next = neighborPoint(
      input.layers ?? [],
      input.selected,
      event.key === 'Home' ? 'home' : 'end',
    );
    if (next) input.pick({ layerId: input.selected.layerId, pointId: next.id }, next.timeMs);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const selected = input.selected;
    const point = sortedLayerPoints(input.layers ?? [], selected.layerId).find(
      (row) => row.id === selected.pointId,
    );
    if (point) input.beginEdit(point.id, point.label);
    return;
  }
  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault();
    input.erase(input.selected.pointId);
  }
}
