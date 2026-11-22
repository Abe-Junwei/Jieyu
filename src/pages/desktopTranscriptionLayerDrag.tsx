import { type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, tf, type Locale } from '../i18n';
import {
  layerDragShifts,
  layerDropReasonKey,
  resolveDesktopLayerDrop,
  revealHostIds,
  type DropLayer,
  type DropLink,
  type LayerDrop,
  type LayerDropReasonKey,
  type LayerDropTarget,
} from './desktopTranscriptionLayerDrop';
import type {
  DesktopLayerDrag,
  LayerDragMark,
  LayerDragSurface,
  LayerMenuReasonKey,
} from './useDesktopTranscriptionLayerDragController';

export type DragHint =
  | { kind: 'attach' | 'before' | 'after'; name: Record<string, string> | undefined }
  | { kind: 'root' };

const HINT_KEY = {
  attach: 'app.desktopTranscription.layerHintAttach',
  before: 'app.desktopTranscription.layerHintBefore',
  after: 'app.desktopTranscription.layerHintAfter',
  root: 'app.desktopTranscription.layerHintRoot',
} as const;

const DONE_KEY = {
  attach: 'app.desktopTranscription.layerDoneAttach',
  before: 'app.desktopTranscription.layerDoneBefore',
  after: 'app.desktopTranscription.layerDoneAfter',
  root: 'app.desktopTranscription.layerDoneRoot',
} as const;

export function dragHint(
  decision: LayerDrop | null,
  nameOf: (id: string) => Record<string, string> | undefined,
): DragHint | null {
  if (decision === null || !decision.ok || decision.action === 'noop') return null;
  if (decision.action === 'clear') return { kind: 'root' };
  if (decision.action === 'set-host') return { kind: 'attach', name: nameOf(decision.hostLayerId) };
  if (decision.action === 'place') return { kind: decision.edge, name: nameOf(decision.anchorId) };
  const unreachable: never = decision;
  return unreachable;
}

function hintText(locale: Locale, hint: DragHint, done: boolean): string {
  const key = done ? DONE_KEY[hint.kind] : HINT_KEY[hint.kind];
  if (hint.kind === 'root') return t(locale, key);
  return tf(locale, key, { name: hintName(hint.name, locale) });
}

function hintName(name: Record<string, string> | undefined, locale: Locale): string {
  if (name === undefined) return '';
  const preferred = locale.startsWith('zh') ? (name.zh ?? name.en) : (name.en ?? name.zh);
  return (preferred ?? Object.values(name)[0] ?? '').trim();
}
export function timelineDragProps(
  drag: DesktopLayerDrag | undefined,
  layerId: string,
  folded: boolean,
): {
  laneClass: string;
  laneStyle: { transform: string } | Record<string, never>;
  label: {
    dragClassName?: string;
    onLayerPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
    onLayerPointerUp?: () => void;
  };
} {
  const onSurface = drag?.surface === 'timeline';
  const moving = onSurface ? (drag?.mark(layerId) ?? null) : null;
  const peer = !onSurface && drag?.mark(layerId) !== null && drag?.mark(layerId) !== undefined;
  const host = onSurface && drag?.dropLayerId === layerId && drag.dropKind === 'host';
  const line = onSurface && drag?.dropLayerId === layerId && drag.dropKind === 'line';
  const after = line && drag?.dropEdge === 'after';
  const shift = !onSurface || moving || drag === undefined ? 0 : drag.shift(layerId);
  return {
    laneClass: `${moving ? ` is-drag-${moving}` : ''}${peer ? ' is-drag-peer' : ''}${shift === 0 ? '' : ' is-drag-shift'}${line ? ' is-drop-line' : ''}${after ? ' is-drop-after' : ''}`,
    laneStyle:
      moving && drag
        ? { transform: `translateY(${drag.offset}px)` }
        : shift === 0
          ? {}
          : { transform: `translateY(${shift}px)` },
    label:
      folded || drag === undefined
        ? {}
        : {
            ...(host ? { dragClassName: ' is-drop-host' } : {}),
            onLayerPointerDown: (event) => drag.onPointerDown(layerId, 'timeline', event),
            onLayerPointerUp: () => drag.onPointerUp(),
          },
  };
}

