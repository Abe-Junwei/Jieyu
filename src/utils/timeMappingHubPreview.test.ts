import { describe, expect, it } from 'vitest';
import { computeSemanticTimelineMappingPreview } from './timeMappingHubPreview';

describe('computeSemanticTimelineMappingPreview', () => {
  it('uses logicalDurationSec when positive', () => {
    const r = computeSemanticTimelineMappingPreview({
      offsetSec: 1,
      scale: 2,
      logicalDurationSec: 5,
    });
    expect(r.docStart).toBe(0);
    expect(r.docEnd).toBe(5);
    expect(r.realStart).toBe(1);
    expect(r.realEnd).toBe(1 + 2 * 5);
  });

  it('falls back to default span when logical duration missing', () => {
    const r = computeSemanticTimelineMappingPreview({
      offsetSec: 0,
      scale: 1,
      fallbackDocumentSpanSec: 10,
    });
    expect(r.docEnd).toBe(10);
    expect(r.realEnd).toBe(10);
  });

  it('keeps realEnd >= realStart for degenerate scale', () => {
    const r = computeSemanticTimelineMappingPreview({
      offsetSec: 5,
      scale: 0.5,
      logicalDurationSec: 0,
    });
    expect(r.realEnd).toBeGreaterThanOrEqual(r.realStart);
  });
});
