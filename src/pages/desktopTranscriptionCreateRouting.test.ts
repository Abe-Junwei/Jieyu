import { describe, expect, it } from 'vitest';
import { routeUnitCreate, type CreateRoutingLayer } from './desktopTranscriptionCreateRouting';

const parentUnit = { id: 'u1', speakerId: 's1', startMs: 0, endMs: 5000 };
const layers: CreateRoutingLayer[] = [
  { id: 'tx', tierType: 'time-aligned', parentId: null, units: [parentUnit] },
  { id: 'sub', tierType: 'time-subdivision', parentId: 'tx', units: [] },
  { id: 'gloss', tierType: 'symbolic-association', parentId: 'tx', units: [] },
];

describe('routeUnitCreate', () => {
  it('creates in an independent time-aligned layer', () => {
    expect(routeUnitCreate(layers, 'tx', 6000, 7000)).toEqual({
      ok: true,
      layerId: 'tx',
      parentUnitId: null,
      speakerId: null,
      startMs: 6000,
      endMs: 7000,
    });
  });

  it('puts a subdivision under the containing parent and inherits its speaker', () => {
    expect(routeUnitCreate(layers, 'sub', 100, 200)).toEqual({
      ok: true,
      layerId: 'sub',
      parentUnitId: 'u1',
      speakerId: 's1',
      startMs: 100,
      endMs: 200,
    });
  });

  it('refuses a subdivision outside every parent', () => {
    expect(routeUnitCreate(layers, 'sub', 4000, 6000)).toEqual({ ok: false, reason: 'no-parent' });
  });

  it('routes a symbolic layer to its time-aligned host', () => {
    expect(routeUnitCreate(layers, 'gloss', 6000, 7000)).toMatchObject({ ok: true, layerId: 'tx' });
  });

  it('trims a drag that runs into a neighbour and inherits its speaker', () => {
    expect(routeUnitCreate(layers, 'tx', 4000, 8000)).toMatchObject({
      ok: true,
      speakerId: 's1',
      startMs: 5000,
      endMs: 8000,
    });
  });

  it('rejects a drag fully covered by an existing unit', () => {
    expect(routeUnitCreate(layers, 'tx', 100, 200)).toEqual({ ok: false, reason: 'overlap' });
  });
});
