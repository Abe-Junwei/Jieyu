import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useEdgeSaveTimer } from './useEdgeSaveTimer';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import {
  sharedEdge,
  type EdgeSelection,
  type TimeEdge,
  type TimedEdgeUnit,
} from './desktopTranscriptionEdge';
import {
  commitSharedEdge,
  commitUnitEdge,
  edgeFailureMessage,
  flushTypedEdge,
  applyNudge,
  openEdgeCall,
  runEdgeStack,
  watchTimeDraft,
} from './desktopTranscriptionEdgeSession';
import {
  bindEdgeKeys,
  startEdgeDrag,
  startEmptyCreate,
  type ShownPreview,
} from './desktopTranscriptionEdgePointer';

export type { ShownPreview };

interface EdgeUi {
  preview: ShownPreview | null;
  edge: EdgeSelection | null;
  reason: { unitId: string; message: string } | null;
  menu: { unitId: string; x: number; y: number } | null;
  deletePrompt: { unitId: string; tokens: number; notes: number } | null;
  raw: { unitId: string; start: string | null; end: string | null; saved: boolean };
}

const EMPTY: EdgeUi = {
  preview: null,
  edge: null,
  reason: null,
  menu: null,
  deletePrompt: null,
  raw: { unitId: '', start: null, end: null, saved: false },
};

