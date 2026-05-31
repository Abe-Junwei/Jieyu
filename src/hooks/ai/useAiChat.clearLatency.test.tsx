// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { db } from '../../db';
import { featureFlags } from '../../ai/config/featureFlags';
import { useAiChat } from '../useAiChat';

const slowStreamGate: { resume: (() => void) | undefined } = { resume: undefined };

vi.mock('../../ai/ChatOrchestrator', () => {
  class MockChatOrchestrator {
    sendMessage(input: {
      userText?: string;
      history?: Array<{ content: string }>;
      options?: { signal?: AbortSignal };
    }) {
      const userText = input.userText ?? input.history?.[input.history.length - 1]?.content ?? '';
      const signal = input.options?.signal;
      async function* stream() {
        if (userText.includes('__G0_SLOW_STREAM__')) {
          yield { delta: 'part-1' };
          await new Promise<void>((resolve) => {
            if (signal?.aborted) {
              resolve();
              return;
            }
            const onAbort = () => {
              signal?.removeEventListener('abort', onAbort);
              resolve();
            };
            signal?.addEventListener('abort', onAbort);
            slowStreamGate.resume = () => {
              signal?.removeEventListener('abort', onAbort);
              resolve();
            };
          });
          if (signal?.aborted) {
            return;
          }
          yield { delta: 'part-2' };
          yield { delta: '', done: true };
          return;
        }
        yield { delta: 'x' };
        yield { delta: '', done: true };
      }
      return { messages: [], stream: stream() };
    }
  }
  return { ChatOrchestrator: MockChatOrchestrator };
});

async function clearAiTables(): Promise<void> {
  await Promise.all([
    db.ai_messages.clear(),
    db.ai_conversations.clear(),
    db.ai_session_memories.clear(),
    db.ai_tasks.clear(),
    db.audit_logs.clear(),
  ]);
}

describe('useAiChat clear latency (G0)', () => {
  beforeEach(async () => {
    slowStreamGate.resume = undefined;
    window.localStorage.removeItem('jieyu.aiChat.settings');
    window.localStorage.removeItem('jieyu.aiChat.settings.secure');
    (featureFlags as { aiChatGrayMode: boolean; aiChatRollbackMode: boolean }).aiChatGrayMode =
      false;
    (featureFlags as { aiChatGrayMode: boolean; aiChatRollbackMode: boolean }).aiChatRollbackMode =
      false;
    (featureFlags as { aiConversationManagement: boolean }).aiConversationManagement = false;
    await db.open();
    await clearAiTables();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps UI empty when clear runs during an in-flight stream', async () => {
    const { result } = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.send('__G0_SLOW_STREAM__').then(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
    });

    await act(async () => {
      result.current.clear();
    });
    expect(result.current.messages).toHaveLength(0);

    await act(async () => {
      await sendPromise;
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.messages).toHaveLength(0);
  }, 15_000);
});
