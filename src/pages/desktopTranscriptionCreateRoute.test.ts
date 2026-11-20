import { describe, expect, it } from 'vitest';
import {
  resolveCreateSourceLayer,
  routeCreate,
  type RouteLayer,
  type RouteLink,
} from './desktopTranscriptionCreateRoute';

const unit = (id: string, startMs: number, endMs: number, speakerId: string | null = null) => ({
  id,
  startMs,
  endMs,
  speakerId,
});

const layer = (
  id: string,
  tierType: string,
  contentType: string,
  units: RouteLayer['units'] = [],
): RouteLayer => ({ id, tierType, contentType, units });

const link = (
  layerId: string,
  hostLayerId: string,
  isPreferred = false,
  sortOrder = 0,
): RouteLink => ({
  layerId,
  hostLayerId,
  isPreferred,
  sortOrder,
});

const txA = layer('tx-a', 'time-aligned', 'transcription', [unit('a1', 1000, 2000, 'spk-1')]);
const txB = layer('tx-b', 'time-aligned', 'transcription');
const tr = layer('tr', 'symbolic-association', 'translation');
const sub = layer('sub', 'time-subdivision', 'transcription');

describe('desktop create routing', () => {
  it('defaults to the transcription layer and routes a linked text layer to its preferred host', () => {
    expect(resolveCreateSourceLayer(null, [tr, txA, txB], [])?.id).toBe('tx-a');
    expect(
      resolveCreateSourceLayer('tr', [txA, txB, tr], [link('tr', 'tx-a'), link('tr', 'tx-b', true)])
        ?.id,
    ).toBe('tx-b');
    expect(
      resolveCreateSourceLayer('tr', [txB, tr], [link('tr', 'tx-a', true), link('tr', 'tx-b')])?.id,
    ).toBe('tx-b');
    expect(resolveCreateSourceLayer('tr', [txA, tr], [])).toBeNull();
    expect(resolveCreateSourceLayer('tx-b', [txA, txB], [])?.id).toBe('tx-b');
  });

  it('rejects a drag under 50ms and turns a drag over a segment into a selection', () => {
    const base = { targetLayerId: 'tx-a', layers: [txA], links: [] };
    expect(routeCreate({ ...base, startMs: 0, endMs: 49 })).toEqual({
      kind: 'reject',
      reason: 'short',
    });
    expect(routeCreate({ ...base, startMs: 500, endMs: 1500 })).toEqual({
      kind: 'select',
      unitIds: ['a1'],
    });
    expect(routeCreate({ ...base, startMs: 2000, endMs: 2050 })).toEqual({
      kind: 'create',
      layerId: 'tx-a',
      speakerId: null,
      parentUnitId: null,
      startMs: 2000,
      endMs: 2050,
    });
  });

  it('lets another speaker lane overlap but not the same one', () => {
    const base = { targetLayerId: 'tx-a', layers: [txA], links: [], startMs: 1200, endMs: 1800 };
    expect(routeCreate({ ...base, speakerId: 'spk-2' })).toMatchObject({
      kind: 'create',
      speakerId: 'spk-2',
    });
    expect(routeCreate({ ...base, speakerId: 'spk-1' })).toEqual({
      kind: 'select',
      unitIds: ['a1'],
    });
  });

  it('places a subdivision fully inside a host parent and inherits its speaker', () => {
    const layers = [txA, sub];
    const links = [link('sub', 'tx-a', true)];
    expect(
      routeCreate({ targetLayerId: 'sub', layers, links, startMs: 1100, endMs: 1500 }),
    ).toEqual({
      kind: 'create',
      layerId: 'sub',
      speakerId: 'spk-1',
      parentUnitId: 'a1',
      startMs: 1100,
      endMs: 1500,
    });
    expect(
      routeCreate({ targetLayerId: 'sub', layers, links, startMs: 1500, endMs: 2500 }),
    ).toEqual({ kind: 'reject', reason: 'no-parent' });
  });
});
