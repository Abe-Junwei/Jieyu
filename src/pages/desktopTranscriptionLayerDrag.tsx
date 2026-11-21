import { type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, type Locale } from '../i18n';
import {
  layerDropReasonKey,
  resolveDesktopLayerDrop,
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

/** Timeline row classes and the name-span handlers. Folded strips do not start a drag. */
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
  const moving = drag?.mark(layerId) ?? null;
  const host = drag?.dropLayerId === layerId && drag.dropKind === 'host';
  const line = drag?.dropLayerId === layerId && drag.dropKind === 'line';
  return {
    laneClass: `${moving ? ` is-drag-${moving}` : ''}${line ? ' is-drop-line' : ''}`,
    laneStyle: moving && drag ? { transform: `translateY(${drag.offset}px)` } : {},
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
  if (props.drag.reasonKey === null) return null;
  return createPortal(
    <div
      className="desktop-tx-drop-reason"
      style={{ left: props.drag.x + 12, top: props.drag.y + 16 }}
    >
      {t(props.locale, props.drag.reasonKey)}
    </div>,
    document.body,
  );
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
): Promise<void> {
  if (!decision.ok || decision.action === 'noop') return;
  if (input.sessionId === null || input.desktopCall === undefined) return;
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
  } catch (caught) {
    input.report(caught instanceof Error ? caught.message : '');
  }
}
