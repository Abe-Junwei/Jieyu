import { describe, expect, it } from 'vitest';
import {
  layerDragShifts,
  resolveDesktopLayerDrop,
  type DropLayer,
  type DropLink,
} from './desktopTranscriptionLayerDrop';

const host: DropLayer = { id: 'host', contentType: 'transcription', tierType: 'time-aligned' };
const child: DropLayer = { id: 'child', contentType: 'transcription', tierType: 'time-aligned' };
const other: DropLayer = { id: 'other', contentType: 'transcription', tierType: 'time-aligned' };
const translation: DropLayer = {
  id: 'tr',
  contentType: 'translation',
  tierType: 'symbolic-association',
};
const sibling: DropLayer = {
  id: 'sib',
  contentType: 'translation',
  tierType: 'symbolic-association',
};
const sub: DropLayer = { id: 'sub', contentType: 'transcription', tierType: 'time-subdivision' };

const link = (
  layerId: string,
  hostLayerId: string,
  linkType: DropLink['linkType'] = 'free',
): DropLink => ({ layerId, hostLayerId, isPreferred: true, linkType });

describe('resolveDesktopLayerDrop', () => {
  const layers = [host, child, other, translation, sibling, sub];

  it('rejects attaching a transcription layer even when it has a legacy host', () => {
    expect(
      resolveDesktopLayerDrop({
        dragId: child.id,
        target: { kind: 'header', layerId: host.id },
        layers,
        links: [link(child.id, other.id, 'literal')],
      }),
    ).toEqual({ ok: false, reason: 'not-host' });
  });

  it('rejects attaching an independent transcription layer', () => {
    const decision = resolveDesktopLayerDrop({
      dragId: child.id,
      target: { kind: 'header', layerId: host.id },
      layers,
      links: [],
    });
    expect(decision).toEqual({ ok: false, reason: 'not-host' });
  });

  it('reorders a translation under the same host and rejects a different host', () => {
    const links = [link(translation.id, host.id), link(sibling.id, host.id)];
    expect(
      resolveDesktopLayerDrop({
        dragId: translation.id,
        target: { kind: 'header', layerId: sibling.id },
        layers,
        links,
      }),
    ).toEqual({
      ok: true,
      action: 'place',
      layerId: translation.id,
      hostLayerId: host.id,
      beforeId: sibling.id,
      anchorId: sibling.id,
      edge: 'before',
    });
    expect(
      resolveDesktopLayerDrop({
        dragId: translation.id,
        target: { kind: 'header', layerId: sibling.id },
        layers,
        links: [link(translation.id, host.id), link(sibling.id, other.id, 'direct')],
      }),
    ).toEqual({ ok: false, reason: 'same-host' });
  });

  it('replaces one translation host and rejects several', () => {
    expect(
      resolveDesktopLayerDrop({
        dragId: translation.id,
        target: { kind: 'header', layerId: other.id },
        layers,
        links: [link(translation.id, host.id, 'direct')],
      }),
    ).toMatchObject({ ok: true, action: 'set-host', hostLayerId: other.id, linkType: 'direct' });
    const many = resolveDesktopLayerDrop({
      dragId: translation.id,
      target: { kind: 'header', layerId: other.id },
      layers,
      links: [
        link(translation.id, host.id),
        { ...link(translation.id, other.id), isPreferred: false },
      ],
    });
    expect(many).toEqual({ ok: false, reason: 'multi-host' });
  });

  it('clears hosts only for a time-aligned transcription dropped on the root gap', () => {
    expect(
      resolveDesktopLayerDrop({
        dragId: child.id,
        target: { kind: 'root', index: 1 },
        layers,
        links: [link(child.id, host.id)],
      }),
    ).toEqual({ ok: true, action: 'clear', layerId: child.id, sortOrder: 1 });
    expect(
      resolveDesktopLayerDrop({
        dragId: translation.id,
        target: { kind: 'root', index: 0 },
        layers,
        links: [link(translation.id, host.id)],
      }),
    ).toEqual({ ok: false, reason: 'needs-host' });
  });

  it('rejects self, a descendant, and a time subdivision', () => {
    const links = [link(child.id, host.id), link(translation.id, child.id)];
    expect(
      resolveDesktopLayerDrop({
        dragId: host.id,
        target: { kind: 'header', layerId: host.id },
        layers,
        links,
      }),
    ).toEqual({ ok: false, reason: 'self' });
    expect(
      resolveDesktopLayerDrop({
        dragId: host.id,
        target: { kind: 'header', layerId: translation.id },
        layers,
        links,
      }),
    ).toEqual({ ok: false, reason: 'descendant' });
    expect(
      resolveDesktopLayerDrop({
        dragId: sub.id,
        target: { kind: 'header', layerId: host.id },
        layers,
        links: [],
      }),
    ).toEqual({ ok: false, reason: 'subdivision' });
  });
});

