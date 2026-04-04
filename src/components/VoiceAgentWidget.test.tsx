// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceAgentWidget } from './VoiceAgentWidget';
import type { VoiceAgentWidgetProps } from './VoiceAgentWidget';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeProps(overrides: Partial<VoiceAgentWidgetProps> = {}): VoiceAgentWidgetProps {
  return {
    listening: false,
    speechActive: false,
    mode: 'command',
    interimText: '',
    finalText: '',
    confidence: 0,
    error: null,
    lastIntent: null,
    pendingConfirm: null,
    disambiguationOptions: [],
    safeMode: false,
    wakeWordEnabled: false,
    wakeWordEnergyLevel: 0,
    corpusLang: 'cmn',
    langOverride: null,
    detectedLang: null,
    engine: 'web-speech',
    isRecording: false,
    energyLevel: 0,
    agentState: 'idle',
    recordingDuration: 0,
    session: { id: 'session-1', startedAt: Date.now(), entries: [], mode: 'command' },
    commercialProviderKind: 'groq',
    commercialProviderConfig: {},
    targetSummary: '当前页面操作',
    statusSummary: '待命',
    environmentSummary: '中文 · Web Speech',
    selectionSummary: '未定位句段',
    onToggle: vi.fn(),
    onMicPointerDown: vi.fn(),
    onMicPointerUp: vi.fn(),
    onSwitchMode: vi.fn(),
    onSwitchEngine: vi.fn(),
    onSelectDisambiguation: vi.fn(),
    onDismissDisambiguation: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onSetSafeMode: vi.fn(),
    onSetWakeWordEnabled: vi.fn(),
    onSetLangOverride: vi.fn(),
    onSetCommercialProviderKind: vi.fn(),
    onCommercialConfigChange: vi.fn(),
    onTestCommercialProvider: vi.fn(async () => ({ available: true })),
    ...overrides,
  };
}

describe('VoiceAgentWidget', () => {
  it('renders disambiguation options and dispatches selection handlers', () => {
    const onSelectDisambiguation = vi.fn();
    const onDismissDisambiguation = vi.fn();

    render(
      <VoiceAgentWidget
        {...makeProps({
          disambiguationOptions: [
            { type: 'action', actionId: 'deleteSegment', raw: '删除', confidence: 0.45, fromFuzzy: true },
            { type: 'action', actionId: 'undo', raw: '撤回', confidence: 0.33, fromFuzzy: true },
          ],
          onSelectDisambiguation,
          onDismissDisambiguation,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /删除|Delete Segment/i }));
    fireEvent.click(screen.getByRole('button', { name: /取消消歧|Cancel disambiguation/i }));

    expect(onSelectDisambiguation).toHaveBeenCalledWith('deleteSegment');
    expect(onDismissDisambiguation).toHaveBeenCalledTimes(1);
  });

  it('renders disambiguation and confirm notices as compact alertdialogs', () => {
    const view = render(
      <VoiceAgentWidget
        {...makeProps({
          disambiguationOptions: [
            { type: 'action', actionId: 'deleteSegment', raw: '删除', confidence: 0.45, fromFuzzy: true },
          ],
          pendingConfirm: {
            actionId: 'deleteSegment',
            label: '删除当前句段',
            fromFuzzy: true,
          },
        })}
      />,
    );

    const dialogs = Array.from(view.container.querySelectorAll('.voice-agent-notice-stack [role="alertdialog"]')) as HTMLDivElement[];
    const confirmButtons = screen.getAllByRole('button', { name: /确认|confirm/i });
    const cancelButtons = screen.getAllByRole('button', { name: /取消|cancel/i });

    expect(dialogs).toHaveLength(2);
    dialogs.forEach((dialog) => {
      expect(dialog.className).toContain('dialog-card');
      expect(dialog.className).toContain('dialog-card-compact');
      expect(dialog.querySelector('.dialog-footer')).toBeTruthy();
    });
    expect(confirmButtons.some((button) => button.closest('.dialog-footer'))).toBe(true);
    expect(cancelButtons.filter((button) => button.closest('.dialog-footer')).length).toBeGreaterThanOrEqual(2);
  });

  it('applies dictation preview props to active session text and dictation history entries only', () => {
    render(
      <VoiceAgentWidget
        {...makeProps({
          mode: 'dictation',
          finalText: 'مرحبا بالعالم',
          dictationPreviewTextProps: {
            dir: 'rtl',
            style: {
              direction: 'rtl',
              unicodeBidi: 'isolate',
              fontFamily: 'Noto Sans Arabic',
            },
          },
          session: {
            id: 'session-1',
            startedAt: Date.now(),
            mode: 'dictation',
            entries: [
              {
                timestamp: Date.now(),
                sttText: 'مرحبا',
                confidence: 0.92,
                intent: { type: 'dictation', text: 'مرحبا', raw: 'مرحبا' },
              },
              {
                timestamp: Date.now() + 1,
                sttText: '删除',
                confidence: 0.51,
                intent: { type: 'action', actionId: 'deleteSegment', raw: '删除', confidence: 0.51, fromFuzzy: false },
              },
            ],
          },
        })}
      />,
    );

    const sessionBodyText = screen.getByText('مرحبا بالعالم');
    expect(sessionBodyText.getAttribute('dir')).toBe('rtl');
    expect(sessionBodyText.style.direction).toBe('rtl');
    expect(sessionBodyText.style.unicodeBidi).toBe('isolate');
    expect(sessionBodyText.style.fontFamily).toContain('Noto Sans Arabic');

    const historyButtons = screen.getAllByRole('button', { name: /记录|Records/i });
    fireEvent.click(historyButtons[historyButtons.length - 1]!);

    const dictationHistoryText = screen.getByText('مرحبا');
    expect(dictationHistoryText.getAttribute('dir')).toBe('rtl');
    expect(dictationHistoryText.style.direction).toBe('rtl');
    expect(dictationHistoryText.style.unicodeBidi).toBe('isolate');
    expect(dictationHistoryText.style.fontFamily).toContain('Noto Sans Arabic');

    const actionHistoryText = screen.getByText('删除');
    expect(actionHistoryText.getAttribute('dir')).toBeNull();
    expect(actionHistoryText.getAttribute('style')).toBeNull();
  });

  it('ignores stale provider test results after provider changes', async () => {
    const first = createDeferred<{ available: boolean; error?: string }>();
    const second = createDeferred<{ available: boolean; error?: string }>();
    const onTestCommercialProvider = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const view = render(
      <VoiceAgentWidget
        {...makeProps({
          engine: 'commercial',
          commercialProviderKind: 'groq',
          onTestCommercialProvider,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Toggle voice settings|切换语音设置/i }));
    fireEvent.click(screen.getByRole('button', { name: /Test connection|测试连接/i }));

    view.rerender(
      <VoiceAgentWidget
        {...makeProps({
          engine: 'commercial',
          commercialProviderKind: 'minimax',
          onTestCommercialProvider,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Test connection|测试连接/i }));

    first.resolve({ available: true });
    await Promise.resolve();
    expect(screen.queryByText(/^可用$|^Available$/i)).toBeNull();

    second.resolve({ available: false, error: 'offline' });
    await waitFor(() => {
      expect(screen.getByText(/offline/i)).toBeTruthy();
    });
    expect(onTestCommercialProvider).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/^可用$|^Available$/i)).toBeNull();
  });
});
