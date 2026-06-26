import { describe, expect, it } from 'vitest';
import { resolvePostImportLogicalExpandTargetSec } from './timelineImportPostApply';

describe('timelineImportPostApply', () => {
  it('returns null when no expandable mismatch kinds', () => {
    expect(
      resolvePostImportLogicalExpandTargetSec([
        {
          kind: 'acoustic_shorter_than_segments',
          incomingSec: 300,
          establishedSpanSec: 1800,
          maxUnitEndSec: 350,
        },
      ]),
    ).toBeNull();
  });
});
