import { getDb } from '../db';
import type { BackgroundToolSandboxAction, BackgroundToolSandboxReason } from '../ai/sandbox/backgroundToolSandbox';
import { newAuditLogId, nowIso } from './useAiChat.helpers';

export function scheduleSessionSidecarSandboxAudit(options: {
  conversationId: string | null;
  virtualWritePath: string;
  sandboxAction: BackgroundToolSandboxAction;
  sandboxReason: BackgroundToolSandboxReason;
  sourceMessageId?: string;
}): void {
  const { conversationId, virtualWritePath, sandboxAction, sandboxReason, sourceMessageId } = options;
  if (!conversationId) return;
  const timestamp = nowIso();
  void getDb()
    .then((db) => db.collections.audit_logs.insert({
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId: conversationId,
      action: 'update',
      field: 'ai_session_sidecar_sandbox',
      oldValue: '',
      newValue: sandboxAction,
      source: 'system',
      timestamp,
      requestId: `session_sidecar_sandbox_${virtualWritePath.replace(/\//g, '_')}_${timestamp}`,
      metadataJson: JSON.stringify({
        schemaVersion: 1,
        phase: 'session_sidecar_sandbox',
        gate: virtualWritePath,
        sandboxAction,
        sandboxReason,
        ...(sourceMessageId ? { sourceMessageId } : {}),
      }),
    }))
    .catch(() => {
      // 审计写入失败不阻断主流程 | Do not block the main flow when audit write fails.
    });
}
