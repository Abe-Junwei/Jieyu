import { describe, expect, it } from 'vitest';
import {
  overrideMasksAuthoritative,
  putInflightSelfCertaintyOverrides,
  reconcileSettledSelfCertaintyOverrides,
  rollbackSelfCertaintyOverrides,
  settleSelfCertaintyOverrides,
  type SelfCertaintyOverrideEntry,
} from './selfCertaintyOptimisticOverride';

const segmentsA = { id: 'segments-a' };
const segmentsB = { id: 'segments-b' };
const unitsA = { id: 'units-a' };
const unitsB = { id: 'units-b' };

function entry(
  overrides: Partial<SelfCertaintyOverrideEntry> &
    Pick<SelfCertaintyOverrideEntry, 'generation' | 'phase'>,
): SelfCertaintyOverrideEntry {
  return {
    unitId: 'seg-1',
    layerId: 'layer-a',
    value: 'certain',
    kind: 'segment',
    segmentsByLayerAtSettle: null,
    unitsAtSettle: null,
    ...overrides,
  };
}

describe('selfCertaintyOptimisticOverride', () => {
  it('rolls back only the failed generation', () => {
    const inflight = putInflightSelfCertaintyOverrides(new Map(), [
      {
        key: 'layer-a::seg-1',
        unitId: 'seg-1',
        layerId: 'layer-a',
        value: 'certain',
        generation: 2,
        kind: 'segment',
      },
    ]);

    const rolled = rollbackSelfCertaintyOverrides(inflight, [
      { key: 'layer-a::seg-1', generation: 1 },
    ]);

    expect(rolled).toBe(inflight);
    expect(
      rollbackSelfCertaintyOverrides(inflight, [{ key: 'layer-a::seg-1', generation: 2 }]).has(
        'layer-a::seg-1',
      ),
    ).toBe(false);
  });

  it('drops a successful override once the read model matches, and keeps it while the same snapshot is stale', () => {
    const inflight = putInflightSelfCertaintyOverrides(new Map(), [
      {
        key: 'layer-a::seg-1',
        unitId: 'seg-1',
        layerId: 'layer-a',
        value: 'certain',
        generation: 1,
        kind: 'segment',
      },
    ]);
    const stillStale = settleSelfCertaintyOverrides(inflight, {
      keys: [{ key: 'layer-a::seg-1', generation: 1 }],
      authoritativeFor: () => undefined,
      segmentsByLayer: segmentsA,
      units: unitsA,
      segmentsByLayerAtStart: segmentsA,
      unitsAtStart: unitsA,
    });
    const settled = stillStale.get('layer-a::seg-1');
    expect(settled?.phase).toBe('settled');
    expect(
      overrideMasksAuthoritative(settled!, undefined, {
        segmentsByLayer: segmentsA,
        units: unitsA,
      }),
    ).toBe(true);

    const caughtUp = settleSelfCertaintyOverrides(inflight, {
      keys: [{ key: 'layer-a::seg-1', generation: 1 }],
      authoritativeFor: () => 'certain',
      segmentsByLayer: segmentsA,
      units: unitsA,
      segmentsByLayerAtStart: segmentsA,
      unitsAtStart: unitsA,
    });
    expect(caughtUp.has('layer-a::seg-1')).toBe(false);
  });

  it('drops a settled override when a newer segment snapshot disagrees', () => {
    const settled = new Map<string, SelfCertaintyOverrideEntry>([
      [
        'layer-a::seg-1',
        entry({
          generation: 1,
          phase: 'settled',
          segmentsByLayerAtSettle: segmentsA,
          unitsAtSettle: unitsA,
        }),
      ],
    ]);

    const reconciled = reconcileSettledSelfCertaintyOverrides(settled, {
      authoritativeFor: () => 'uncertain',
      segmentsByLayer: segmentsB,
      units: unitsA,
    });

    expect(reconciled.has('layer-a::seg-1')).toBe(false);
    expect(
      overrideMasksAuthoritative(settled.get('layer-a::seg-1')!, 'uncertain', {
        segmentsByLayer: segmentsB,
        units: unitsA,
      }),
    ).toBe(false);
  });

  it('does not let a segment snapshot change clear an in-flight or unrelated unit override', () => {
    const prev = new Map<string, SelfCertaintyOverrideEntry>([
      ['layer-a::seg-1', entry({ generation: 4, phase: 'inflight' })],
      [
        'layer-utt::utt-1',
        entry({
          unitId: 'utt-1',
          layerId: 'layer-utt',
          generation: 3,
          phase: 'settled',
          kind: 'unit',
          value: 'uncertain',
          segmentsByLayerAtSettle: segmentsA,
          unitsAtSettle: unitsA,
        }),
      ],
    ]);

    const reconciled = reconcileSettledSelfCertaintyOverrides(prev, {
      authoritativeFor: () => undefined,
      segmentsByLayer: segmentsB,
      units: unitsA,
    });

    expect(reconciled.get('layer-a::seg-1')?.phase).toBe('inflight');
    expect(reconciled.get('layer-utt::utt-1')?.value).toBe('uncertain');

    const unitMoved = reconcileSettledSelfCertaintyOverrides(reconciled, {
      authoritativeFor: () => undefined,
      segmentsByLayer: segmentsB,
      units: unitsB,
    });
    expect(unitMoved.has('layer-utt::utt-1')).toBe(false);
    expect(unitMoved.get('layer-a::seg-1')?.phase).toBe('inflight');
  });

  it('ignores a stale success when a newer generation owns the key', () => {
    const newer = putInflightSelfCertaintyOverrides(new Map(), [
      {
        key: 'layer-a::seg-1',
        unitId: 'seg-1',
        layerId: 'layer-a',
        value: 'certain',
        generation: 2,
        kind: 'segment',
      },
    ]);
    const settled = settleSelfCertaintyOverrides(newer, {
      keys: [{ key: 'layer-a::seg-1', generation: 1 }],
      authoritativeFor: () => 'uncertain',
      segmentsByLayer: segmentsB,
      units: unitsB,
      segmentsByLayerAtStart: segmentsA,
      unitsAtStart: unitsA,
    });
    expect(settled).toBe(newer);
    expect(settled.get('layer-a::seg-1')?.generation).toBe(2);
  });
});
