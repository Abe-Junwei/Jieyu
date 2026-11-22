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

  it('attaches a transcription layer under a transcription header and keeps an existing link type', () => {
    expect(
      resolveDesktopLayerDrop({
        dragId: child.id,
        target: { kind: 'header', layerId: host.id },
        layers,
        links: [link(child.id, other.id, 'literal')],
      }),
    ).toEqual({
      ok: true,
      action: 'set-host',
      layerId: child.id,
      hostLayerId: host.id,
      linkType: 'literal',
    });
  });

  it('writes direct when the transcription layer has no link yet', () => {
    const decision = resolveDesktopLayerDrop({
      dragId: child.id,
      target: { kind: 'header', layerId: host.id },
      layers,
      links: [],
    });
    expect(decision).toMatchObject({ ok: true, action: 'set-host', linkType: 'direct' });
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

  it('opens the gap after the host’s last remaining child', () => {
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
    ).toEqual(new Map([[sibling.id, -height]]));
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
});
