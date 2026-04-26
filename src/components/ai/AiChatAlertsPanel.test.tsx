// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { LocaleProvider } from '../../i18n';
import type { PendingAiToolCall } from '../../hooks/useAiChat';
import { AiChatAlertsPanel } from './AiChatAlertsPanel';

const { resolveTextDirectionFromLocaleMock } = vi.hoisted(() => ({
  resolveTextDirectionFromLocaleMock: vi.fn<(locale: string) => 'ltr' | 'rtl'>(),
}));

vi.mock('../../utils/panelAdaptiveLayout', () => ({
  UI_FONT_SCALE_LIMITS: {
    min: 0.85,
    max: 1.4,
    fallback: 1,
    storageKey: 'jieyu:ui-font-scale',
    changeEvent: 'jieyu:ui-font-scale-changed',
  },
  subscribeUiFontScalePreference: () => () => {},
  readUiFontScalePreferenceSnapshot: () => 'auto:1.0000',
  readPersistedUiFontScalePreference: () => ({ mode: 'auto', manualScale: 1 }),
  readPersistedUiFontScale: () => 1,
  resolveTextDirectionFromLocale: (locale: string) => resolveTextDirectionFromLocaleMock(locale),
}));

function renderPanel(overrides: Partial<ComponentProps<typeof AiChatAlertsPanel>> = {}) {
  const props: ComponentProps<typeof AiChatAlertsPanel> = {
    isZh: false,
    aiIsStreaming: false,
    errorWarningText: '',
    dismissedErrorWarning: false,
    alertCount: 0,
    debugUiShowAll: false,
    showAlertBar: false,
    aiPendingToolCall: null,
    onDismissErrorWarning: vi.fn(),
    onToggleAlertBar: vi.fn(),
    onConfirmPendingToolCall: undefined,
    onCancelPendingToolCall: undefined,
    ...overrides,
  };

  return {
    ...render(
      <LocaleProvider locale="en-US">
        <AiChatAlertsPanel {...props} />
      </LocaleProvider>,
    ),
    props,
  };
}

