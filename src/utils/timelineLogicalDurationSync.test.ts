import { describe, expect, it } from 'vitest';
import {
  hasEstablishedTimedUnits,
  maxTimedUnitEndSec,
  resolveLogicalDurationAfterAcousticImport,
  resolveLogicalDurationSecAfterTimedContentChange,
} from './timelineLogicalDurationSync';

describe('timelineLogicalDurationSync', () => {
  it('maxTimedUnitEndSec ignores invalid endTime', () => {
    expect(maxTimedUnitEndSec([{ endTime: 10 }, { endTime: Number.NaN }, {}])).toBe(10);
  });

  it('hasEstablishedTimedUnits is false when no timed segments', () => {
    expect(hasEstablishedTimedUnits([])).toBe(false);
    expect(hasEstablishedTimedUnits([{ endTime: 0.01 }])).toBe(false);
    expect(hasEstablishedTimedUnits([{ endTime: 1 }])).toBe(true);
  });

  it('resolveLogicalDurationSecAfterTimedContentChange resets blank slate to default canvas', () => {
    expect(
      resolveLogicalDurationSecAfterTimedContentChange({
        maxUnitEndSec: 0,
        existingLogicalDurationSec: 13231,
        hasTimedUnits: false,
      }),
    ).toBe(1800);
  });

  it('resolveLogicalDurationSecAfterTimedContentChange preserves segment span when timed units remain', () => {
    expect(
      resolveLogicalDurationSecAfterTimedContentChange({
        maxUnitEndSec: 102.75,
        existingLogicalDurationSec: 8,
        hasTimedUnits: true,
      }),
    ).toBe(102.75);
  });

  it('resolveLogicalDurationAfterAcousticImport aligns default blank canvas to acoustic duration', () => {
    expect(
      resolveLogicalDurationAfterAcousticImport({
        prevLogicalSec: 1800,
        acousticDurationSec: 180,
        maxUnitEndSec: 0,
        didRemap: false,
      }),
    ).toBe(180);
  });

  it('resolveLogicalDurationAfterAcousticImport preserves established logical when timed units exist', () => {
    expect(
      resolveLogicalDurationAfterAcousticImport({
        prevLogicalSec: 200,
        acousticDurationSec: 300,
        maxUnitEndSec: 80,
        didRemap: false,
      }),
    ).toBe(200);
  });
});
