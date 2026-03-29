// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import {
  VoiceAgentProvider,
  useVoiceAgentContext,
  DEFAULT_VOICE_AGENT_CONTEXT_VALUE,
} from './VoiceAgentContext';
import type { VoiceAgentContextValue } from './VoiceAgentContext';
import type { VoiceAgentMode } from '../hooks/useVoiceAgent';

function ProviderProbe({ testId }: { testId: string }) {
  const ctx = useVoiceAgentContext();
  return (
    <div data-testid={testId}>
      <span data-testid={`${testId}-voice-mode`}>{ctx.voiceMode}</span>
      <span data-testid={`${testId}-voice-enabled`}>{String(ctx.voiceEnabled)}</span>
      <span data-testid={`${testId}-voice-listening`}>{String(ctx.voiceListening)}</span>
      <span data-testid={`${testId}-voice-error`}>{ctx.voiceError ?? 'null'}</span>
    </div>
  );
}

function ThrowProbe() {
  useVoiceAgentContext();
  return null;
}

describe('VoiceAgentContext', () => {
  it('throws when used outside VoiceAgentProvider', () => {
    expect(() => render(<ThrowProbe />)).toThrow(
      'useVoiceAgentContext must be used within <VoiceAgentProvider>',
    );
  });

  it('renders with default values when no value prop provided', () => {
    const { getByTestId } = render(
      <VoiceAgentProvider value={DEFAULT_VOICE_AGENT_CONTEXT_VALUE}>
        <ProviderProbe testId="default" />
      </VoiceAgentProvider>,
    );

    expect(getByTestId('default-voice-mode').textContent).toBe('command');
    expect(getByTestId('default-voice-enabled').textContent).toBe('false');
    expect(getByTestId('default-voice-listening').textContent).toBe('false');
    expect(getByTestId('default-voice-error').textContent).toBe('null');
  });

  it('renders with custom values', () => {
    const customValue = {
      ...DEFAULT_VOICE_AGENT_CONTEXT_VALUE,
      voiceMode: 'dictation' as VoiceAgentMode,
      voiceEnabled: true,
      voiceListening: true,
      voiceError: 'Microphone not found',
    };

    const { getByTestId } = render(
      <VoiceAgentProvider value={customValue}>
        <ProviderProbe testId="custom" />
      </VoiceAgentProvider>,
    );

    expect(getByTestId('custom-voice-mode').textContent).toBe('dictation');
    expect(getByTestId('custom-voice-enabled').textContent).toBe('true');
    expect(getByTestId('custom-voice-listening').textContent).toBe('true');
    expect(getByTestId('custom-voice-error').textContent).toBe('Microphone not found');
  });

  it('provides all callback functions as undefined by default', () => {
    const ctx = DEFAULT_VOICE_AGENT_CONTEXT_VALUE;
    expect(ctx.onVoiceToggle).toBeUndefined();
    expect(ctx.onVoiceSwitchMode).toBeUndefined();
    expect(ctx.onVoiceConfirm).toBeUndefined();
    expect(ctx.onVoiceCancel).toBeUndefined();
    expect(ctx.onVoiceSetSafeMode).toBeUndefined();
    expect(ctx.onVoiceSetLangOverride).toBeUndefined();
  });

  it('renders with callbacks when provided', () => {
    const onVoiceToggle = vi.fn();
    const onVoiceSwitchMode = vi.fn();
    const onVoiceConfirm = vi.fn();
    const onVoiceCancel = vi.fn();
    const onVoiceSetSafeMode = vi.fn();
    const onVoiceSetLangOverride = vi.fn();

    const customValue = {
      ...DEFAULT_VOICE_AGENT_CONTEXT_VALUE,
      onVoiceToggle,
      onVoiceSwitchMode,
      onVoiceConfirm,
      onVoiceCancel,
      onVoiceSetSafeMode,
      onVoiceSetLangOverride,
    };

    render(
      <VoiceAgentProvider value={customValue}>
        <ProviderProbe testId="callbacks" />
      </VoiceAgentProvider>,
    );

    // Callbacks are provided and callable
    expect(typeof customValue.onVoiceToggle).toBe('function');
    expect(typeof customValue.onVoiceSwitchMode).toBe('function');
    expect(typeof customValue.onVoiceConfirm).toBe('function');
    expect(typeof customValue.onVoiceCancel).toBe('function');
    expect(typeof customValue.onVoiceSetSafeMode).toBe('function');
    expect(typeof customValue.onVoiceSetLangOverride).toBe('function');
  });

  it('renders with pending confirm state', () => {
    const customValue: VoiceAgentContextValue = {
      ...DEFAULT_VOICE_AGENT_CONTEXT_VALUE,
      voicePendingConfirm: { actionId: 'deleteSegment', label: '确认删除', fromFuzzy: true },
    };

    render(
      <VoiceAgentProvider value={customValue}>
        <ProviderProbe testId="pending" />
      </VoiceAgentProvider>,
    );

    expect(customValue.voicePendingConfirm).toEqual({ actionId: 'deleteSegment', label: '确认删除', fromFuzzy: true });
  });

  it('renders with lang override', () => {
    const customValue = {
      ...DEFAULT_VOICE_AGENT_CONTEXT_VALUE,
      voiceLangOverride: 'eng',
      voiceCorpusLang: 'cmn',
    };

    render(
      <VoiceAgentProvider value={customValue}>
        <ProviderProbe testId="lang" />
      </VoiceAgentProvider>,
    );

    expect(customValue.voiceLangOverride).toBe('eng');
    expect(customValue.voiceCorpusLang).toBe('cmn');
  });

  it('renders with speech active state', () => {
    const customValue = {
      ...DEFAULT_VOICE_AGENT_CONTEXT_VALUE,
      voiceSpeechActive: true,
    };

    render(
      <VoiceAgentProvider value={customValue}>
        <ProviderProbe testId="speech" />
      </VoiceAgentProvider>,
    );

    expect(customValue.voiceSpeechActive).toBe(true);
  });

  it('renders with confidence value', () => {
    const customValue = {
      ...DEFAULT_VOICE_AGENT_CONTEXT_VALUE,
      voiceConfidence: 0.85,
    };

    render(
      <VoiceAgentProvider value={customValue}>
        <ProviderProbe testId="confidence" />
      </VoiceAgentProvider>,
    );

    expect(customValue.voiceConfidence).toBe(0.85);
  });
});