describe('AiChatAlertsPanel', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    resolveTextDirectionFromLocaleMock.mockReset();
    resolveTextDirectionFromLocaleMock.mockReturnValue('ltr');
    window.sessionStorage.clear();
  });

  it('applies resolved text direction on alert region', () => {
    resolveTextDirectionFromLocaleMock.mockReturnValue('rtl');

    renderPanel({
      alertCount: 1,
      showAlertBar: false,
    });

    const region = screen.getByTestId('ai-chat-alerts-region');
    expect(region.getAttribute('dir')).toBe('rtl');
    expect(resolveTextDirectionFromLocaleMock).toHaveBeenCalledWith('en-US');
  });

  it('triggers toggle, confirm, and cancel handlers for pending tool call actions', () => {
    const onToggleAlertBar = vi.fn();
    const onOpenDecisionReplay = vi.fn(async () => undefined);
    const onConfirmPendingToolCall = vi.fn(async () => undefined);
    const onCancelPendingToolCall = vi.fn(async () => undefined);
    const pendingToolCall: PendingAiToolCall = {
      call: {
        name: 'delete_layer',
        arguments: { layerId: 'layer-1' },
      },
      assistantMessageId: 'ast-1',
      approvalMode: 'user_preference',
      policyReasonCode: 'user_directive_confirmation_required',
      riskTier: 'high',
      riskSummary: 'Layer delete requires confirmation',
      impactPreview: ['Will remove one layer'],
    };

    renderPanel({
      alertCount: 1,
      showAlertBar: true,
      aiPendingToolCall: pendingToolCall,
      aiToolDecisionLogs: [
        {
          id: 'log-1',
          decision: 'policy_blocked',
          reason: 'user_directive_deny_destructive',
          reasonLabelEn: 'Blocked by user safety preference for destructive actions.',
          message: 'Blocked by directive',
          requestId: 'req-1',
          timestamp: '2026-04-25T12:00:00.000Z',
        },
        {
          id: 'log-2',
          decision: 'auto_confirmed',
          requestId: 'req-2',
          timestamp: '2026-04-25T12:00:02.000Z',
        },
      ],
      onToggleAlertBar,
      onOpenDecisionReplay,
      onConfirmPendingToolCall,
      onCancelPendingToolCall,
    });

    const toggleButton = screen.getByRole('button', { name: /Hide|收起/i });
    const confirmButton = screen.getByRole('button', { name: /Delete layer|删除层|Confirm/i });
    const cancelButton = screen.getByRole('button', { name: /Cancel|取消/i });
    const approvalCenter = screen.getByTestId('ai-approval-center-mvp');
    const approvalHistory = screen.getByTestId('ai-approval-history-mvp');
    const region = screen.getByTestId('ai-chat-alerts-region');
    expect(region.className).toContain('panel-design-match-content');
    expect(approvalCenter.textContent).toMatch(/Approval Center \(MVP\)|审批中心（MVP）/);
    expect(approvalCenter.textContent).toContain('mode=user_preference');
    expect(approvalCenter.textContent).toContain('risk=high');
    expect(approvalCenter.textContent).toContain('policy=User preference requires confirmation before execution. (user_directive_confirmation_required)');
    expect(approvalHistory.textContent).toMatch(/Recent approval outcomes|最近审批记录/);
    expect(approvalHistory.textContent).toContain('policy_blocked');
    expect(approvalHistory.textContent).toContain('Blocked by user safety preference for destructive actions.');
    expect(approvalHistory.textContent).toContain('auto_confirmed');
    const outcomeFilter = screen.getByRole('combobox', { name: /Approval outcome filter|审批结果筛选/i });
    fireEvent.change(outcomeFilter, { target: { value: 'blocked' } });
    expect(approvalHistory.textContent).toContain('policy_blocked');
    expect(approvalHistory.textContent).not.toContain('auto_confirmed');
    const replayButton = screen.getByRole('button', { name: /Replay|查看回放/i });

    fireEvent.click(toggleButton);
    fireEvent.click(replayButton);
    fireEvent.click(confirmButton);
    fireEvent.click(cancelButton);

    expect(onToggleAlertBar).toHaveBeenCalledTimes(1);
    expect(onOpenDecisionReplay).toHaveBeenCalledTimes(1);
    expect(onOpenDecisionReplay).toHaveBeenCalledWith('req-1');
    expect(onConfirmPendingToolCall).toHaveBeenCalledTimes(1);
    expect(onCancelPendingToolCall).toHaveBeenCalledTimes(1);
  });

  it('disables confirm when timeline epoch diverges from captured epoch', () => {
    const onConfirmPendingToolCall = vi.fn(async () => undefined);
    const pendingToolCall: PendingAiToolCall = {
      call: {
        name: 'delete_layer',
        arguments: { layerId: 'layer-1' },
      },
      assistantMessageId: 'ast-1',
      readModelEpochCaptured: 1,
    };

    renderPanel({
      alertCount: 1,
      showAlertBar: true,
      aiPendingToolCall: pendingToolCall,
      timelineReadModelEpoch: 2,
      onConfirmPendingToolCall,
      onCancelPendingToolCall: vi.fn(async () => undefined),
    });

    const confirmButton = screen.getByRole('button', { name: /Delete layer|删除层|Confirm/i });
    expect(confirmButton.getAttribute('disabled')).not.toBeNull();
    expect(screen.getByTestId('ai-changeset-preview')).toBeTruthy();
  });

  it('shows durable handoff section and triggers resume callback when agent loop checkpoint exists', () => {
    const onResumeAgentLoop = vi.fn(async () => undefined);

    renderPanel({
      alertCount: 1,
      showAlertBar: true,
      aiPendingToolCall: null,
      aiPendingAgentLoopCheckpoint: {
        kind: 'token_budget_warning',
        taskId: 'task_agent_loop_1',
        originalUserText: '请继续生成下一步操作建议',
        continuationInput: '继续',
        step: 3,
        estimatedRemainingTokens: 512,
        createdAt: '2026-04-27T00:00:00.000Z',
      },
      onResumeAgentLoop,
    });

    const handoff = screen.getByTestId('ai-agent-loop-handoff-mvp');
    expect(handoff.textContent).toMatch(/Approval Center \(Durable Handoff\)|审批中心（Durable Handoff）/);
    expect(handoff.textContent).toContain('step=3');
    expect(handoff.textContent).toContain('task=task_agent_loop_1');
    expect(screen.getByText(/请继续生成下一步操作建议/)).toBeTruthy();
    expect(screen.getByText(/Continuation:\s*继续/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Resume|继续执行/i }));
    expect(onResumeAgentLoop).toHaveBeenCalledTimes(1);
  });

  it('disables durable handoff resume action while ai stream is active', () => {
    const onResumeAgentLoop = vi.fn(async () => undefined);

    renderPanel({
      alertCount: 1,
      showAlertBar: true,
      aiIsStreaming: true,
      aiPendingToolCall: null,
      aiPendingAgentLoopCheckpoint: {
        kind: 'token_budget_warning',
        taskId: 'task_agent_loop_busy',
        originalUserText: '继续任务',
        continuationInput: '继续',
        step: 1,
        createdAt: '2026-04-27T00:00:00.000Z',
      },
      onResumeAgentLoop,
    });

    const resumeButton = screen.getByRole('button', { name: /Resume|继续执行/i }) as HTMLButtonElement;
    expect(resumeButton.disabled).toBe(true);

    fireEvent.click(resumeButton);
    expect(onResumeAgentLoop).toHaveBeenCalledTimes(0);
  });

  it('dismisses warning banner when warning exists', () => {
    const onDismissErrorWarning = vi.fn();

    renderPanel({
      errorWarningText: 'Network timeout',
      dismissedErrorWarning: false,
      onDismissErrorWarning,
    });

    fireEvent.click(screen.getByRole('button'));
    expect(onDismissErrorWarning).toHaveBeenCalledTimes(1);
  });

  it('persists approval outcome filter in session storage', () => {
    window.sessionStorage.setItem('jieyu:ai-approval-history-filter', 'blocked');
    const pendingToolCall: PendingAiToolCall = {
      call: {
        name: 'delete_layer',
        arguments: { layerId: 'layer-1' },
      },
      assistantMessageId: 'ast-1',
    };
    renderPanel({
      alertCount: 1,
      showAlertBar: true,
      aiPendingToolCall: pendingToolCall,
      aiToolDecisionLogs: [
        { id: 'log-1', decision: 'policy_blocked', timestamp: '2026-04-25T12:00:00.000Z' },
        { id: 'log-2', decision: 'auto_confirmed', timestamp: '2026-04-25T12:00:02.000Z' },
      ],
    });
    const outcomeFilter = screen.getByRole('combobox', { name: /Approval outcome filter|审批结果筛选/i }) as HTMLSelectElement;
    expect(outcomeFilter.value).toBe('blocked');
    fireEvent.change(outcomeFilter, { target: { value: 'executed' } });
    expect(window.sessionStorage.getItem('jieyu:ai-approval-history-filter')).toBe('executed');
  });
});
