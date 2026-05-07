// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { buildSourceScopeSummaryFromEvidencePackets } from './sourceScopeSummary';

function makePacket(overrides: Partial<Parameters<typeof buildSourceScopeSummaryFromEvidencePackets>[0][number]> = {}) {
  return {
    schemaVersion: 0 as const,
    id: 'ep-001',
    sourceType: 'segment' as const,
    sourceId: 'seg-001',
    ...overrides,
  };
}

describe('buildSourceScopeSummaryFromEvidencePackets', () => {
  it('returns none scope when no packets', () => {
    const result = buildSourceScopeSummaryFromEvidencePackets([]);
    expect(result.evidenceCount).toBe(0);
    expect(result.scopeLabel).toBe('none');
    expect(Object.keys(result.sourceTypeBreakdown)).toHaveLength(0);
  });

  it('returns segment scope for single-type segment packets', () => {
    const result = buildSourceScopeSummaryFromEvidencePackets([
      makePacket({ id: 'ep-1', sourceId: 'seg-1' }),
      makePacket({ id: 'ep-2', sourceId: 'seg-2' }),
    ]);
    expect(result.evidenceCount).toBe(2);
    expect(result.scopeLabel).toBe('segment');
    expect(result.sourceTypeBreakdown.segment).toBe(2);
  });

  it('returns mixed scope for multiple source types', () => {
    const result = buildSourceScopeSummaryFromEvidencePackets([
      makePacket({ id: 'ep-1', sourceType: 'segment' }),
      makePacket({ id: 'ep-2', sourceType: 'note' }),
    ]);
    expect(result.evidenceCount).toBe(2);
    expect(result.scopeLabel).toBe('mixed');
    expect(result.sourceTypeBreakdown.segment).toBe(1);
    expect(result.sourceTypeBreakdown.note).toBe(1);
  });

  it('counts sourceTypeBreakdown correctly for many types', () => {
    const result = buildSourceScopeSummaryFromEvidencePackets([
      makePacket({ id: 'ep-1', sourceType: 'segment' }),
      makePacket({ id: 'ep-2', sourceType: 'segment' }),
      makePacket({ id: 'ep-3', sourceType: 'layer_text' }),
      makePacket({ id: 'ep-4', sourceType: 'layer_text' }),
      makePacket({ id: 'ep-5', sourceType: 'layer_text' }),
    ]);
    expect(result.evidenceCount).toBe(5);
    expect(result.scopeLabel).toBe('mixed');
    expect(result.sourceTypeBreakdown.segment).toBe(2);
    expect(result.sourceTypeBreakdown.layer_text).toBe(3);
  });
});
