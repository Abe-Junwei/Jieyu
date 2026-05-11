// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiChatDirectiveSessionControls } from './useAiChat.directiveSessionControls';
import type { AiSessionMemory, UiChatMessage } from './useAiChat.types';

const scheduleSessionSidecarSandboxAudit = vi.fn();

vi.mock('./useAiChat.sessionSidecarAudit', () => ({
  scheduleSessionSidecarSandboxAudit: (...args: unknown[]) =>
    scheduleSessionSidecarSandboxAudit(...args),
}));

vi.mock('../../ai/config/featureFlags', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../ai/config/featureFlags')>();
  return {
    featureFlags: {
      ...mod.featureFlags,
      aiBackgroundToolSandboxEnabled: true,
    },
  };
});

vi.mock('./useAiChat.backgroundMemory', () => ({
  AI_CHAT_BACKGROUND_MEMORY_SANDBOX_PROFILE: 'readonly',
  AI_CHAT_BACKGROUND_MEMORY_SANDBOX_AUTHORIZED_DIRS: ['session-memory'],
}));

describe('useAiChatDirectiveSessionControls', () => {
  beforeEach(() => {
    scheduleSessionSidecarSandboxAudit.mockClear();
  });

  it('audits when pinning a user message with directives under a denying session sidecar sandbox', () => {
    const sessionMemoryRef: { current: AiSessionMemory } = { current: {} };
    const messages: UiChatMessage[] = [
      { id: 'usr-pin', role: 'user', content: '请记住：所有回答用英文', status: 'done' },
    ];
    const messagesRef = { current: messages };
    const setMessages = vi.fn();

    const conversationIdRef = { current: 'conv-pin' as string | null };
    const { result } = renderHook(() =>
      useAiChatDirectiveSessionControls({
        conversationIdRef,
        sessionMemoryRef,
        messagesRef,
        setMessages,
      }),
    );

    act(() => {
      result.current.toggleMessagePinned('usr-pin');
    });

    expect(sessionMemoryRef.current.pinnedMessageIds).toContain('usr-pin');
    expect(scheduleSessionSidecarSandboxAudit).toHaveBeenCalledTimes(1);
    const payload = scheduleSessionSidecarSandboxAudit.mock.calls[0]?.[0] as {
      conversationId: string;
      virtualWritePath: string;
      sourceMessageId?: string;
    };
    expect(payload.conversationId).toBe('conv-pin');
    expect(payload.virtualWritePath).toContain('pinned-message');
    expect(payload.sourceMessageId).toBe('usr-pin');
  });
});
