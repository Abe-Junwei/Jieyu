import { useCallback, useEffect, useRef, useState } from 'react';
import type { LLMProvider } from '../ai/providers/LLMProvider';
import { normalizeAiProviderError } from '../ai/providers/errorUtils';
import {
  formatConnectionProbeNoContentError,
  formatConnectionProbeSuccessMessage,
} from '../ai/messages';
import type { AiConnectionTestStatus } from './useAiChat.types';

interface UseAiChatConnectionProbeOptions {
  provider: LLMProvider;
  model: string;
  providerKind: string;
  apiKey: string;
  isBootstrapping: boolean;
  isStreaming: boolean;
  autoProbeIntervalMs: number;
}

export function useAiChatConnectionProbe({
  provider,
  model,
  providerKind,
  apiKey,
  isBootstrapping,
  isStreaming,
  autoProbeIntervalMs,
}: UseAiChatConnectionProbeOptions) {
  const [connectionTestStatus, setConnectionTestStatus] = useState<AiConnectionTestStatus>('idle');
  const [connectionTestMessage, setConnectionTestMessage] = useState<string | null>(null);
  const testAbortRef = useRef<AbortController | null>(null);

  const resetConnectionProbe = useCallback(() => {
    setConnectionTestStatus('idle');
    setConnectionTestMessage(null);
  }, []);

  const invalidateConnectionProbe = useCallback(() => {
    const controller = testAbortRef.current;
    testAbortRef.current = null;
    controller?.abort();
  }, []);

  const runConnectionProbe = useCallback(async (showTesting: boolean) => {
    const controller = new AbortController();
    testAbortRef.current = controller;
    const isActiveProbe = () => testAbortRef.current === controller;

    if (showTesting && isActiveProbe()) {
      setConnectionTestStatus('testing');
      setConnectionTestMessage(null);
    }

    try {
      const stream = provider.chat(
        [{ role: 'user', content: 'Reply with OK only.' }],
        {
          model,
          maxTokens: 8,
          temperature: 0,
          signal: controller.signal,
        },
      );

      let receivedAnyResponse = false;
      let receivedAnyChunk = false;
      for await (const chunk of stream) {
        receivedAnyChunk = true;
        if (chunk.error) {
          throw new Error(chunk.error);
        }
        if ((chunk.delta ?? '').trim().length > 0) {
          receivedAnyResponse = true;
        }
        if (chunk.done || receivedAnyResponse) {
          break;
        }
      }

      const acceptChunkOnly = provider.id === 'ollama';
      if (!receivedAnyResponse && !(acceptChunkOnly && receivedAnyChunk)) {
        throw new Error(formatConnectionProbeNoContentError());
      }

      if (!isActiveProbe()) return;
      setConnectionTestStatus('success');
      setConnectionTestMessage(formatConnectionProbeSuccessMessage(provider.label, showTesting));
    } catch (error) {
      if (!isActiveProbe()) return;
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        if (showTesting) {
          resetConnectionProbe();
        }
        return;
      }

      setConnectionTestStatus('error');
      setConnectionTestMessage(normalizeAiProviderError(error, provider.label));
    } finally {
      if (isActiveProbe()) {
        testAbortRef.current = null;
      }
    }
  }, [model, provider, resetConnectionProbe]);

  const testConnection = useCallback(async () => {
    await runConnectionProbe(true);
  }, [runConnectionProbe]);

  useEffect(() => {
    // 测试环境禁用自动探测，避免用例被真实网络波动干扰 | Disable auto probe in tests for deterministic runs.
    if (import.meta.env.MODE === 'test') return;
    if (isBootstrapping) return;
    if (isStreaming) return;
    if (testAbortRef.current) return;
    if (providerKind === 'mock' || providerKind === 'ollama') return;
    if (apiKey.trim().length === 0) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (isStreaming || testAbortRef.current) return;
      void runConnectionProbe(false);
    };

    tick();
    const timerId = window.setInterval(tick, autoProbeIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [apiKey, autoProbeIntervalMs, isBootstrapping, isStreaming, providerKind, runConnectionProbe]);

  return {
    connectionTestStatus,
    connectionTestMessage,
    setConnectionTestStatus,
    setConnectionTestMessage,
    resetConnectionProbe,
    invalidateConnectionProbe,
    testConnection,
  };
}
