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
  resolveTextDirectionFromLocale: (locale: string) => resolveTextDirectionFromLocaleMock(locale),
}));

function renderPanel(overrides: Partial<ComponentProps<typeof AiChatAlertsPanel>> = {}) {
  const props: ComponentProps<typeof AiChatAlertsPanel> = {
    isZh: false,
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
    const onConfirmPendingToolCall = vi.fn(async () => undefined);
    const onCancelPendingToolCall = vi.fn(async () => undefined);
    const pendingToolCall: PendingAiToolCall = {
      call: {
        name: 'delete_layer',
        arguments: { layerId: 'layer-1' },
      },
      assistantMessageId: 'ast-1',
      riskSummary: 'Layer delete requires confirmation',
      impactPreview: ['Will remove one layer'],
    };

    renderPanel({
      alertCount: 1,
      showAlertBar: true,
      aiPendingToolCall: pendingToolCall,
      onToggleAlertBar,
      onConfirmPendingToolCall,
      onCancelPendingToolCall,
    });

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);

    const toggleButton = buttons[0];
    const confirmButton = buttons[1];
    const cancelButton = buttons[2];
    expect(toggleButton).toBeTruthy();
    expect(confirmButton).toBeTruthy();
    expect(cancelButton).toBeTruthy();

    fireEvent.click(toggleButton!);
    fireEvent.click(confirmButton!);
    fireEvent.click(cancelButton!);

    expect(onToggleAlertBar).toHaveBeenCalledTimes(1);
    expect(onConfirmPendingToolCall).toHaveBeenCalledTimes(1);
    expect(onCancelPendingToolCall).toHaveBeenCalledTimes(1);
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
});
