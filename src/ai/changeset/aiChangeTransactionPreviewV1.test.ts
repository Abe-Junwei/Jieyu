import { describe, expect, it } from 'vitest';
import type { PendingAiToolCall } from '../chat/chatDomain.types';
import { buildAiChangeTransactionPreviewV1 } from './aiChangeTransactionPreviewV1';
import { buildAiChangeSetFromPendingToolCall } from './AiChangeSetProtocol';

describe('buildAiChangeTransactionPreviewV1', () => {
  it('maps propose_changes pending to kind propose_changes and child steps', () => {
    const pending: PendingAiToolCall = {
      call: {
        name: 'propose_changes',
        arguments: { description: 'Batch edit', changes: [] },
      },
      requestId: 'req-propose-1',
      proposedChildCalls: [
        { name: 'set_transcription_text', arguments: { segmentId: 'u1', text: 'hello world' } },
      ],
      assistantMessageId: 'ast-1',
      riskSummary: 'Will edit text',
      impactPreview: ['Line A', 'Line B'],
      approvalMode: 'propose_changes',
    };
    const changeSet = buildAiChangeSetFromPendingToolCall(pending);
    const dto = buildAiChangeTransactionPreviewV1(pending);
    expect(dto.schemaVersion).toBe(1);
    expect(dto.kind).toBe('propose_changes');
    expect(dto.headline).toBe(changeSet.description);
    expect(dto.changeSetSummaryId).toMatch(/^changeset_/);
    expect(dto.childSteps).toHaveLength(1);
    expect(dto.childSteps[0]).toMatchObject({
      index: 0,
      toolName: 'set_transcription_text',
      targetId: 'u1',
    });
    expect(dto.childSteps[0]?.argsSummary).toContain('hello');
    expect(dto.impactPreviewSourceLines).toEqual(['Line A', 'Line B']);
    expect(dto.requestId).toBe('req-propose-1');
  });

  it('maps single-tool pending to kind single_tool', () => {
    const pending: PendingAiToolCall = {
      call: {
        name: 'delete_transcription_segment',
        arguments: { segmentId: 'seg-9' },
        requestId: 'req-del-1',
      },
      assistantMessageId: 'ast-2',
      riskSummary: 'Deletes a segment',
      impactPreview: ['Irreversible'],
      previewContract: { affectedCount: 1, affectedIds: ['seg-9'], reversible: false },
    };
    const dto = buildAiChangeTransactionPreviewV1(pending);
    expect(dto.kind).toBe('single_tool');
    expect(dto.parentToolName).toBe('delete_transcription_segment');
    expect(dto.childSteps).toHaveLength(1);
    expect(dto.childSteps[0]?.targetId).toBe('seg-9');
    expect(dto.childSteps[0]?.toolName).toBe('delete_transcription_segment');
    expect(dto.previewContract?.affectedIds).toEqual(['seg-9']);
  });
});
