// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { collectAdoptionOutcomeMetadataJsons, generateAiRuntimeReportFromAudit } from './aiRuntimeReportGenerator';

const mockAuditLogs = [
  { id: 'a1', collection: 'ai_messages', field: 'ai_adoption_outcome', metadataJson: '{"phase":"adoption_outcome","action":"accept"}' },
  { id: 'a2', collection: 'ai_messages', field: 'ai_adoption_outcome', metadataJson: '{"phase":"adoption_outcome","action":"ignore"}' },
  { id: 'a3', collection: 'ai_messages', field: 'ai_segment_qa_reflection', metadataJson: '{}' },
];

vi.mock('../../db', () => ({
  getDb: vi.fn(() => Promise.resolve({
    collections: {
      audit_logs: {
        findByIndex: vi.fn(() => Promise.resolve(mockAuditLogs)),
      },
    },
  })),
}));

describe('collectAdoptionOutcomeMetadataJsons', () => {
  it('filters by field and returns metadataJson strings', async () => {
    const result = await collectAdoptionOutcomeMetadataJsons();
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('accept');
    expect(result[1]).toContain('ignore');
  });
});

describe('generateAiRuntimeReportFromAudit', () => {
  it('returns report with adoption outcome rollup', async () => {
    const report = await generateAiRuntimeReportFromAudit();
    expect(report.adoptionOutcomeRollup).toBeDefined();
    expect(report.adoptionOutcomeRollup!.accepted).toBe(1);
    expect(report.adoptionOutcomeRollup!.ignored).toBe(1);
    expect(report.adoptionOutcomeRollup!.copied).toBe(0);
  });
});
