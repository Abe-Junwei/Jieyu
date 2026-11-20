import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import type { UnitDeletePreview } from '../app/desktopProjectReadPageAccess';
import {
  cycleEdge,
  sharedEdge,
  type EdgeSelection,
  type TimeEdge,
  edgeRejectKind,
  type TimedEdgeUnit,
} from './desktopTranscriptionEdge';
import {
  applyNudge,
  commitSharedEdge,
  commitUnitEdge,
  dropEdgeStack,
  edgeFailureMessage,
  flushTypedEdge,
  NO_CONFLICTS,
  openEdgeCall,
  rebaseTimeDraft,
  runEdgeStack,
  type StoredTimes,
} from './desktopTranscriptionEdgeSession';
import { formatPlaybackTime } from './useDesktopTranscriptionMediaController';
import { startCreate, startEdgeDrag, type ShownPreview } from './desktopTranscriptionEdgePointer';
import {
  CREATE_MIN_MS,
  routeCreate,
  type RouteLayer,
  type RouteLink,
} from './desktopTranscriptionCreateRoute';

const CREATE_REJECT = {
  short: 'createShort',
  'no-parent': 'noParent',
  'no-layer': 'noLayer',
} as const;

/** Where a drag creates: the row's layer and units (defaults: the main layer), and the lane's speaker. */
export interface CreateTarget {
  layerId?: string;
  units?: readonly TimedEdgeUnit[];
  speakerId?: string | null;
}

export type EdgeNoticeKind =
  | 'overlap'
  | 'outside'
  | 'outsideParent'
  | 'short'
  | 'createShort'
  | 'noParent'
  | 'hasChildren'
  | 'noLayer'
  | 'apart'
  | 'order'
  | 'unknown'
  | 'stale'
  | 'failed';

export interface EdgeControllerInput {
  sessionId: string | null;
  manuscriptId: string | null;
  layerId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  units: readonly TimedEdgeUnit[];
  /** The other rows' timed units (a subdivision layer keeps its own segments); linked text rows reuse `units`. */
  otherRowUnits?: readonly (readonly TimedEdgeUnit[])[];
  hasMedia: boolean;
  zoomPxPerSec: number;
  selectedUnitId: string | null;
  playheadMs: () => number | null;
  reload: () => Promise<void> | undefined;
  message: (kind: EdgeNoticeKind, time: string) => string;
  snapMessage: (kind: 'neighbor' | 'playhead', time: string) => string;
  draftSavedMessage: string;
  notify: (message: string, tone?: 'error' | 'info') => void;
  /** Gives keyboard focus back to the segment after the delete dialog closes. */
  focusUnit?: (unitId: string) => void;
  /** Every layer of the manuscript and its explicit host links; a create routes through these (ADR-0132). */
  createRoute?: { layers: readonly RouteLayer[]; links: readonly RouteLink[] };
  /** A drag that crosses existing segments selects them instead of creating one. */
  selectUnits?: (unitIds: string[]) => void;
}

export interface EdgeUi {
  preview: ShownPreview | null;
  edge: EdgeSelection | null;
  reason: { unitId: string; message: string } | null;
  menu: { unitId: string; x: number; y: number; layerId?: string; layerName?: string } | null;
  deletePrompt: { unitId: string; counts: UnitDeletePreview } | null;
  raw: { unitId: string } & StoredTimes;
  /** An undo/redo step that later edits made stale; it stays until dropped (ADR-0129 E04). */
  stale: { action: 'undo' | 'redo' } | null;
}

export const EMPTY_EDGE_UI: EdgeUi = {
  preview: null,
  edge: null,
  reason: null,
  menu: null,
  deletePrompt: null,
  raw: { unitId: '', start: null, end: null, saved: false, conflicts: NO_CONFLICTS },
  stale: null,
};

type MenuEvent = { preventDefault(): void; clientX: number; clientY: number };

