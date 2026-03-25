import { describe, expect, it } from 'vitest';
import {
  INITIAL_OVERLAP_CYCLE_TELEMETRY,
  updateOverlapCycleTelemetry,
} from './overlapCycleTelemetry';

describe('overlap cycle telemetry', () => {
  it('accumulates count and averages for repeated cycles', () => {
    const s1 = updateOverlapCycleTelemetry(INITIAL_OVERLAP_CYCLE_TELEMETRY, {
      utteranceId: 'u1',
      index: 2,
      total: 3,
    });
    const s2 = updateOverlapCycleTelemetry(s1, {
      utteranceId: 'u1',
      index: 3,
      total: 3,
    });

    expect(s2.cycleCount).toBe(2);
    expect(s2.avgStep).toBe(1);
    expect(s2.avgCandidateTotal).toBe(3);
  });

  it('resets step baseline when utterance id changes', () => {
    const s1 = updateOverlapCycleTelemetry(INITIAL_OVERLAP_CYCLE_TELEMETRY, {
      utteranceId: 'u1',
      index: 2,
      total: 4,
    });
    const s2 = updateOverlapCycleTelemetry(s1, {
      utteranceId: 'u2',
      index: 1,
      total: 2,
    });

    expect(s2.cycleCount).toBe(2);
    expect(s2.stepSum).toBe(2);
    expect(s2.avgStep).toBe(1);
  });
});
