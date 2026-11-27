import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import type { ViewScopeWrite } from '../app/desktopProjectReadPageAccess';
import { useToast } from '../contexts/ToastContext';
import { t, type Locale } from '../i18n';
import { bindPointDrag } from './desktopTranscriptionPointDrag';
import {
  createPointAt,
  pointFailureText,
  removePoint,
  savePointLabel,
  savePointMove,
  sortedLayerPoints,
  type PointDragPreview,
  type PointLayer,
  type PointMenuState,
  type PointRef,
  type PointView,
} from './desktopTranscriptionPointOps';
import { useDesktopTranscriptionPointLifecycle } from './useDesktopTranscriptionPointLifecycle';

/** Point selection/create/label/move/delete; kept apart from unit selection. */
export function useDesktopTranscriptionPointController(input: {
  locale: Locale;
  sessionId: string | null;
  manuscriptId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  layers: readonly PointLayer[] | undefined;
  durationSec: number;
  playheadSec: () => number;
  seekTo: (seconds: number) => void;
  clearUnitSelection: () => void;
  reload: () => Promise<unknown>;
  /** Speakers filter active: hide create/edit and refuse writes (6b). */
  writesBlocked?: boolean;
  writeScope?: () => ViewScopeWrite;
}) {
  const toast = useToast();
  const scopeKey = `${input.sessionId ?? ''}\0${input.manuscriptId ?? ''}`;
  const live = useRef({ ...input, scopeKey });
  live.current = { ...input, scopeKey };
  const [selected, setSelected] = useState<PointRef | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [drag, setDrag] = useState<PointDragPreview | null>(null);
  const [menu, setMenu] = useState<PointMenuState | null>(null);
  const dragOrigin = useRef<{ pointId: string; layerId: string; timeMs: number } | null>(null);
  const stopDrag = useRef<(() => void) | null>(null);
  const editVersion = useRef(0);

  function pick(ref: PointRef, timeMs: number) {
    live.current.clearUnitSelection();
    setSelected(ref);
    setMenu(null);
    live.current.seekTo(timeMs / 1000);
  }

  function cancelEdit() {
    editVersion.current += 1;
    setEditingId(null);
    setDraft('');
  }

  function beginEdit(pointId: string, label: string) {
    editVersion.current += 1;
    setEditingId(pointId);
    setDraft(label);
    setMenu(null);
  }

  function fail(caught: unknown) {
    toast.showToast(pointFailureText(live.current.locale, caught), 'error');
  }

  function refuseIfBlocked(): boolean {
    if (live.current.writesBlocked !== true) return false;
    toast.showToast(
      t(live.current.locale, 'app.desktopTranscription.pointsBlockedByFilter'),
      'error',
    );
    return true;
  }

  async function createAt(layerId: string, timeMs: number, edit: boolean) {
    const current = live.current;
    if (current.sessionId === null || current.desktopCall === undefined) return;
    if (refuseIfBlocked()) return;
    try {
      const point = await createPointAt({
        sessionId: current.sessionId,
        desktopCall: current.desktopCall,
        layerId,
        timeMs,
        durationSec: current.durationSec,
        ...(current.writeScope === undefined ? {} : { writeScope: current.writeScope() }),
      });
      if (current.scopeKey !== live.current.scopeKey) return;
      await current.reload();
      if (current.scopeKey !== live.current.scopeKey) return;
      pick({ layerId, pointId: point.id }, point.timeMs);
      if (edit) beginEdit(point.id, '');
    } catch (caught) {
      if (current.scopeKey === live.current.scopeKey) fail(caught);
    }
  }

  async function commitLabel() {
    const current = live.current;
    const pointId = editingId;
    if (current.sessionId === null || current.desktopCall === undefined || pointId === null) return;
    if (refuseIfBlocked()) return;
    const label = draft;
    const version = editVersion.current;
    try {
      await savePointLabel({
        sessionId: current.sessionId,
        desktopCall: current.desktopCall,
        pointId,
        label,
        ...(current.writeScope === undefined ? {} : { writeScope: current.writeScope() }),
      });
      if (current.scopeKey !== live.current.scopeKey) return;
      await current.reload();
      if (current.scopeKey === live.current.scopeKey && version === editVersion.current)
        setEditingId(null);
    } catch (caught) {
      if (current.scopeKey === live.current.scopeKey && version === editVersion.current)
        fail(caught);
    }
  }

  async function commitMove(pointId: string, timeMs: number) {
    const current = live.current;
    if (current.sessionId === null || current.desktopCall === undefined) return;
    if (refuseIfBlocked()) return;
    try {
      await savePointMove({
        sessionId: current.sessionId,
        desktopCall: current.desktopCall,
        pointId,
        timeMs,
        durationSec: current.durationSec,
        ...(current.writeScope === undefined ? {} : { writeScope: current.writeScope() }),
      });
      if (current.scopeKey !== live.current.scopeKey) return;
      await current.reload();
    } catch (caught) {
      if (current.scopeKey === live.current.scopeKey) fail(caught);
    }
  }

  async function erase(pointId: string) {
    const current = live.current;
    if (current.sessionId === null || current.desktopCall === undefined) return;
    if (refuseIfBlocked()) return;
    setMenu(null);
    setEditingId(null);
    try {
      await removePoint({
        sessionId: current.sessionId,
        desktopCall: current.desktopCall,
        pointId,
        ...(current.writeScope === undefined ? {} : { writeScope: current.writeScope() }),
      });
      if (current.scopeKey !== live.current.scopeKey) return;
      setSelected((shown) => (shown?.pointId === pointId ? null : shown));
      await current.reload();
    } catch (caught) {
      if (current.scopeKey === live.current.scopeKey) fail(caught);
    }
  }

  useDesktopTranscriptionPointLifecycle({
    scopeKey,
    layers: input.layers,
    selected,
    editingId,
    menu,
    drag,
    dragOrigin,
    stopDrag,
    setSelected,
    setEditingId,
    setMenu,
    cancelEdit,
    pick,
    beginEdit,
    createAt,
    erase,
    playheadSec: () => live.current.playheadSec(),
  });

  return {
    selected,
    editingId,
    draft,
    drag,
    menu,
    setDraft: (value: string) => {
      editVersion.current += 1;
      setDraft(value);
    },
    clearSelection: () => {
      editVersion.current += 1;
      stopDrag.current?.();
      setSelected(null);
      setEditingId(null);
      setMenu(null);
    },
    onTrackPointerDown(
      event: ReactPointerEvent<HTMLElement>,
      layerId: string,
      msAt: (clientX: number) => number,
    ) {
      if (event.button !== 0 || (event.target as Element).closest('[data-point-id]')) return;
      if (refuseIfBlocked()) return;
      event.preventDefault();
      void createAt(layerId, msAt(event.clientX), true);
    },
    onPointPointerDown(
      event: ReactPointerEvent<HTMLElement>,
      layerId: string,
      point: PointView,
      msAt: (clientX: number) => number,
    ) {
      if (event.button !== 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest('.desktop-tx-pin__label')) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();
      pick({ layerId, pointId: point.id }, point.timeMs);
      if (live.current.writesBlocked === true) return;
      stopDrag.current?.();
      stopDrag.current = bindPointDrag({
        event,
        point,
        layerId,
        msAt,
        durationSec: () => live.current.durationSec,
        dragOrigin,
        setDrag,
        commitMove: (pointId, timeMs) => void commitMove(pointId, timeMs),
      });
    },
    /** A1 edit gate: first click selects; re-click label enters edit. */
    onLabelPointerDown(event: ReactPointerEvent<HTMLElement>, layerId: string, point: PointView) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget
        .closest('[data-point-id]')
        ?.querySelector<HTMLButtonElement>('button')
        ?.focus();
      if (selected?.layerId === layerId && selected.pointId === point.id && editingId === null) {
        if (refuseIfBlocked()) return;
        beginEdit(point.id, point.label);
        return;
      }
      pick({ layerId, pointId: point.id }, point.timeMs);
    },
    onPointContextMenu(event: ReactMouseEvent<HTMLElement>, layerId: string, point: PointView) {
      event.preventDefault();
      event.stopPropagation();
      pick({ layerId, pointId: point.id }, point.timeMs);
      if (live.current.writesBlocked === true) {
        refuseIfBlocked();
        return;
      }
      setMenu({ layerId, pointId: point.id, x: event.clientX, y: event.clientY });
    },
    closeMenu: () => setMenu(null),
    editPoint: (pointId: string, label: string) => beginEdit(pointId, label),
    seekSelected() {
      if (menu === null) return;
      const point = sortedLayerPoints(live.current.layers ?? [], menu.layerId).find(
        (row) => row.id === menu.pointId,
      );
      if (!point) return;
      live.current.seekTo(point.timeMs / 1000);
      setMenu(null);
    },
    deleteSelected: () => {
      if (menu !== null) void erase(menu.pointId);
    },
    commitLabel: () => void commitLabel(),
    cancelEdit,
    shownTimeMs: (point: PointView, layerId: string) =>
      drag?.pointId === point.id && drag.layerId === layerId ? drag.timeMs : point.timeMs,
  };
}

export type DesktopPointTrackApi = ReturnType<typeof useDesktopTranscriptionPointController>;
