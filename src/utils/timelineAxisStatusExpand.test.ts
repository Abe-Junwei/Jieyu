import { describe, expect, it } from 'vitest';
import {
  hintSupportsExpandLogical,
  resolveExpandLogicalTargetSec,
} from './timelineAxisStatusExpand';

describe('timelineAxisStatusExpand', () => {
  it('resolves expand target from duration_short', () => {
    expect(
      resolveExpandLogicalTargetSec({ kind: 'duration_short', acousticSec: 10, maxUnitEndSec: 25 }),
    ).toBe(25);
    expect(
      hintSupportsExpandLogical({ kind: 'duration_short', acousticSec: 10, maxUnitEndSec: 25 }),
    ).toBe(true);
  });

  it('does not expand for acoustic_ok', () => {
    const hint = { kind: 'acoustic_ok' as const, acousticSec: 300 };
    expect(resolveExpandLogicalTargetSec(hint)).toBeNull();
    expect(hintSupportsExpandLogical(hint)).toBe(false);
  });
});
