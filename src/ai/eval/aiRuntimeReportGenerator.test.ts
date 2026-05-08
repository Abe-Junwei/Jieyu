// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { collectAdoptionOutcomeMetadataJsons, generateAiRuntimeReportFromAudit } from './aiRuntimeReportGenerator';

const mockAuditLogs = [
  { id: 'a1', collection: 'ai_messages', field: 'ai_adoption_outcome', requestId: 'req-adopt-1', timestamp: '2026-05-07T00:00:00.000Z', metadataJson: '{"phase":"adoption_outcome","action":"accept"}' },
  { id: 'a2', collection: 'ai_messages', field: 'ai_adoption_outcome', requestId: 'req-adopt-2', timestamp: '2026-05-07T00:01:00.000Z', metadataJson: '{"phase":"adoption_outcome","action":"ignore"}' },
  { id: 'a3', collection: 'ai_messages', field: 'ai_segment_qa_reflection', requestId: 'req-reflect-1', timestamp: '2026-05-07T00:02:00.000Z', metadataJson: '{"reflectionFlagged":true,"failedCheckNames":["citation_count_match","evidence_marker_bounds"]}' },
  { id: 'a4', collection: 'ai_messages', field: 'ai_tool_call_decision', requestId: 'req-tool-1', timestamp: '2026-05-07T00:03:00.000Z', metadataJson: '{"phase":"decision","outcome":"policy_pending","toolCall":{"name":"delete_transcription_segment"}}' },
  { id: 'a5', collection: 'ai_messages', field: 'ai_tool_call_decision', requestId: 'req-tool-2', timestamp: '2026-05-07T00:04:00.000Z', metadataJson: '{"phase":"decision","outcome":"policy_blocked","toolCall":{"name":"propose_changes"},"reason":"user_directive"}' },
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

  it('reads production-shaped reflection and tool decision audit metadata', async () => {
    const report = await generateAiRuntimeReportFromAudit();
    expect(report.reflectionFailedCheckRollup?.total).toBe(2);
    expect(report.reflectionFailedCheckRollup?.byWorkflow.segment_qa).toBe(2);
    expect(report.reflectionFailedCheckRollup?.byCheckName.citation_count_match).toBe(1);
    expect(report.toolDecisionRollup?.confirmRequired).toBe(1);
    expect(report.toolDecisionRollup?.denied).toBe(1);
    expect(report.toolDecisionRollup?.byToolName.delete_transcription_segment).toBe(1);
    expect(report.toolDecisionRollup?.byToolName.propose_changes).toBe(1);
  });
});