describe('layerDragShifts', () => {
  const height = 28;
  const layers = [host, child, other, translation, sibling];

  it('slides the rows between a translation and a later sibling up', () => {
    const order = [host.id, translation.id, child.id, sibling.id];
    const links = [link(translation.id, host.id), link(sibling.id, host.id)];
    const decision = resolveDesktopLayerDrop({
      dragId: translation.id,
      target: { kind: 'header', layerId: sibling.id },
      layers,
      links,
    });
    expect(
      layerDragShifts({
        order,
        draggedIds: [translation.id],
        decision,
        blockHeight: height,
        layers,
        links,
      }),
    ).toEqual(new Map([[child.id, -height]]));
  });

  it('slides the rows between a translation and an earlier sibling down', () => {
    const order = [host.id, sibling.id, translation.id];
    const links = [link(translation.id, host.id), link(sibling.id, host.id)];
    const decision = resolveDesktopLayerDrop({
      dragId: translation.id,
      target: { kind: 'header', layerId: sibling.id },
      layers,
      links,
    });
    expect(
      layerDragShifts({
        order,
        draggedIds: [translation.id],
        decision,
        blockHeight: height,
        layers,
        links,
      }),
    ).toEqual(new Map([[sibling.id, height]]));
  });

  it('opens no gap for a rejected transcription attachment', () => {
    const order = [host.id, child.id, sibling.id];
    const links = [link(child.id, host.id), link(sibling.id, host.id, 'literal')];
    const decision = resolveDesktopLayerDrop({
      dragId: child.id,
      target: { kind: 'header', layerId: host.id },
      layers,
      links,
    });
    expect(
      layerDragShifts({
        order,
        draggedIds: [child.id],
        decision,
        blockHeight: height,
        layers,
        links,
      }),
    ).toEqual(new Map());
  });

  it('slides earlier roots down when a transcription returns to the top', () => {
    const decision = resolveDesktopLayerDrop({
      dragId: other.id,
      target: { kind: 'root', index: 0 },
      layers,
      links: [link(other.id, host.id)],
    });
    expect(
      layerDragShifts({
        order: [host.id, other.id],
        draggedIds: [other.id],
        decision,
        blockHeight: height,
        layers,
        links: [link(other.id, host.id)],
      }),
    ).toEqual(new Map([[host.id, height]]));
  });

  it('slides nothing for a refused drop or a zero-height block', () => {
    const links = [link(translation.id, host.id), link(translation.id, other.id)];
    const decision = resolveDesktopLayerDrop({
      dragId: translation.id,
      target: { kind: 'header', layerId: child.id },
      layers,
      links,
    });
    expect(decision.ok).toBe(false);
    const order = [host.id, translation.id, child.id];
    expect(
      layerDragShifts({
        order,
        draggedIds: [translation.id],
        decision,
        blockHeight: height,
        layers,
        links,
      }).size,
    ).toBe(0);
    expect(
      layerDragShifts({
        order,
        draggedIds: [translation.id],
        decision: { ok: true, action: 'clear', layerId: other.id, sortOrder: 0 },
        blockHeight: 0,
        layers,
        links,
      }).size,
    ).toBe(0);
  });

  it('rejects a descendant reached only through a non-preferred host link', () => {
    const via: DropLayer = {
      id: 'via',
      contentType: 'transcription',
      tierType: 'time-aligned',
    };
    expect(
      resolveDesktopLayerDrop({
        dragId: child.id,
        target: { kind: 'header', layerId: via.id },
        layers: [...layers, via],
        links: [
          link(via.id, other.id),
          { layerId: via.id, hostLayerId: child.id, isPreferred: false, linkType: 'free' },
        ],
      }),
    ).toEqual({ ok: false, reason: 'descendant' });
  });

  it('places a same-host translation after the lower half and appends from the tail', () => {
    const later: DropLayer = {
      id: 'later',
      contentType: 'translation',
      tierType: 'symbolic-association',
    };
    const links = [
      { ...link(translation.id, host.id), sortOrder: 0 },
      { ...link(sibling.id, host.id), sortOrder: 1 },
      { ...link(later.id, host.id), sortOrder: 2 },
    ];
    const rows = [...layers, later];
    expect(
      resolveDesktopLayerDrop({
        dragId: translation.id,
        target: { kind: 'header', layerId: sibling.id, edge: 'after' },
        layers: rows,
        links,
      }),
    ).toMatchObject({
      ok: true,
      action: 'place',
      beforeId: later.id,
      edge: 'after',
      anchorId: sibling.id,
    });
    const tail = resolveDesktopLayerDrop({
      dragId: translation.id,
      target: { kind: 'tail' },
      layers: rows,
      links,
    });
    expect(tail).toMatchObject({ ok: true, action: 'place', edge: 'after', hostLayerId: host.id });
    expect(tail.ok && tail.action === 'place' ? tail.beforeId : 'present').toBeUndefined();
    expect(
      resolveDesktopLayerDrop({
        dragId: child.id,
        target: { kind: 'tail' },
        layers: rows,
        links,
      }),
    ).toEqual({ ok: false, reason: 'not-host' });
    expect(
      resolveDesktopLayerDrop({
        dragId: child.id,
        target: { kind: 'header', layerId: host.id, edge: 'after' },
        layers: rows,
        links: [link(child.id, other.id)],
      }),
    ).toEqual({ ok: false, reason: 'not-host' });
  });
});
