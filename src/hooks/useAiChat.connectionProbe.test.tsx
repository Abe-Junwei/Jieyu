// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LLMProvider } from '../ai/providers/LLMProvider';
import { useAiChatConnectionProbe } from './useAiChat.connectionProbe';

describe('useAiChatConnectionProbe', () => {
  it('aborts the in-flight probe when invalidated', async () => {
    let capturedSignal: AbortSignal | undefined;
    const provider: LLMProvider = {
      id: 'deepseek',
      label: 'DeepSeek',
      supportsStreaming: true,
      async *chat(_messages, options) {
        capturedSignal = options?.signal;
        await new Promise<void>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        });
      },
    };

    const { result } = renderHook(() => useAiChatConnectionProbe({
      provider,
      model: 'test-model',
      providerKind: 'deepseek',
      apiKey: 'sk-test',
      isBootstrapping: false,
      isStreaming: false,
      autoProbeIntervalMs: 60_000,
    }));

    let probePromise: Promise<void> | undefined;
    await act(async () => {
      probePromise = result.current.testConnection();
    });

    await waitFor(() => {
      expect(result.current.connectionTestStatus).toBe('testing');
      expect(capturedSignal).toBeDefined();
    });

    act(() => {
      result.current.invalidateConnectionProbe();
      result.current.resetConnectionProbe();
    });

    expect(capturedSignal?.aborted).toBe(true);

    await act(async () => {
      await probePromise;
    });

    expect(result.current.connectionTestStatus).toBe('idle');
  });
});
