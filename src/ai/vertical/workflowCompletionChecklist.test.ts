import { describe, expect, it } from 'vitest';
import {
  canMarkWorkflowAnswerReady,
  evaluateWorkflowCompletionChecklist,
} from './workflowCompletionChecklist';
import type { VerticalWorkflowOutputEnvelopeV0 } from './verticalWorkflowSelection';

describe('workflowCompletionChecklist', () => {
  it('keeps segment_qa open until evidence packets exist', () => {
    const open = evaluateWorkflowCompletionChecklist({
      workflowId: 'segment_qa',
      evidencePackets: [],
      writeMode: 'read_only',
    });
    expect(open.complete).toBe(false);
    expect(open.openSteps).toContain('evidence_packets_ready');

    const closed = evaluateWorkflowCompletionChecklist({
      workflowId: 'segment_qa',
      evidencePackets: [
        { schemaVersion: 0, id: 'ep-1', sourceType: 'segment', sourceId: 'seg-1', quote: 'q' },
      ],
      writeMode: 'read_only',
    });
    expect(closed.complete).toBe(true);
  });

  it('blocks answer_ready when reflection is flagged for annotation_qa', () => {
    const envelope: VerticalWorkflowOutputEnvelopeV0 = {
      schemaVersion: 0,
      workflowId: 'annotation_qa',
      writeMode: 'propose_only',
      outputKind: 'qa_findings',
      evidencePackets: [
        { schemaVersion: 0, id: 'ep-1', sourceType: 'segment', sourceId: 'seg-1', quote: 'q' },
      ],
      generatedAt: new Date().toISOString(),
      status: 'ready',
    };
    expect(canMarkWorkflowAnswerReady(envelope, { reflectionFlagged: true })).toBe(false);
    expect(canMarkWorkflowAnswerReady(envelope, { reflectionFlagged: false })).toBe(true);
  });
});
