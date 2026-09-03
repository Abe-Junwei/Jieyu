import { describe, expect, it } from 'vitest';
import {
  getVerticalWorkflowOutputSchema,
  parseVerticalWorkflowEnvelopeV0,
} from './verticalWorkflowOutputSchemas';
import { getVerticalWorkflowV0 } from './verticalWorkflowRegistry';

describe('verticalWorkflowOutputSchemas', () => {
  it('resolves envelope_v0 from registry outputSchemaId', () => {
    const schema = getVerticalWorkflowOutputSchema(
      getVerticalWorkflowV0('segment_qa').outputSchemaId,
    );
    expect(schema).toBeDefined();
  });

  it('parses a matching envelope and rejects a mismatched workflowId', () => {
    const value = {
      schemaVersion: 0,
      workflowId: 'segment_qa',
      writeMode: 'read_only',
      outputKind: 'answer',
      evidencePackets: [{ id: 'ep-1', sourceType: 'segment', sourceId: 'seg-1' }],
      generatedAt: '2026-09-02T00:00:00.000Z',
      status: 'ready',
    };
    expect(parseVerticalWorkflowEnvelopeV0('segment_qa', value).workflowId).toBe('segment_qa');
    expect(() => parseVerticalWorkflowEnvelopeV0('annotation_qa', value)).toThrow(
      /does not match annotation_qa/,
    );
  });
});
