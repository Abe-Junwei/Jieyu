import { describe, expect, it, vi } from 'vitest';
import {
  finalizeSendTurnStream,
  handleSendTurnStreamCatch,
  type SendTurnCompletionBundle,
} from './useAiChat.sendTurnCompletion';
import { createInitialSendTurnStreamPhaseState } from './useAiChat.sendTurnStreamPhase';
import type { UiChatMessage } from './useAiChat.types';

const assistantId = 'ast-completion-test';

function assistantMessage(over: Partial<UiChatMessage> = {}): UiChatMessage {
  return {
    id: assistantId,
    role: 'assistant',
    content: 'partial body',
    status: 'streaming',
    generationSource: 'local',
    generationModel: '',
    reasoningContent: '',
    ...over,
  };
}

function makeCompletionBundle(
  over: Partial<SendTurnCompletionBundle> = {},
): SendTurnCompletionBundle {
  const phaseState = createInitialSendTurnStreamPhaseState();
  const controller = new AbortController();
  return {
    provider: { id: 'openai', label: 'OpenAI' },
    setLastError: vi.fn(),
    setIsStreaming: vi.fn(),
    setConnectionTestStatus: vi.fn(),
    setConnectionTestMessage: vi.fn(),
    setMetrics: vi.fn(),
    messagesRef: { current: [assistantMessage()] },
    onMessageCompleteRef: { current: vi.fn() },
    abortRef: { current: controller },
    assistantId,
    controller,
    phaseState,
    timedOutBeforeFirstChunk: { current: false },
    shouldTrackRemoteStatus: true,
    timeoutHandle: null,
    awaitQueuedPersistence: vi.fn().mockResolvedValue(undefined),
    finalizeAssistantMessage: vi.fn().mockResolvedValue(undefined),
    commitPrimaryStreamUsage: vi.fn(),
    ...over,
  } as SendTurnCompletionBundle;
}

describe('handleSendTurnStreamCatch', () => {
  it('treats first-chunk timeout AbortError as assistant error with timeout copy', async () => {
    const bundle = makeCompletionBundle({
      timedOutBeforeFirstChunk: { current: true },
    });
    const err = new DOMException('Aborted', 'AbortError');
    await handleSendTurnStreamCatch(bundle, err);
    expect(bundle.finalizeAssistantMessage).toHaveBeenCalledWith(
      'error',
      'partial body',
      expect.stringContaining('\u8d85\u65f6'),
    );
    expect(bundle.setLastError).toHaveBeenCalled();
  });

  it('treats user AbortError as aborted assistant turn when not timed out', async () => {
    const bundle = makeCompletionBundle({
      timedOutBeforeFirstChunk: { current: false },
    });
    const err = new DOMException('Aborted', 'AbortError');
    await handleSendTurnStreamCatch(bundle, err);
    expect(bundle.finalizeAssistantMessage).toHaveBeenCalledWith(
      'aborted',
      'partial body',
      expect.any(String),
    );
    expect(bundle.setLastError).not.toHaveBeenCalled();
  });

  it('maps non-abort errors through provider normalization', async () => {
    const bundle = makeCompletionBundle();
    await handleSendTurnStreamCatch(bundle, new Error('network boom'));
    expect(bundle.finalizeAssistantMessage).toHaveBeenCalledWith(
      'error',
      'partial body',
      expect.any(String),
    );
    expect(bundle.setLastError).toHaveBeenCalledWith(expect.any(String));
    expect(bundle.setConnectionTestStatus).toHaveBeenCalledWith('error');
  });
});

describe('finalizeSendTurnStream', () => {
  it('clears matching abort controller, stops streaming, and notifies completion', () => {
    const phaseState = createInitialSendTurnStreamPhaseState();
    phaseState.reportedInputTokens = 2;
    phaseState.totalReportedOutputTokens = 5;
    phaseState.usageObservedThisTurn = true;
    const controller = new AbortController();
    const setMetrics = vi.fn();
    const bundle = makeCompletionBundle({
      phaseState,
      controller,
      abortRef: { current: controller },
      setMetrics,
      messagesRef: { current: [assistantMessage({ content: 'final text' })] },
    });

    finalizeSendTurnStream(bundle);

    expect(bundle.abortRef.current).toBeNull();
    expect(bundle.setIsStreaming).toHaveBeenCalledWith(false);
    expect(bundle.commitPrimaryStreamUsage).toHaveBeenCalled();
    expect(setMetrics).toHaveBeenCalled();
    expect(bundle.onMessageCompleteRef.current).toHaveBeenCalledWith(assistantId, 'final text');
  });
});
