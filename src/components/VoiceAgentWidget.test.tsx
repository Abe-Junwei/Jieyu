// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VoiceAgentWidget } from './VoiceAgentWidget';
import type { VoiceAgentWidgetProps } from './VoiceAgentWidget';

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

    fireEvent.click(screen.getByRole('button', { name: /删除/i }));
    fireEvent.click(screen.getByRole('button', { name: '取消消歧' }));

    expect(onSelectDisambiguation).toHaveBeenCalledWith('deleteSegment');
    expect(onDismissDisambiguation).toHaveBeenCalledTimes(1);
  });
});