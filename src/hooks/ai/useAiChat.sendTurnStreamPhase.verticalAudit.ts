/**
 * Phase C3: vertical workflow completion audit (stream phase), extracted to keep `sendTurnStreamPhase` thinner.
 */

import type { PersistOpeningTurnAndBuildPromptContextResult } from './useAiChat.sendPersistTurnAndBuildPromptContext';
import type {
  VerticalWorkflowOutputEnvelopeV0,
  VerticalWorkflowSelectionV0,
} from '../../ai/vertical/verticalWorkflowSelection';
import { newAuditLogId, nowIso } from './useAiChat.helpers';
import { createLogger } from '../../observability/logger';

const log = createLogger('useAiChat.sendTurnStreamPhase.verticalAudit');

export async function writeVerticalWorkflowAuditLogForSendTurnStreamPhase(opts: {
  db: PersistOpeningTurnAndBuildPromptContextResult['db'];
  assistantId: string;
  verticalOutputEnvelopeSeed: VerticalWorkflowOutputEnvelopeV0 | null;
  verticalWorkflowSelection: VerticalWorkflowSelectionV0 | null;
  completionStatus: 'done' | 'error';
  completionPath: 'stream_done' | 'stream_fallback';
}): Promise<void> {
  const {
    db,
    assistantId,
    verticalOutputEnvelopeSeed,
    verticalWorkflowSelection,
    completionStatus,
    completionPath,
  } = opts;
  if (!verticalOutputEnvelopeSeed) return;
  try {
    await db.collections.audit_logs.insert({
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId: assistantId,
      action: 'update',
      field: 'ai_vertical_workflow_result',
      oldValue: verticalOutputEnvelopeSeed.workflowId,
      newValue: completionStatus,
      source: 'ai',
      timestamp: nowIso(),
      requestId: `${assistantId}_vertical_${verticalOutputEnvelopeSeed.generatedAt}`,
      metadataJson: JSON.stringify({
        schemaVersion: 1,
        phase: 'stream_completion',
        completionPath,
        completionStatus,
        workflowId: verticalOutputEnvelopeSeed.workflowId,
        writeMode: verticalOutputEnvelopeSeed.writeMode,
        outputKind: verticalOutputEnvelopeSeed.outputKind,
        envelope: {
          schemaVersion: verticalOutputEnvelopeSeed.schemaVersion,
          generatedAt: verticalOutputEnvelopeSeed.generatedAt,
          evidencePacketCount: verticalOutputEnvelopeSeed.evidencePackets.length,
        },
        selection: verticalWorkflowSelection
          ? {
              confidence: verticalWorkflowSelection.confidence,
              source: verticalWorkflowSelection.source,
              reasonCode: verticalWorkflowSelection.reasonCode,
              matchedKeyword: verticalWorkflowSelection.matchedKeyword,
            }
          : null,
      }),
    });
  } catch (error) {
    log.error('failed to write vertical workflow audit log', { err: error });
  }
}
