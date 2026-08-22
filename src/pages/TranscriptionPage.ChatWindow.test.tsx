// @vitest-environment jsdom

import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_CHAT_CONTEXT_VALUE, type AiChatContextValue } from '../contexts/AiChatContext';
import {
  REQUEST_AGENT_LOOP_RESUME_EVENT,
  type RequestAgentLoopResumeDetail,
} from '../ai/tasks/taskRefreshEvents';
import { TranscriptionPageChatWindow } from './TranscriptionPage.ChatWindow';
import type { TranscriptionPageAssistantRuntimeProps } from './TranscriptionPage.runtimeContracts';

vi.mock('./TranscriptionPage.AssistantRuntime', () => ({
  TranscriptionPageAssistantRuntime: () => null,
}));

function makeAssistantRuntimeProps(
  aiChatOverrides: Partial<AiChatContextValue> = {},
): TranscriptionPageAssistantRuntimeProps {
  return {
    aiChatContextValue: {
      ...DEFAULT_AI_CHAT_CONTEXT_VALUE,
      ...aiChatOverrides,
    },
    frame: {
      saveState: {
        kind: 'idle',
      } as unknown as TranscriptionPageAssistantRuntimeProps['frame']['saveState'],
      recording: false,
      recordingUnitId: null,
      recordingError: null,
      tf: () => '',
    },
    voice: {
      context: {
        activeTextPrimaryLanguageId: null,
        getActiveTextPrimaryLanguageId: async () => null,
      },
      actions: {
        intent: {
          executeAction: () => undefined,
          handleResolveVoiceIntentWithLlm: async () => null,
        },
        writeback: {
          handleVoiceDictation: () => undefined,
          handleVoiceAnalysisResult: () => undefined,
        },
        lifecycle: {
          onRegisterToggleVoice: () => undefined,
        },
      },
      target: {
        selection: {
          activeUnitId: null,
          selectedUnit: null,
          selectedRowMeta: null,
          selectedLayerId: null,
          selectedUnitKind: null,
        },
        translationLayers: [],
        layers: [],
        formatSidePaneLayerLabel: () => '',
        formatTime: () => '',
      },
    },
    locale: 'zh-CN',
  };
}

describe('TranscriptionPageChatWindow agent-loop resume bridge', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.removeItem('jieyu.aiChat.resumeAgentLoopTaskId');
    window.localStorage.removeItem('jieyu.aiChatWindow.v1');
  });

  it('stores requested task id and sends default resume input when resume event arrives', async () => {
    const onSendAiMessage = vi.fn(async () => undefined);
    render(
      <TranscriptionPageChatWindow
        locale="zh-CN"
        assistantRuntimeProps={makeAssistantRuntimeProps({
          onSendAiMessage,
          aiIsStreaming: false,
        })}
      />,
    );

    await act(async () => {
      // Ensure event listeners are attached before dispatching.
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent<RequestAgentLoopResumeDetail>(REQUEST_AGENT_LOOP_RESUME_EVENT, {
          detail: { taskId: 'task_agent_loop_resume_1' },
        }),
      );
    });

    expect(window.sessionStorage.getItem('jieyu.aiChat.resumeAgentLoopTaskId')).toBe(
      'task_agent_loop_resume_1',
    );
    expect(onSendAiMessage).toHaveBeenCalledTimes(1);
    expect(onSendAiMessage).toHaveBeenCalledWith('继续');
  });

  it('still stores task id but does not send resume input while chat is streaming', async () => {
    const onSendAiMessage = vi.fn(async () => undefined);
    render(
      <TranscriptionPageChatWindow
        locale="zh-CN"
        assistantRuntimeProps={makeAssistantRuntimeProps({
          onSendAiMessage,
          aiIsStreaming: true,
        })}
      />,
    );

    await act(async () => {
      // Ensure event listeners are attached before dispatching.
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent<RequestAgentLoopResumeDetail>(REQUEST_AGENT_LOOP_RESUME_EVENT, {
          detail: { taskId: 'task_agent_loop_resume_2' },
        }),
      );
    });

    expect(window.sessionStorage.getItem('jieyu.aiChat.resumeAgentLoopTaskId')).toBe(
      'task_agent_loop_resume_2',
    );
    expect(onSendAiMessage).not.toHaveBeenCalled();
  });

  it('opens the floating window when a tool confirmation appears', async () => {
    render(
      <TranscriptionPageChatWindow
        locale="zh-CN"
        assistantRuntimeProps={makeAssistantRuntimeProps({
          aiPendingToolCall: {
            assistantMessageId: 'msg-1',
            call: { name: 'delete_transcription_segment', arguments: {} },
          },
        })}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('.transcription-chat-window')).not.toBeNull();
    });
  });

  it('temporarily maximizes the floating window and restores the previous size', async () => {
    render(
      <TranscriptionPageChatWindow
        locale="zh-CN"
        assistantRuntimeProps={makeAssistantRuntimeProps()}
      />,
    );

    fireEvent.click(
      document.querySelector('.transcription-chat-window-trigger') as HTMLButtonElement,
    );

    await waitFor(() => {
      expect(document.querySelector('.transcription-chat-window')).not.toBeNull();
    });

    const panel = document.querySelector('.transcription-chat-window') as HTMLElement;
    const previousWidth = panel.style.width;
    const maximize = document.querySelector(
      '[data-testid="transcription-chat-window-maximize"]',
    ) as HTMLButtonElement;
    fireEvent.click(maximize);

    await waitFor(() => {
      expect(panel.classList.contains('is-maximized')).toBe(true);
    });
    expect(panel.style.width).toBe(`${window.innerWidth - 28}px`);
    expect(panel.style.height).toBe(`${window.innerHeight - 28}px`);

    fireEvent.click(maximize);
    await waitFor(() => {
      expect(panel.classList.contains('is-maximized')).toBe(false);
    });
    expect(panel.style.width).toBe(previousWidth);
  });
});
