import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { buildLayerTree, emptyFold, type TreeLink } from './desktopTranscriptionLayerTree';
import { startLayerHold } from './desktopTranscriptionLayerHold';
import {
  attachReason,
  bindActiveLayerDrag,
  dragHint,
  dragMark,
  dropKind,
  dropReason,
  dragShiftPixels,
  readHit,
  returnReason,
  layerMovedUi,
  settleLayerDrop,
  type DragHint,
} from './desktopTranscriptionLayerDrag';

export { DesktopLayerDragReason, timelineDragProps } from './desktopTranscriptionLayerDrag';
import {
  layerDropReasonKey,
  resolveDesktopLayerDrop,
  type DropLayer,
  type DropLink,
  type LayerDropReasonKey,
  type LayerDropTarget,
} from './desktopTranscriptionLayerDrop';

export type LayerDragSurface = 'sidebar' | 'timeline';
export type LayerDragMark = 'only' | 'top' | 'mid' | 'bottom';
export type LayerMenuReasonKey = LayerDropReasonKey | 'app.desktopTranscription.layerAlreadyRoot';

export interface DesktopLayerDrag {
  draggedIds: readonly string[];
  mark: (layerId: string) => LayerDragMark | null;
  offset: number;
  dropLayerId: string | null;
  dropKind: 'host' | 'line' | 'root' | null;
  reasonKey: LayerDropReasonKey | null;
  x: number;
  y: number;
  shift: (layerId: string) => number;
  surface: LayerDragSurface | null;
  rootZone: boolean;
  hint: DragHint | null;
  dropEdge: 'before' | 'after' | null;
  notice: DragHint | null;
  onPointerDown: (
    layerId: string,
    surface: LayerDragSurface,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  onPointerUp: () => void;
  attachReason: (layerId: string) => LayerMenuReasonKey | null;
  returnReason: (layerId: string) => LayerMenuReasonKey | null;
  showReturn: (layerId: string) => boolean;
  attachToCurrent: (layerId: string) => void;
  returnToRoot: (layerId: string) => void;
}

interface DragPoint {
  layerId: string;
  surface: LayerDragSurface;
  originY: number;
  x: number;
  y: number;
  drop: LayerDropTarget | null;
}

const HOLD_MS: Record<LayerDragSurface, number> = { sidebar: 200, timeline: 500 };
const NO_DRAG_IDS: readonly string[] = [];
const NO_SHIFTS = new Map<string, number>();

/** Press-hold drag for layer headers. Writes happen on release, never while the pointer moves. */
export function useDesktopTranscriptionLayerDragController(input: {
  sessionId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  layers: readonly (DropLayer & { sortOrder?: number })[];
  links: readonly (DropLink & { sortOrder?: number })[];
  currentLayerId: string | null;
  refresh: () => Promise<unknown>;
  report: (message: string) => void;
  onLayerMoved?: (layerId: string, hostIds: readonly string[]) => void;
}): DesktopLayerDrag {
  const latest = useRef(input);
  latest.current = input;
  const point = useRef<DragPoint | null>(null);
  const stopHold = useRef<(() => void) | null>(null);
  const writing = useRef(false);
  const [notice, setNotice] = useState<DragHint | null>(null);
  useEffect(() => () => stopHold.current?.(), []);
  const [active, setActive] = useState(false);
  const [tick, setTick] = useState(0);
  const publish = (next: DragPoint | null) => {
    point.current = next;
    setTick((value) => value + 1);
  };
  const treeLinks = (): TreeLink[] =>
    latest.current.links.map((link) => ({
      layerId: link.layerId,
      hostLayerId: link.hostLayerId,
      isPreferred: link.isPreferred,
      sortOrder: link.sortOrder ?? 0,
      ...(link.linkType === undefined ? {} : { linkType: link.linkType }),
    }));
  const movingIds = (layerId: string) => {
    const layer = latest.current.layers.find((item) => item.id === layerId);
    const hosted = latest.current.links.some((link) => link.layerId === layerId);
    const root =
      layer?.contentType === 'transcription' && layer.tierType === 'time-aligned' && !hosted;
    if (!layer || !root) return [layerId];
    const tree = buildLayerTree(latest.current.layers, treeLinks(), emptyFold());
    const start = tree.findIndex((row) => row.layerId === layerId);
    if (start < 0) return [layerId];
    const depth = tree[start]?.depth ?? 0;
    const ids = [layerId];
    for (const row of tree.slice(start + 1)) {
      if (row.depth <= depth) break;
      ids.push(row.layerId);
    }
    return ids;
  };

  useEffect(() => {
    if (!active) return undefined;
    return bindActiveLayerDrag({ point, latest, writing, publish, setActive, setNotice });
  }, [active]);

  useEffect(() => {
    const dragging = point.current;
    const reason = dragging?.drop
      ? dropReason(latest.current, dragging.layerId, dragging.drop)
      : null;
    document.documentElement.style.cursor = dragging ? (reason ? 'not-allowed' : 'grabbing') : '';
    return () => {
      document.documentElement.style.cursor = '';
    };
  }, [active, tick]);

  const draggedIds = active && point.current ? movingIds(point.current.layerId) : NO_DRAG_IDS;
  const decision =
    active && point.current?.drop
      ? resolveDesktopLayerDrop({
          dragId: point.current.layerId,
          target: point.current.drop,
          layers: input.layers,
          links: input.links,
        })
      : null;
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const current = point.current;
  const nameOf = (id: string) => input.layers.find((layer) => layer.id === id)?.name;
  const hint = dragHint(decision, nameOf);
  const rootReason = current === null ? null : returnReason(input, current.layerId);
  const rootZone =
    active &&
    current !== null &&
    (rootReason === null || rootReason === 'app.desktopTranscription.layerAlreadyRoot');
  const shifts =
    active && current
      ? dragShiftPixels(current.surface, draggedIds, decision, input.layers, input.links)
      : NO_SHIFTS;

  return useMemo(
    () => ({
      draggedIds,
      mark: (layerId: string) => dragMark(draggedIds, layerId),
      offset: current && !reduce ? current.y - current.originY : 0,
      dropLayerId: current?.drop?.kind === 'header' ? current.drop.layerId : null,
      dropKind: dropKind(decision),
      dropEdge: decision?.ok && decision.action === 'place' ? decision.edge : null,
      reasonKey: decision && !decision.ok ? layerDropReasonKey(decision.reason) : null,
      hint,
      notice,
      surface: current?.surface ?? null,
      rootZone,
      x: current?.x ?? 0,
      y: current?.y ?? 0,
      shift: (layerId) => shifts.get(layerId) ?? 0,
      onPointerDown: (layerId, surface, event) => {
        if (writing.current) return;
        setNotice(null);
        stopHold.current?.();
        stopHold.current = startLayerHold(event, HOLD_MS[surface], (at) => {
          stopHold.current = null;
          publish({
            layerId,
            surface,
            originY: at.y,
            x: at.x,
            y: at.y,
            drop: readHit(at.x, at.y, surface),
          });
          setActive(true);
        });
      },
      onPointerUp: () => {
        stopHold.current?.();
        stopHold.current = null;
      },
      attachReason: (layerId) => attachReason(latest.current, layerId),
      returnReason: (layerId) => returnReason(latest.current, layerId),
      showReturn: (layerId) => {
        const layer = latest.current.layers.find((item) => item.id === layerId);
        return layer?.contentType === 'transcription' && layer.tierType === 'time-aligned';
      },
      attachToCurrent: (layerId) => {
        const live = latest.current;
        if (attachReason(live, layerId) !== null || live.currentLayerId === null) return;
        const next = resolveDesktopLayerDrop({
          dragId: layerId,
          target: { kind: 'header', layerId: live.currentLayerId },
          layers: live.layers,
          links: live.links,
        });
        if (next.ok) {
          void settleLayerDrop(live, next, {
            setNotice,
            writing,
            ...layerMovedUi(live.onLayerMoved),
          });
        }
      },
      returnToRoot: (layerId) => {
        const live = latest.current;
        if (returnReason(live, layerId) !== null) return;
        const next = resolveDesktopLayerDrop({
          dragId: layerId,
          target: { kind: 'root', index: 0 },
          layers: live.layers,
          links: live.links,
        });
        if (next.ok) {
          void settleLayerDrop(live, next, {
            setNotice,
            writing,
            ...layerMovedUi(live.onLayerMoved),
          });
        }
      },
    }),
    [draggedIds, decision, shifts, current, reduce, hint, notice, rootZone],
  );
}
