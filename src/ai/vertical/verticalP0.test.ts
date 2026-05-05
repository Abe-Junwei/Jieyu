import { describe, expect, it } from 'vitest';
import {
  AI_TOOL_REGISTRY_SHADOW,
  assertAiToolRegistryShadowParity,
  getAiToolRegistryShadowEntry,
  getAiToolRegistryShadowParityReport,
} from './aiToolRegistryShadow';
import { buildEvidencePacketV0, EVIDENCE_PACKET_V0_SCHEMA_VERSION } from './evidencePacket';
import { getVerticalWorkflowV0, listVerticalWorkflowsV0, VERTICAL_WORKFLOW_REGISTRY_V0 } from './verticalWorkflowRegistry';

describe('vertical p0 foundation', () => {
  it('keeps tool registry shadow parity between tool schemas and policy matrix', () => {
    const report = getAiToolRegistryShadowParityReport();
    expect(report.ok).toBe(true);
    expect(report.policyOnlyTools).toEqual([]);
    expect(report.schemaOnlyTools).toEqual([]);
    expect(() => assertAiToolRegistryShadowParity()).not.toThrow();
  });

  it('builds registry entries with stable write mode semantics', () => {
    expect(Object.keys(AI_TOOL_REGISTRY_SHADOW).length).toBeGreaterThan(0);
    expect(getAiToolRegistryShadowEntry('get_project_summary').writeMode).toBe('read_only');
    expect(getAiToolRegistryShadowEntry('set_transcription_text').writeMode).toBe('write_like');
    expect(getAiToolRegistryShadowEntry('propose_changes').writeMode).toBe('propose_only');
  });

  it('exposes default vertical workflows with write-mode boundaries', () => {
    const workflows = listVerticalWorkflowsV0();
    expect(workflows).toHaveLength(3);
    expect(getVerticalWorkflowV0('segment_qa').writeMode).toBe('read_only');
    expect(getVerticalWorkflowV0('annotation_qa').writeMode).toBe('propose_only');
    expect(getVerticalWorkflowV0('lexeme_candidates').writeMode).toBe('propose_only');
    expect(Object.keys(VERTICAL_WORKFLOW_REGISTRY_V0).sort()).toEqual([
      'annotation_qa',
      'lexeme_candidates',
      'segment_qa',
    ]);
  });

  it('builds evidence packet v0 with schema marker', () => {
    const packet = buildEvidencePacketV0({
      id: 'ev_001',
      sourceType: 'segment',
      sourceId: 'seg_001',
      summary: 'segment observation',
      confidence: 0.95,
    });
    expect(packet.schemaVersion).toBe(EVIDENCE_PACKET_V0_SCHEMA_VERSION);
    expect(packet.sourceType).toBe('segment');
  });

  it('rejects invalid evidence packet confidence and invalid time range', () => {
    expect(() => buildEvidencePacketV0({
      id: 'ev_002',
      sourceType: 'segment',
      sourceId: 'seg_002',
      confidence: 1.1,
    })).toThrow(/confidence/);

    expect(() => buildEvidencePacketV0({
      id: 'ev_003',
      sourceType: 'segment',
      sourceId: 'seg_003',
      timeRangeMs: { startMs: 1000, endMs: 100 },
    })).toThrow(/timeRangeMs/);
  });
});
