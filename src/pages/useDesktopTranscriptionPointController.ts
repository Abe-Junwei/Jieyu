import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { useToast } from '../contexts/ToastContext';
import type { Locale } from '../i18n';
import { bindPointDrag } from './desktopTranscriptionPointDrag';
import {
  createPointAt,
  neighborPoint,
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

/** Point selection/create/label/move/delete; kept apart from unit selection. */
export function useDesktopTranscriptionPointController(input: {
  locale: Locale;
  sessionId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  layers: readonly PointLayer[] | undefined;
  durationSec: number;
  playheadSec: () => number;
  seekTo: (seconds: number) => void;
  clearUnitSelection: () => void;
  reload: () => Promise<unknown>;
}) {
  const toast = useToast();
  const live = useRef(input);
  live.current = input;
  const [selected, setSelected] = useState<PointRef | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [drag, setDrag] = useState<PointDragPreview | null>(null);
  const [menu, setMenu] = useState<PointMenuState | null>(null);
  const dragOrigin = useRef<{ pointId: string; layerId: string; timeMs: number } | null>(null);

  useEffect(() => {
    setSelected((current) => {
      if (current === null) return current;
      const still = sortedLayerPoints(live.current.layers ?? [], current.layerId).some(
        (point) => point.id === current.pointId,
      );
      if (still) return current;
      setEditingId(null);
      setMenu(null);
      return null;
    });
  }, [input.layers]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const current = live.current;
      if (event.key === 'Escape') {
        if (dragOrigin.current !== null || drag !== null) {
          event.preventDefault();
          dragOrigin.current = null;
          setDrag(null);
          return;
        }
        if (editingId !== null) {
          event.preventDefault();
          setEditingId(null);
          setDraft('');
          return;
        }
        if (menu !== null) {
          setMenu(null);
          return;
        }
        if (selected !== null) setSelected(null);
        return;
      }
      if (editingId !== null) return;
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        const layerId =
          selected?.layerId ??
          (current.layers ?? []).find((layer) => layer.contentType === 'point')?.id;
        if (layerId === undefined) return;
        event.preventDefault();
        void createAt(layerId, Math.round(current.playheadSec() * 1000), true);
        return;
      }
      if (selected === null) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const next = neighborPoint(
          current.layers ?? [],
          selected,
          event.key === 'ArrowLeft' ? -1 : 1,
        );
        if (next) pick({ layerId: selected.layerId, pointId: next.id }, next.timeMs);
        return;
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const next = neighborPoint(
          current.layers ?? [],
          selected,
          event.key === 'Home' ? 'home' : 'end',
        );
        if (next) pick({ layerId: selected.layerId, pointId: next.id }, next.timeMs);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const point = sortedLayerPoints(current.layers ?? [], selected.layerId).find(
          (row) => row.id === selected.pointId,
        );
        if (point) beginEdit(point.id, point.label);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        void erase(selected.pointId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function pick(ref: PointRef, timeMs: number) {
    live.current.clearUnitSelection();
    setSelected(ref);
    setMenu(null);
    live.current.seekTo(timeMs / 1000);
  }

  function beginEdit(pointId: string, label: string) {
    setEditingId(pointId);
    setDraft(label);
    setMenu(null);
  }

  function fail(caught: unknown) {
    toast.showToast(pointFailureText(live.current.locale, caught), 'error');
  }

  async function createAt(layerId: string, timeMs: number, edit: boolean) {
    const current = live.current;
    if (current.sessionId === null || current.desktopCall === undefined) return;
    try {
      const point = await createPointAt({
        sessionId: current.sessionId,
        desktopCall: current.desktopCall,
        layerId,
        timeMs,
        durationSec: current.durationSec,
      });
      await current.reload();
      pick({ layerId, pointId: point.id }, point.timeMs);
      if (edit) beginEdit(point.id, '');
    } catch (caught) {
      fail(caught);
    }
  }

  async function commitLabel() {
    const current = live.current;
    const pointId = editingId;
    if (current.sessionId === null || current.desktopCall === undefined || pointId === null) return;
    const label = draft;
    try {
      await savePointLabel({
        sessionId: current.sessionId,
        desktopCall: current.desktopCall,
        pointId,
        label,
      });
      await current.reload();
      setEditingId(null);
    } catch (caught) {
      fail(caught);
    }
  }

  async function commitMove(pointId: string, timeMs: number) {
    const current = live.current;
    if (current.sessionId === null || current.desktopCall === undefined) return;
    try {
      await savePointMove({
        sessionId: current.sessionId,
        desktopCall: current.desktopCall,
        pointId,
        timeMs,
        durationSec: current.durationSec,
      });
      await current.reload();
    } catch (caught) {
      fail(caught);
    }
  }

  async function erase(pointId: string) {
    const current = live.current;
    if (current.sessionId === null || current.desktopCall === undefined) return;
    setMenu(null);
    setEditingId(null);
    try {
      await removePoint({
        sessionId: current.sessionId,
        desktopCall: current.desktopCall,
        pointId,
      });
      if (selected?.pointId === pointId) setSelected(null);
      await current.reload();
    } catch (caught) {
      fail(caught);
    }
  }

  return {
    selected,
    editingId,
    draft,
    drag,
    menu,
    setDraft,
    clearSelection: () => {
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
      event.preventDefault();
      event.stopPropagation();
      pick({ layerId, pointId: point.id }, point.timeMs);
      bindPointDrag({
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
    onPointContextMenu(event: ReactMouseEvent<HTMLElement>, layerId: string, point: PointView) {
      event.preventDefault();
      event.stopPropagation();
      pick({ layerId, pointId: point.id }, point.timeMs);
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
    cancelEdit: () => {
      setEditingId(null);
      setDraft('');
    },
    shownTimeMs: (point: PointView, layerId: string) =>
      drag?.pointId === point.id && drag.layerId === layerId ? drag.timeMs : point.timeMs,
  };
}

export type DesktopPointTrackApi = ReturnType<typeof useDesktopTranscriptionPointController>;
