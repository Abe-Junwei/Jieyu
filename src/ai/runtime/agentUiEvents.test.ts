import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { PendingAiToolCall } from '../chat/chatDomain.types';

async function loadEvents(previewEnabled: boolean) {
  vi.resetModules();
  vi.doMock('../config/featureFlags', () => ({
    featureFlags: { aiAgentUiPreviewEnabled: previewEnabled },
  }));
  return import('./agentUiEvents');
}

describe('agentUiEvents', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../config/featureFlags');
    vi.resetModules();
  });

  it('does not emit when preview flag is off', async () => {
    const mod = await loadEvents(false);
    const received: unknown[] = [];
    mod.getDefaultAgentUiEventBus().subscribe((event) => {
      received.push(event);
    });
    mod.publishAgentWriteConfirmed({ toolName: 'set_transcription_text', agentRunId: 'run_1' });
    expect(received).toHaveLength(0);
  });

  it('emits write_preview_pending with preview DTO and agentRunId when flag is on', async () => {
    const mod = await loadEvents(true);
    const received: Array<{ kind: string; agentRunId?: string; preview?: { kind: string } }> = [];
    mod.getDefaultAgentUiEventBus().subscribe((event) => {
      received.push(event);
    });
    const pending: PendingAiToolCall = {
      call: {
        name: 'set_transcription_text',
        arguments: { segmentId: 'u1', text: 'hello' },
        requestId: 'req-1',
      },
      assistantMessageId: 'ast-1',
      policyReasonCode: 'write_gate_preview_required',
    };
    mod.publishAgentWritePreviewPending({ pending, agentRunId: 'run_42' });
    expect(received).toHaveLength(1);
    expect(received[0]?.kind).toBe('write_preview_pending');
    expect(received[0]?.agentRunId).toBe('run_42');
    expect(received[0]?.preview?.kind).toBe('single_tool');
  });

  it('maps blocked reason to triage on write_blocked', async () => {
    const mod = await loadEvents(true);
    const received: Array<{ triage?: string; reasonCode?: string }> = [];
    mod.getDefaultAgentUiEventBus().subscribe((event) => {
      received.push(event);
    });
    mod.publishAgentWriteBlocked({
      toolName: 'delete_transcription_segment',
      reasonCode: 'user_directive_deny_destructive',
      agentRunId: 'run_b',
      requestId: 'req-b',
    });
    expect(received[0]?.triage).toBe('abandon');
    expect(received[0]?.reasonCode).toBe('user_directive_deny_destructive');
  });
});