type MenuEvent = { preventDefault(): void; clientX: number; clientY: number };
export function useDesktopTranscriptionEdgeController(input: {
  sessionId: string | null;
  manuscriptId: string | null;
  layerId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  units: readonly TimedEdgeUnit[];
  hasMedia: boolean;
  zoomPxPerSec: number;
  selectedUnitId: string | null;
  playheadMs: () => number | null;
  reload: () => Promise<void> | undefined;
  message: (
    kind: 'overlap' | 'outside' | 'short' | 'apart' | 'order' | 'failed',
    time: string,
  ) => string;
  snapMessage: (kind: 'neighbor' | 'playhead', time: string) => string;
  draftSavedMessage: string;
  notify: (message: string, tone?: 'error' | 'info') => void;
}) {
  const live = useRef(input);
  live.current = input;
  const [ui, setUi] = useState<EdgeUi>(EMPTY);
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const edited = useRef(false);
  const timer = useEdgeSaveTimer();

  useEffect(
    () =>
      bindEdgeKeys({
        selectedUnitId: () => live.current.selectedUnitId,
        edge: () => uiRef.current.edge,
        undo: () => void runStack('undo'),
        redo: () => void runStack('redo'),
        remove: (id) => void askDelete(id),
        nudge: (selected, delta) => void nudge(selected, delta),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read live.current
    [],
  );

  useEffect(() => {
    edited.current = false;
    const unitId = input.selectedUnitId;
    setUi((current) => ({
      ...current,
      edge:
        current.edge && (current.edge.unitId === unitId || current.edge.otherId === unitId)
          ? current.edge
          : null,
      raw: { unitId: unitId ?? '', start: null, end: null, saved: false },
      reason: current.reason?.unitId === unitId ? current.reason : null,
    }));
    return watchTimeDraft({
      sessionId: input.sessionId,
      desktopCall: input.desktopCall,
      unitId,
      stale: () => edited.current,
      apply: (raw) => setUi((current) => ({ ...current, raw: { unitId: unitId ?? '', ...raw } })),
    });
  }, [input.desktopCall, input.selectedUnitId, input.sessionId]);

  function call() {
    return openEdgeCall(live.current.sessionId, live.current.desktopCall);
  }
  function reject(unitId: string, error: unknown, timeMs: number) {
    const message = edgeFailureMessage(error, timeMs, live.current.message);
    setUi((current) => ({ ...current, preview: null, reason: { unitId, message } }));
    live.current.notify(message);
  }
  async function afterWrite(work: () => Promise<void>, unitId: string, timeMs: number) {
    try {
      await work();
      setUi((current) => ({
        ...current,
        preview: null,
        reason: null,
        raw: { unitId: current.raw.unitId, start: null, end: null, saved: false },
      }));
      await live.current.reload();
    } catch (error) {
      reject(unitId, error, timeMs);
    }
  }
  async function nudge(selected: EdgeSelection, delta: number) {
    const current = call();
    if (!current) return;
    const result = await applyNudge({ call: current, units: live.current.units, selected, delta });
    if (result?.failed) reject(selected.unitId, result.error, result.time);
    else if (result) await afterWrite(async () => undefined, selected.unitId, 0);
  }
  async function runStack(action: 'undo' | 'redo') {
    const current = call();
    if (!current) return;
    const result = await runEdgeStack(current, live.current.manuscriptId, action);
    if (result === 'done') await live.current.reload();
    if (result === 'failed') live.current.notify(live.current.message('failed', ''));
  }

  async function askDelete(unitId: string) {
    const current = call();
    if (!current) return;
    try {
      const preview = await current.api.previewUnitDelete(current.sessionId, unitId);
      setUi((state) => ({ ...state, menu: null, deletePrompt: { unitId, ...preview } }));
    } catch {
      live.current.notify(live.current.message('failed', ''));
    }
  }

  function beginDrag(unitId: string, edge: TimeEdge, event: ReactPointerEvent<HTMLElement>) {
    startEdgeDrag({
      unitId,
      edge,
      event,
      units: live.current.units,
      readZoom: () => live.current.zoomPxPerSec,
      playheadMs: () => live.current.playheadMs(),
      snapMessage: (kind, time) => live.current.snapMessage(kind, time),
      setPreview: (preview) => setUi((current) => ({ ...current, preview })),
      select: (next) => setUi((current) => ({ ...current, menu: null, edge: next })),
      linked:
        uiRef.current.edge?.edge === 'shared' &&
        (uiRef.current.edge.unitId === unitId || uiRef.current.edge.otherId === unitId),
      commit: (shared, time, originMs) => {
        const session = call();
        if (time === originMs || !session) return;
        const work = shared
          ? commitSharedEdge(session, shared.leftId, shared.rightId, time)
          : commitUnitEdge(session, unitId, edge, time);
        void afterWrite(() => work, unitId, time);
      },
    });
  }

  function beginCreate(event: ReactPointerEvent<HTMLDivElement>) {
    const layerId = live.current.layerId;
    if (layerId === null) return;
    startEmptyCreate({
      event,
      zoomPxPerSec: live.current.zoomPxPerSec,
      setPreview: (preview) => setUi((current) => ({ ...current, preview })),
      commit: (startMs, endMs) => {
        const session = call();
        if (!session) return;
        void session.api
          .createUnit(session.sessionId, { layerId, startMs, endMs, text: '' })
          .then(() => live.current.reload())
          .catch((error: unknown) => reject(layerId, error, endMs));
      },
    });
  }

  function schedule(edge: TimeEdge) {
    timer.schedule(() => void flush(edge));
  }

  async function flush(edge: TimeEdge) {
    const current = live.current;
    const unit = current.units.find((item) => item.id === current.selectedUnitId);
    const raw = edge === 'start' ? uiRef.current.raw.start : uiRef.current.raw.end;
    const session = call();
    if (!unit || raw === null || !session) return;
    try {
      const result = await flushTypedEdge({
        call: session,
        unit,
        edge,
        raw,
        onDraft: () => {
          setUi((state) => ({ ...state, raw: { ...state.raw, saved: true } }));
          live.current.notify(live.current.draftSavedMessage, 'info');
        },
      });
      if (result === 'commit') await afterWrite(async () => undefined, unit.id, 0);
    } catch (error) {
      reject(unit.id, error, edge === 'start' ? unit.startMs : unit.endMs);
    }
  }

  return {
    ui,
    hasMedia: input.hasMedia,
    beginDrag,
    beginCreate,
    openMenu(unitId: string, event: MenuEvent) {
      event.preventDefault();
      setUi((current) => ({ ...current, menu: { unitId, x: event.clientX, y: event.clientY } }));
    },
    closeMenu() {
      setUi((current) => ({ ...current, menu: null }));
    },
    linkShared() {
      const menu = uiRef.current.menu;
      if (!menu) return;
      const next = sharedEdge(live.current.units, menu.unitId);
      if (!next) {
        const message = live.current.message('apart', '');
        setUi((current) => ({ ...current, menu: null, reason: { unitId: menu.unitId, message } }));
        live.current.notify(message);
        return;
      }
      setUi((current) => ({ ...current, menu: null, edge: next }));
    },
    editTime(edge: TimeEdge, value: string) {
      edited.current = true;
      setUi((current) => ({
        ...current,
        raw: {
          ...current.raw,
          unitId: live.current.selectedUnitId ?? '',
          [edge]: value,
          saved: false,
        },
      }));
      schedule(edge);
    },
    flushTime(edge: TimeEdge) {
      timer.cancelIdle();
      void flush(edge);
    },
    askDelete,
    cancelDelete() {
      setUi((current) => ({ ...current, deletePrompt: null }));
    },
    confirmDelete() {
      const prompt = uiRef.current.deletePrompt;
      const session = call();
      if (!prompt || !session) return;
      void session.api
        .deleteUnit(session.sessionId, prompt.unitId)
        .then(() => {
          setUi((current) => ({ ...current, deletePrompt: null, edge: null }));
          return live.current.reload();
        })
        .catch(() => live.current.notify(live.current.message('failed', '')));
    },
  };
}
