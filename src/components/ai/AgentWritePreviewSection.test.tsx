// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n';
import type { PendingAiToolCall } from '../../hooks/useAiChat';

vi.mock('../../ai/config/featureFlags', () => ({
  featureFlags: { aiAgentUiPreviewEnabled: true },
}));

import { AgentWritePreviewSection } from './AgentWritePreviewSection';

function renderPreview(pending: PendingAiToolCall) {
  return render(
    <LocaleProvider locale="en-US">
      <AgentWritePreviewSection pending={pending} />
    </LocaleProvider>,
  );
}

describe('AgentWritePreviewSection', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders structured preview child steps and human triage', () => {
    const pending: PendingAiToolCall = {
      call: {
        name: 'set_transcription_text',
        arguments: { segmentId: 'u1', text: 'hello world' },
        requestId: 'req-prev-1',
      },
      assistantMessageId: 'ast-1',
      policyReasonCode: 'write_gate_preview_required',
      auditContext: {
        userText: '',
        providerId: 'mock',
        model: 'm',
        toolDecisionMode: 'enabled',
        toolFeedbackStyle: 'concise',
        agentRunId: 'run_preview_1',
      },
    };

    renderPreview(pending);

    const root = screen.getByTestId('ai-agent-write-preview');
    expect(root.getAttribute('data-agent-run-id')).toBe('run_preview_1');
    expect(root.getAttribute('data-preview-kind')).toBe('single_tool');
    expect(root.textContent).toMatch(/Write preview/);
    expect(root.textContent).toMatch(/set_transcription_text/);
    expect(root.textContent).toMatch(/hello world/);
    expect(screen.getByTestId('ai-agent-write-preview-triage').textContent).toMatch(
      /Needs confirmation/,
    );
  });
});
