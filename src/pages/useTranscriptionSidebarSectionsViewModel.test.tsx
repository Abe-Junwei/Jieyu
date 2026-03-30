// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { countAssistantAttentionSignals, useTranscriptionSidebarSectionsViewModel } from './useTranscriptionSidebarSectionsViewModel';

type HookInput = Parameters<typeof useTranscriptionSidebarSectionsViewModel>[0];

function createBaseInput(overrides: Partial<HookInput> = {}): HookInput {
  return {
    locale: 'zh-CN',
    isAiPanelCollapsed: false,
    hubSidebarTab: 'analysis',
    setHubSidebarTab: vi.fn(),
    aiChatContextValue: {
      aiPendingToolCall: null,
    } as HookInput['aiChatContextValue'],
    analysisTab: 'embedding',
    setAnalysisTab: vi.fn(),
    assistantRuntimeProps: {} as HookInput['assistantRuntimeProps'],
    analysisRuntimeProps: {} as HookInput['analysisRuntimeProps'],
    selectedAiWarning: false,
    selectedTranslationGapCount: 0,
    aiSidebarError: null,
    speakerDialogState: null,
    speakerSaving: false,
    closeSpeakerDialog: vi.fn(),
    confirmSpeakerDialog: vi.fn(async () => undefined),
    updateSpeakerDialogDraftName: vi.fn(),
    updateSpeakerDialogTargetKey: vi.fn(),
    showProjectSetup: false,
    setShowProjectSetup: vi.fn(),
    handleProjectSetupSubmit: vi.fn(async () => undefined),
    showAudioImport: false,
    setShowAudioImport: vi.fn(),
    handleAudioImport: vi.fn(async () => undefined),
    mediaFileInputRef: { current: null },
    handleDirectMediaImport: vi.fn(),
    audioDeleteConfirm: null,
    setAudioDeleteConfirm: vi.fn(),
    handleConfirmAudioDelete: vi.fn(),
    projectDeleteConfirm: false,
    setProjectDeleteConfirm: vi.fn(),
    handleConfirmProjectDelete: vi.fn(),
    showShortcuts: false,
    closeShortcuts: vi.fn(),
    isFocusMode: false,
    exitFocusMode: vi.fn(),
    ...overrides,
  };
}

describe('useTranscriptionSidebarSectionsViewModel', () => {
  it('counts assistant attention from all mainline signals', () => {
    expect(countAssistantAttentionSignals({
      hasPendingToolCall: true,
      selectedAiWarning: true,
      selectedTranslationGapCount: 2,
      aiSidebarError: 'provider offline',
    })).toBe(4);
  });

  it('switches back to assistant when a tool confirmation appears', async () => {
    const setHubSidebarTab = vi.fn();
    renderHook(() => useTranscriptionSidebarSectionsViewModel(createBaseInput({
      setHubSidebarTab,
      aiChatContextValue: {
        aiPendingToolCall: {
          assistantMessageId: 'msg-1',
          call: { id: 'call-1', name: 'delete_transcription_segment', arguments: {} },
        },
      } as unknown as HookInput['aiChatContextValue'],
    })));

    await waitFor(() => {
      expect(setHubSidebarTab).toHaveBeenCalledWith('assistant');
    });
  });

  it('builds assistant status summary from current sidebar signals', () => {
    const { result } = renderHook(() => useTranscriptionSidebarSectionsViewModel(createBaseInput({
      aiChatContextValue: {
        aiPendingToolCall: null,
        aiTaskSession: {
          id: 'task-1',
          status: 'waiting_confirm',
          toolName: 'set_translation_text',
          updatedAt: '2026-03-30T00:00:00.000Z',
        },
        aiInteractionMetrics: null,
        aiToolDecisionLogs: [],
      } as unknown as HookInput['aiChatContextValue'],
      selectedTranslationGapCount: 2,
    })));

    expect(result.current.aiSidebarProps.assistantStatusSummary.headline).toBe('任务进行中');
    expect(result.current.aiSidebarProps.assistantStatusSummary.chips).toContain('待补翻译 2');
  });
});