/** The edge controller's actions. They read the latest input and UI through refs. */
export function createEdgeActions(ctx: {
  live: { current: EdgeControllerInput };
  uiRef: { current: EdgeUi };
  setUi: Dispatch<SetStateAction<EdgeUi>>;
  edited: { current: boolean };
}) {
  const { live, uiRef, setUi, edited } = ctx;
  const call = () => openEdgeCall(live.current.sessionId, live.current.desktopCall);
  const failed = () => live.current.notify(live.current.message('failed', ''));
  const setPreview = (preview: ShownPreview | null) =>
    setUi((current) => ({ ...current, preview }));
  /** The row a unit sits in: neighbors, snapping and shared edges all come from that row. */
  const rowOf = (unitId: string): readonly TimedEdgeUnit[] => {
    const input = live.current;
    if (input.units.some((unit) => unit.id === unitId)) return input.units;
    return (
      input.otherRowUnits?.find((row) => row.some((unit) => unit.id === unitId)) ?? input.units
    );
  };

  function reject(unitId: string, error: unknown, timeMs: number) {
    const message = edgeFailureMessage(error, timeMs, live.current.message);
    setUi((current) => ({ ...current, preview: null, reason: { unitId, message } }));
    live.current.notify(message);
  }

  async function afterWrite(work: () => Promise<void>, unitId: string, timeMs: number) {
    try {
      await work();
      edited.current = false;
      setUi((current) => ({
        ...current,
        preview: null,
        reason: null,
        raw: { ...EMPTY_EDGE_UI.raw, unitId: current.raw.unitId },
      }));
      await live.current.reload();
    } catch (error) {
      reject(unitId, error, timeMs);
    }
  }

  async function nudge(selected: EdgeSelection, delta: number) {
    const current = call();
    if (!current) return;
    const result = await applyNudge({
      call: current,
      units: rowOf(selected.unitId),
      selected,
      delta,
    });
    if (result?.failed) reject(selected.unitId, result.error, result.time);
    else if (result) await afterWrite(async () => undefined, selected.unitId, 0);
  }

  async function runStack(action: 'undo' | 'redo') {
    const current = call();
    if (!current) return;
    const result = await runEdgeStack(current, live.current.manuscriptId, action);
    if (result === 'done') {
      edited.current = false;
      setUi((state) => ({ ...state, stale: null }));
      await live.current.reload();
      return;
    }
    if (result === 'stale') {
      setUi((state) => ({ ...state, stale: { action } }));
      live.current.notify(live.current.message('stale', ''));
    }
    if (result === 'unknown') live.current.notify(live.current.message('unknown', ''));
    if (result === 'failed') failed();
  }

  async function dropStale() {
    const stale = uiRef.current.stale;
    const current = call();
    if (!stale || !current) return;
    try {
      await dropEdgeStack(current, live.current.manuscriptId, stale.action);
      setUi((state) => ({ ...state, stale: null }));
      await live.current.reload();
    } catch {
      failed();
    }
  }

  async function askDelete(unitId: string) {
    const current = call();
    if (!current) return;
    try {
      const counts = await current.api.previewUnitDelete(current.sessionId, unitId);
      setUi((state) => ({ ...state, menu: null, deletePrompt: { unitId, counts } }));
    } catch {
      failed();
    }
  }

  function closeDelete(unitId: string, deleted: boolean) {
    setUi((current) => ({
      ...current,
      deletePrompt: null,
      edge: deleted ? null : current.edge,
    }));
    if (!deleted) window.setTimeout(() => live.current.focusUnit?.(unitId), 0);
  }

  function refuse(kind: EdgeNoticeKind, timeMs: number) {
    const message = live.current.message(kind, formatPlaybackTime(timeMs / 1000));
    setUi((current) => ({ ...current, preview: null }));
    live.current.notify(message);
  }

  /** `speakerId` is the text-track lane under the press; the waveform passes nothing. */
  function create(
    event: ReactPointerEvent<HTMLElement>,
    msAt: (clientX: number) => number,
    target: CreateTarget = {},
  ) {
    const targetLayerId = target.layerId ?? live.current.layerId;
    const speakerId = target.speakerId;
    startCreate({
      event,
      msAt,
      zoomPxPerSec: live.current.zoomPxPerSec,
      units: target.units ?? live.current.units,
      playheadMs: () => live.current.playheadMs(),
      snapMessage: (kind, time) => live.current.snapMessage(kind, time),
      setPreview,
      minMs: CREATE_MIN_MS,
      tooShort: (endMs) => refuse('createShort', endMs),
      commit: (startMs, endMs) => {
        const route = routeCreate({
          targetLayerId,
          layers: live.current.createRoute?.layers ?? [],
          links: live.current.createRoute?.links ?? [],
          startMs,
          endMs,
          speakerId,
        });
        if (route.kind === 'select') {
          live.current.selectUnits?.(route.unitIds);
          return;
        }
        if (route.kind === 'reject') {
          refuse(CREATE_REJECT[route.reason], endMs);
          return;
        }
        const session = call();
        if (!session) return;
        void session.api
          .createUnit(session.sessionId, {
            layerId: route.layerId,
            startMs,
            endMs,
            text: '',
            speakerId: route.speakerId,
            parentUnitId: route.parentUnitId,
          })
          .then(() => live.current.reload())
          .catch((error: unknown) => reject(route.layerId, error, endMs));
      },
    });
  }

  async function flush(edge: TimeEdge) {
    const current = live.current;
    const unit = rowOf(current.selectedUnitId ?? '').find(
      (item) => item.id === current.selectedUnitId,
    );
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

  async function rebaseDraft(edge: TimeEdge) {
    const current = live.current;
    const unit = rowOf(current.selectedUnitId ?? '').find(
      (item) => item.id === current.selectedUnitId,
    );
    const conflict = uiRef.current.raw.conflicts[edge];
    const session = call();
    if (!unit || !conflict || !session) return;
    try {
      const result = await rebaseTimeDraft({ call: session, unit, edge, raw: conflict.rawInput });
      if (result.committed) {
        await afterWrite(async () => undefined, unit.id, 0);
        return;
      }
      setUi((state) => ({
        ...state,
        raw: { ...state.raw, saved: true, conflicts: { ...state.raw.conflicts, [edge]: null } },
      }));
      reject(unit.id, result.error, result.time);
    } catch {
      failed();
    }
  }

  async function discardDraft(edge: TimeEdge) {
    const unitId = live.current.selectedUnitId;
    const session = call();
    if (unitId === null || !session) return;
    try {
      await session.api.discardTimeDraft(session.sessionId, unitId, edge);
      setUi((state) => ({
        ...state,
        raw: {
          ...state.raw,
          [edge]: null,
          saved: false,
          conflicts: { ...state.raw.conflicts, [edge]: null },
        },
      }));
    } catch {
      failed();
    }
  }

  return {
    nudge,
    runStack,
    dropStale,
    askDelete,
    flush,
    rebaseDraft,
    discardDraft,
    cycle(unitId: string) {
      const next = cycleEdge(rowOf(unitId), unitId, uiRef.current.edge);
      if (next) setUi((current) => ({ ...current, edge: next }));
    },
    beginDrag(unitId: string, edge: TimeEdge, event: ReactPointerEvent<HTMLElement>) {
      startEdgeDrag({
        unitId,
        edge,
        event,
        units: rowOf(unitId),
        readZoom: () => live.current.zoomPxPerSec,
        playheadMs: () => live.current.playheadMs(),
        snapMessage: (kind, time) => live.current.snapMessage(kind, time),
        setPreview,
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
    },
    /** Lane track: only a press on the empty track itself; `speakerId` is that lane's speaker. */
    beginCreate(event: ReactPointerEvent<HTMLElement>, target?: CreateTarget) {
      if (event.target !== event.currentTarget) return;
      const origin = event.currentTarget;
      create(
        event,
        (clientX) =>
          ((clientX - origin.getBoundingClientRect().left) / live.current.zoomPxPerSec) * 1000,
        target,
      );
    },
    /** Waveform: a press inside an existing segment is ignored; a short press stays a click. */
    beginWaveCreate(
      event: ReactPointerEvent<HTMLElement>,
      msAt: (clientX: number) => number,
      layerId?: string | null,
    ) {
      create(event, msAt, layerId == null ? {} : { layerId });
    },
    /** `layerId` is set on a linked row: its menu may clear only that layer's body text. */
    openMenu(unitId: string, event: MenuEvent, layerId?: string, layerName?: string) {
      event.preventDefault();
      setUi((current) => ({
        ...current,
        menu: {
          unitId,
          x: event.clientX,
          y: event.clientY,
          ...(layerId === undefined ? {} : { layerId, layerName: layerName ?? '' }),
        },
      }));
    },
    clearLayerText() {
      const menu = uiRef.current.menu;
      const session = call();
      setUi((current) => ({ ...current, menu: null }));
      if (!menu?.layerId || !session) return;
      void session.api
        .updateUnitText(session.sessionId, {
          unitId: menu.unitId,
          textLayerId: menu.layerId,
          text: '',
          operationId: globalThis.crypto.randomUUID(),
        })
        .then(() => live.current.reload())
        .catch(() => failed());
    },
    closeMenu() {
      setUi((current) => ({ ...current, menu: null }));
    },
    linkShared() {
      const menu = uiRef.current.menu;
      if (!menu) return;
      const next = sharedEdge(rowOf(menu.unitId), menu.unitId);
      if (!next) {
        const message = live.current.message('apart', '');
        setUi((current) => ({ ...current, menu: null, reason: { unitId: menu.unitId, message } }));
        live.current.notify(message);
        return;
      }
      setUi((current) => ({ ...current, menu: null, edge: next }));
    },
    cancelDelete() {
      const prompt = uiRef.current.deletePrompt;
      if (prompt) closeDelete(prompt.unitId, false);
    },
    confirmDelete() {
      const prompt = uiRef.current.deletePrompt;
      const session = call();
      if (!prompt || !session) return;
      void session.api
        .deleteUnit(session.sessionId, prompt.unitId)
        .then(() => {
          closeDelete(prompt.unitId, true);
          return live.current.reload();
        })
        .catch((error: unknown) => {
          const text = error instanceof Error ? error.message : '';
          live.current.notify(live.current.message(edgeRejectKind(text), ''));
        });
    },
  };
}

export type EdgeActions = ReturnType<typeof createEdgeActions>;
