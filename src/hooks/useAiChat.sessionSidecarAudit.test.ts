import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleSessionSidecarSandboxAudit } from './useAiChat.sessionSidecarAudit';

const auditInsert = vi.fn().mockResolvedValue(undefined);

vi.mock('../db', () => ({
  getDb: vi.fn(async () => ({
    collections: { audit_logs: { insert: auditInsert } },
  })),
}));

describe('scheduleSessionSidecarSandboxAudit', () => {
  beforeEach(() => {
    auditInsert.mockClear();
  });

  it('no-ops when conversationId is null', async () => {
    scheduleSessionSidecarSandboxAudit({
      conversationId: null,
      virtualWritePath: 'session-memory/send-preflight-directive',
      sandboxAction: 'deny',
      sandboxReason: 'readonly-write-not-allowed',
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it('inserts ai_session_sidecar_sandbox audit row', async () => {
    scheduleSessionSidecarSandboxAudit({
      conversationId: 'conv-test',
      virtualWritePath: 'session-memory/send-preflight-directive',
      sandboxAction: 'deny',
      sandboxReason: 'readonly-write-not-allowed',
      sourceMessageId: 'usr-1',
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(auditInsert).toHaveBeenCalledTimes(1);
    const row = auditInsert.mock.calls[0]?.[0] as { field: string; metadataJson: string };
    expect(row.field).toBe('ai_session_sidecar_sandbox');
    const meta = JSON.parse(row.metadataJson) as Record<string, unknown>;
    expect(meta.phase).toBe('session_sidecar_sandbox');
    expect(meta.gate).toBe('session-memory/send-preflight-directive');
    expect(meta.sandboxAction).toBe('deny');
    expect(meta.sandboxReason).toBe('readonly-write-not-allowed');
    expect(meta.sourceMessageId).toBe('usr-1');
  });
});