export function DesktopLayerDragReason(props: { locale: Locale; drag: DesktopLayerDrag }) {
  const hint = props.drag.reasonKey === null ? props.drag.hint : null;
  const text =
    props.drag.reasonKey !== null
      ? t(props.locale, props.drag.reasonKey)
      : hint
        ? hintText(props.locale, hint, false)
        : null;
  const done = props.drag.notice;
  return (
    <>
      {done ? (
        <div className="desktop-tx-drag-live" role="status">
          {hintText(props.locale, done, true)}
        </div>
      ) : null}
      {text === null
        ? null
        : createPortal(
            <div
              className="desktop-tx-drop-reason"
              style={chipPosition(props.drag.x, props.drag.y)}
            >
              {text}
            </div>,
            document.body,
          )}
    </>
  );
}

function chipPosition(x: number, y: number): { left: number; top: number } {
  const width = 240;
  const pad = 8;
  const height = 40;
  let left = x + 12;
  let top = y + 16;
  if (typeof window !== 'undefined') {
    if (left + width > window.innerWidth - pad) left = Math.max(pad, x - width - 12);
    if (top + height > window.innerHeight - pad) top = Math.max(pad, y - height - 8);
  }
  return { left, top };
}

export function dragMark(ids: readonly string[], layerId: string): LayerDragMark | null {
  const index = ids.indexOf(layerId);
  if (index < 0) return null;
  if (ids.length === 1) return 'only';
  if (index === 0) return 'top';
  if (index === ids.length - 1) return 'bottom';
  return 'mid';
}

export function dropKind(decision: LayerDrop | null): 'host' | 'line' | 'root' | null {
  if (!decision?.ok) return null;
  if (decision.action === 'set-host') return 'host';
  if (decision.action === 'place') return 'line';
  if (decision.action === 'clear') return 'root';
  return null;
}

export function dropReason(
  input: { layers: readonly DropLayer[]; links: readonly DropLink[] },
  dragId: string,
  target: LayerDropTarget,
): LayerDropReasonKey | null {
  const decision = resolveDesktopLayerDrop({
    dragId,
    target,
    layers: input.layers,
    links: input.links,
  });
  return decision.ok ? null : layerDropReasonKey(decision.reason);
}

export function readHit(x: number, y: number, surface: LayerDragSurface): LayerDropTarget | null {
  const laidOut = layoutHit(x, y, surface);
  if (laidOut !== undefined) return laidOut;
  return elementHit(x, y, surface);
}

/** Rows currently painted on one surface, top to bottom. Hidden folded children are absent. */
export function visibleDragIds(surface: LayerDragSurface): string[] {
  return [...document.querySelectorAll<HTMLElement>(surfaceRows(surface))]
    .map((row) => row.getAttribute('data-layer-id'))
    .filter((id): id is string => id !== null);
}

/** Sum of the dragged rows' layout heights on this surface. Translate does not change it. */
export function dragBlockHeight(surface: LayerDragSurface, draggedIds: readonly string[]): number {
  return draggedIds.reduce((total, id) => {
    const row = document.querySelector<HTMLElement>(
      `[data-layer-id="${id}"][data-drag-surface="${surface}"]`,
    );
    return total + (row?.offsetHeight ?? 0);
  }, 0);
}

export function dragShiftPixels(
  surface: LayerDragSurface,
  draggedIds: readonly string[],
  decision: LayerDrop | null,
  layers: readonly DropLayer[],
  links: readonly DropLink[],
): ReadonlyMap<string, number> {
  return layerDragShifts({
    order: visibleDragIds(surface),
    draggedIds,
    decision,
    blockHeight: dragBlockHeight(surface, draggedIds),
    layers,
    links,
  });
}

function surfaceRows(surface: LayerDragSurface): string {
  return `[data-layer-id][data-drag-surface="${surface}"]`;
}

