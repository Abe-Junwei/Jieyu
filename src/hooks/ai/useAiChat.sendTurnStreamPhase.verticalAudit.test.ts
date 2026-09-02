import { describe, expect, it, vi } from 'vitest';
import {
  buildVerticalWorkflowOutputEnvelopeV0,
  reconcileVerticalWorkflowEnvelopeStatus,
  selectVerticalWorkflowV0,
} from '../../ai/vertical/verticalWorkflowSelection';
import { writeVerticalWorkflowAuditLogForSendTurnStreamPhase } from './useAiChat.sendTurnStreamPhase.verticalAudit';
import type { PersistOpeningTurnAndBuildPromptContextResult } from './useAiChat.sendPersistTurnAndBuildPromptContext';

function mockDb(insert: ReturnType<typeof vi.fn>) {
  return {
    collections: { audit_logs: { insert } },
  } as unknown as PersistOpeningTurnAndBuildPromptContextResult['db'];
}

describe('writeVerticalWorkflowAuditLogForSendTurnStreamPhase', () => {
  it('no-ops when envelope seed is null', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    await writeVerticalWorkflowAuditLogForSendTurnStreamPhase({
      db: mockDb(insert),
      assistantId: 'ast_1',
      verticalOutputEnvelopeSeed: null,
      verticalWorkflowSelection: null,
      completionStatus: 'done',
      completionPath: 'stream_done',
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('writes reconciled envelope.status after reflection (A4 vertical audit)', async () => {
    const selection = selectVerticalWorkflowV0('请做标注 QA');
    expect(selection).not.toBeNull();
    const seed = buildVerticalWorkflowOutputEnvelopeV0(selection!, [
      {
        schemaVersion: 0,
        id: 'ep1',
        sourceType: 'segment',
        sourceId: 'seg-1',
        quote: 'sample',
        confidence: 0.9,
      },
    ]);
    expect(seed.status).toBe('ready');

    const reconciled = reconcileVerticalWorkflowEnvelopeStatus(seed, {
      reflectionFlagged: true,
    });
    expect(reconciled.status).toBe('degraded');

    const insert = vi.fn().mockResolvedValue(undefined);
    await writeVerticalWorkflowAuditLogForSendTurnStreamPhase({
      db: mockDb(insert),
      assistantId: 'ast_1',
      verticalOutputEnvelopeSeed: reconciled,
      verticalWorkflowSelection: selection,
      completionStatus: 'done',
      completionPath: 'stream_done',
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0]?.[0] as { field: string; metadataJson: string };
    expect(row.field).toBe('ai_vertical_workflow_result');
    const meta = JSON.parse(row.metadataJson) as {
      envelope: { status: string; evidencePacketCount: number };
    };
    expect(meta.envelope.status).toBe('degraded');
    expect(meta.envelope.evidencePacketCount).toBe(1);
  });
});
