import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { buildLayerTree, emptyFold, type TreeLink } from './desktopTranscriptionLayerTree';
import {
  attachReason,
  dragMark,
  dropKind,
  dropReason,
  dragShiftPixels,
  readHit,
  returnReason,
  writeDrop,
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

/** Press-hold drag for layer headers. Writes happen on release, never while the pointer moves. */
export function useDesktopTranscriptionLayerDragController(input: {
  sessionId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  layers: readonly (DropLayer & { sortOrder?: number })[];
  links: readonly (DropLink & { sortOrder?: number })[];
  currentLayerId: string | null;
  refresh: () => Promise<unknown>;
  report: (message: string) => void;
}): DesktopLayerDrag {
  const latest = useRef(input);
  latest.current = input;
  const point = useRef<DragPoint | null>(null);
  const timer = useRef<number | null>(null);
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
    const move = (event: PointerEvent) => {
      const current = point.current;
      if (!current) return;
      publish({
        ...current,
        x: event.clientX,
        y: event.clientY,
        drop: readHit(event.clientX, event.clientY, current.surface),
      });
    };
    const up = (event: PointerEvent) => {
      const current = point.current;
      point.current = null;
      setActive(false);
      if (!current) return;
      const drop = readHit(event.clientX, event.clientY, current.surface);
      if (!drop) return;
      const decision = resolveDesktopLayerDrop({
        dragId: current.layerId,
        target: drop,
        layers: latest.current.layers,
        links: latest.current.links,
      });
      if (decision.ok) void writeDrop(latest.current, decision);
    };
    const cancel = () => {
      point.current = null;
      setActive(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      cancel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
    };
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

  const draggedIds = active && point.current ? movingIds(point.current.layerId) : [];
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
  const shifts =
    active && current
      ? dragShiftPixels(current.surface, draggedIds, decision, input.layers, input.links)
      : new Map<string, number>();

  return {
    draggedIds,
    mark: (layerId: string) => dragMark(draggedIds, layerId),
    offset: current && !reduce ? current.y - current.originY : 0,
    dropLayerId: current?.drop?.kind === 'header' ? current.drop.layerId : null,
    dropKind: dropKind(decision),
    reasonKey: decision && !decision.ok ? layerDropReasonKey(decision.reason) : null,
    x: current?.x ?? 0,
    y: current?.y ?? 0,
    shift: (layerId) => shifts.get(layerId) ?? 0,
    onPointerDown: (layerId, surface, event) => {
      if (event.button !== 0) return;
      const el = event.currentTarget;
      const pointerId = event.pointerId;
      const origin = { x: event.clientX, y: event.clientY };
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (el instanceof HTMLElement && typeof el.setPointerCapture === 'function') {
          el.setPointerCapture(pointerId);
        }
        publish({
          layerId,
          surface,
          originY: origin.y,
          x: origin.x,
          y: origin.y,
          drop: null,
        });
        setActive(true);
      }, HOLD_MS[surface]);
    },
    onPointerUp: () => {
      if (timer.current === null) return;
      window.clearTimeout(timer.current);
      timer.current = null;
    },
    attachReason: (layerId) => attachReason(input, layerId),
    returnReason: (layerId) => returnReason(input, layerId),
    showReturn: (layerId) => {
      const layer = input.layers.find((item) => item.id === layerId);
      return layer?.contentType === 'transcription' && layer.tierType === 'time-aligned';
    },
    attachToCurrent: (layerId) => {
      if (attachReason(input, layerId) !== null || input.currentLayerId === null) return;
      const next = resolveDesktopLayerDrop({
        dragId: layerId,
        target: { kind: 'header', layerId: input.currentLayerId },
        layers: input.layers,
        links: input.links,
      });
      if (next.ok) void writeDrop(input, next);
    },
    returnToRoot: (layerId) => {
      if (returnReason(input, layerId) !== null) return;
      const next = resolveDesktopLayerDrop({
        dragId: layerId,
        target: { kind: 'root', index: Number.MAX_SAFE_INTEGER },
        layers: input.layers,
        links: input.links,
      });
      if (next.ok) void writeDrop(input, next);
    },
  };
}