/** Hit the row's layout slot, subtracting its live translate so a slide cannot move the target. */
function layoutHit(
  x: number,
  y: number,
  surface: LayerDragSurface,
): LayerDropTarget | null | undefined {
  const rows = [...document.querySelectorAll<HTMLElement>(surfaceRows(surface))];
  const root = document.querySelector<HTMLElement>(
    `[data-drop="root"][data-drag-surface="${surface}"]`,
  );
  if (rows.length === 0 && root === null) return undefined;
  if (root !== null && covers(root, x, y, 0)) {
    return { kind: 'root', index: Number(root.getAttribute('data-drop-index') ?? '0') };
  }
  for (const row of rows) {
    const layerId = row.getAttribute('data-layer-id');
    if (layerId !== null && covers(row, x, y, appliedTranslateY(row))) {
      const rect = row.getBoundingClientRect();
      const top = rect.top - appliedTranslateY(row);
      const edge = y < top + rect.height / 2 ? 'before' : 'after';
      return { kind: 'header', layerId, edge };
    }
  }
  const tail = document.querySelector<HTMLElement>(
    `[data-drop="tail"][data-drag-surface="${surface}"]`,
  );
  if (tail !== null && covers(tail, x, y, 0)) return { kind: 'tail' };
  return null;
}

function covers(el: HTMLElement, x: number, y: number, translateY: number): boolean {
  const rect = el.getBoundingClientRect();
  const top = rect.top - translateY;
  return x >= rect.left && x <= rect.right && y >= top && y < top + rect.height;
}

function appliedTranslateY(el: HTMLElement): number {
  const raw = getComputedStyle(el).transform;
  const match = /matrix\(([^)]+)\)/.exec(raw);
  const translateY = Number(match?.[1]?.split(',')[5]);
  return Number.isFinite(translateY) ? translateY : 0;
}

function elementHit(x: number, y: number, surface: LayerDragSurface): LayerDropTarget | null {
  if (typeof document.elementFromPoint !== 'function') return null;
  const node = document.elementFromPoint(x, y);
  if (!node) return null;
  const root = node.closest('[data-drop="root"]');
  if (root?.getAttribute('data-drag-surface') === surface) {
    return { kind: 'root', index: Number(root.getAttribute('data-drop-index') ?? '0') };
  }
  const row = node.closest('[data-layer-id]');
  if (row?.getAttribute('data-drag-surface') !== surface) return null;
  const layerId = row.getAttribute('data-layer-id');
  return layerId === null ? null : { kind: 'header', layerId };
}

function isTimeTranscription(layer: DropLayer | undefined): boolean {
  return layer?.contentType === 'transcription' && layer.tierType === 'time-aligned';
}

export function attachReason(
  input: {
    layers: readonly DropLayer[];
    links: readonly DropLink[];
    currentLayerId: string | null;
  },
  layerId: string,
): LayerMenuReasonKey | null {
  if (input.currentLayerId === null) return layerDropReasonKey('not-host');
  const decision = resolveDesktopLayerDrop({
    dragId: layerId,
    target: { kind: 'header', layerId: input.currentLayerId },
    layers: input.layers,
    links: input.links,
  });
  if (!decision.ok) return layerDropReasonKey(decision.reason);
  return decision.action === 'set-host' ? null : layerDropReasonKey('not-host');
}

export function returnReason(
  input: { layers: readonly DropLayer[]; links: readonly DropLink[] },
  layerId: string,
): LayerMenuReasonKey | null {
  if (!isTimeTranscription(input.layers.find((layer) => layer.id === layerId))) {
    return layerDropReasonKey('needs-host');
  }
  if (!input.links.some((link) => link.layerId === layerId)) {
    return 'app.desktopTranscription.layerAlreadyRoot';
  }
  return null;
}

