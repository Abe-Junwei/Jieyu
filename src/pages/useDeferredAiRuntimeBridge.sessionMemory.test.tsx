// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { normalizeAiChatSettings } from '../ai/providers/providerCatalog';
import { useState } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionPageAssistantBridge } from './TranscriptionPage.AssistantBridge';
import { useDeferredAiRuntimeBridge } from './useDeferredAiRuntimeBridge';
import { createInitialDeferredAiRuntimeState } from './TranscriptionPage.ReadyWorkspace.runtime';
import type { UseTranscriptionAiControllerInput } from './useTranscriptionAiController';
import { useTranscriptionAiController } from './useTranscriptionAiController';
import { AiChatCard } from '../components/ai/AiChatCard';
import { AiAssistantHubContext } from '../contexts/AiAssistantHubContext';
import { DEFAULT_AI_CHAT_CONTEXT_VALUE } from '../contexts/AiChatContext';
import { DEFAULT_VOICE_AGENT_CONTEXT_VALUE } from '../contexts/VoiceAgentContext';
import { pickAiAssistantHubContextValue } from '../hooks/ai/useAiAssistantHubContextValue';
import { pickAiChatContextValue } from '../hooks/ai/useAiChatContextValue';
import { pickVoiceAgentContextValue } from '../hooks/voice/useVoiceAgentContextValue';
import { deactivateSessionDirective } from '../ai/chat/sessionMemory';
import type { AiSessionMemory } from '../ai/chat/chatDomain.types';

vi.mock('./useTranscriptionAiController', () => ({ useTranscriptionAiController: vi.fn() }));
const initial = createInitialDeferredAiRuntimeState();
const settings = normalizeAiChatSettings({ providerKind: 'anthropic' });
const input = {} as UseTranscriptionAiControllerInput;
const hub = pickAiAssistantHubContextValue(
  pickAiChatContextValue(DEFAULT_AI_CHAT_CONTEXT_VALUE),
  pickVoiceAgentContextValue(DEFAULT_VOICE_AGENT_CONTEXT_VALUE),
);
const memory: AiSessionMemory = {
  directiveLedger: [
    {
      id: 'd1',
      category: 'response',
      scope: 'session',
      text: 'Use concise replies',
      action: 'accepted',
      source: 'user_explicit',
      confidence: 1,
      createdAt: '2026-11-06T00:00:00Z',
    },
  ],
};

function Harness() {
  const [sessionMemory, setMemory] = useState(memory);
  vi.mocked(useTranscriptionAiController).mockReturnValue({
    ...initial,
    aiChat: {
      ...initial.aiChat,
      enabled: true,
      settings,
      sessionMemory,
      deactivateSessionDirective: (id: string) =>
        setMemory((prev) => deactivateSessionDirective(prev, id)),
    },
    handleJumpToAcousticHotspot: initial.onJumpToAcousticHotspot,
  } as unknown as ReturnType<typeof useTranscriptionAiController>);
  const bridge = useDeferredAiRuntimeBridge();
  return (
    <>
      <TranscriptionPageAssistantBridge
        controllerInput={input}
        onRuntimeStateChange={bridge.handleDeferredAiRuntimeChange}
      />
      <AiAssistantHubContext.Provider
        value={{
          ...hub,
          aiChatEnabled: true,
          aiSessionMemory: bridge.deferredAiRuntimeForSidebar.aiChat.sessionMemory,
          onDeactivateAiSessionDirective:
            bridge.deferredAiRuntimeForSidebar.aiChat.deactivateSessionDirective,
        }}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>
    </>
  );
}

describe('AssistantBridge session memory to directive console', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it.each([false, true])(
    'deactivates without unrelated runtime changes (worker=%s)',
    async (worker) => {
      class SilentWorker {
        postMessage = vi.fn();
        terminate = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
      }
      vi.stubGlobal('Worker', worker ? SilentWorker : undefined);
      const view = render(<Harness />);
      await view.findByText(/Use concise replies/);
      fireEvent.click(view.getByRole('button', { name: /停用|Deactivate/i }));
      await waitFor(() => expect(view.queryByTestId('ai-directive-console-mvp')).toBeNull());
    },
  );
});