export async function writeDrop(
  input: {
    sessionId: string | null;
    desktopCall: DesktopReadHost['desktopCall'] | undefined;
    refresh: () => Promise<unknown>;
    report: (message: string) => void;
  },
  decision: LayerDrop,
): Promise<boolean> {
  if (!decision.ok || decision.action === 'noop') return false;
  if (input.sessionId === null || input.desktopCall === undefined) return false;
  try {
    if (decision.action === 'set-host') {
      await input.desktopCall(input.sessionId, 'layers.setHosts', {
        layerId: decision.layerId,
        hostLayerIds: [decision.hostLayerId],
        preferredHostLayerId: decision.hostLayerId,
        linkType: decision.linkType,
        append: true,
      });
    } else if (decision.action === 'clear') {
      await input.desktopCall(input.sessionId, 'layers.clearHosts', {
        layerId: decision.layerId,
        sortOrder: decision.sortOrder,
      });
    } else if (decision.action === 'place') {
      await input.desktopCall(input.sessionId, 'layers.place', {
        layerId: decision.layerId,
        ...(decision.hostLayerId === undefined ? {} : { hostLayerId: decision.hostLayerId }),
        ...(decision.beforeId === undefined ? {} : { beforeId: decision.beforeId }),
      });
    } else {
      const unreachable: never = decision;
      return unreachable;
    }
    await input.refresh();
    return true;
  } catch (caught) {
    input.report(caught instanceof Error ? caught.message : '');
    return false;
  }
}

export function layerMovedUi(
  onMoved: ((layerId: string, hostIds: readonly string[]) => void) | undefined,
): { onMoved?: (layerId: string, hostIds: readonly string[]) => void } {
  return onMoved === undefined ? {} : { onMoved };
}

/** Write, then show the result. A failed write leaves the tree and reports the error. */
export async function settleLayerDrop(
  input: Parameters<typeof writeDrop>[0] & {
    layers: readonly DropLayer[];
    links: readonly DropLink[];
  },
  decision: LayerDrop,
  ui: {
    setNotice: (hint: DragHint | null) => void;
    writing: { current: boolean };
    onMoved?: (layerId: string, hostIds: readonly string[]) => void;
  },
): Promise<void> {
  if (!decision.ok || decision.action === 'noop' || ui.writing.current) return;
  ui.writing.current = true;
  try {
    const hint = dragHint(decision, (id) => input.layers.find((layer) => layer.id === id)?.name);
    const wrote = await writeDrop(input, decision);
    if (!wrote) return;
    ui.setNotice(hint);
    ui.onMoved?.(decision.layerId, revealHostIds(decision, input.links));
    // Reveal updates React state; locate both surfaces after that update is painted.
    window.requestAnimationFrame(() => {
      document
        .querySelectorAll<HTMLElement>(`[data-layer-id="${decision.layerId}"][data-drag-surface]`)
        .forEach((row) => {
          if (row.getClientRects().length > 0)
            row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
    });
  } finally {
    ui.writing.current = false;
  }
}

type ActivePoint = {
  layerId: string;
  surface: LayerDragSurface;
  originY: number;
  x: number;
  y: number;
  drop: LayerDropTarget | null;
};

/** Pointer listeners for a drag that has already started. */
export function bindActiveLayerDrag(input: {
  point: { current: ActivePoint | null };
  latest: {
    current: Parameters<typeof writeDrop>[0] & {
      layers: readonly DropLayer[];
      links: readonly DropLink[];
      onLayerMoved?: (layerId: string, hostIds: readonly string[]) => void;
    };
  };
  writing: { current: boolean };
  publish: (next: ActivePoint) => void;
  setActive: (active: boolean) => void;
  setNotice: (hint: DragHint | null) => void;
}): () => void {
  const move = (event: PointerEvent) => {
    const current = input.point.current;
    if (!current) return;
    input.publish({
      ...current,
      x: event.clientX,
      y: event.clientY,
      drop: readHit(event.clientX, event.clientY, current.surface),
    });
  };
  const up = (event: PointerEvent) => {
    const current = input.point.current;
    input.point.current = null;
    input.setActive(false);
    if (!current || input.writing.current) return;
    const drop = readHit(event.clientX, event.clientY, current.surface);
    if (!drop) return;
    const decision = resolveDesktopLayerDrop({
      dragId: current.layerId,
      target: drop,
      layers: input.latest.current.layers,
      links: input.latest.current.links,
    });
    if (!decision.ok || decision.action === 'noop') return;
    void settleLayerDrop(input.latest.current, decision, {
      setNotice: input.setNotice,
      writing: input.writing,
      ...layerMovedUi(input.latest.current.onLayerMoved),
    });
  };
  const cancel = () => {
    input.point.current = null;
    input.setActive(false);
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') cancel();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  window.addEventListener('keydown', key);
  return () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('blur', cancel);
    window.removeEventListener('keydown', key);
  };
}
