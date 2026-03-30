import { describe, expect, it } from 'vitest';
import { buildTranscriptionAssistantStatusSummary } from './transcriptionAssistantStatusSummary';

describe('buildTranscriptionAssistantStatusSummary', () => {
  it('prioritizes pending confirmation over other assistant signals', () => {
    const summary = buildTranscriptionAssistantStatusSummary({
      locale: 'zh-CN',
      aiChatContextValue: {
        aiPendingToolCall: {
          call: { name: 'delete_transcription_segment', arguments: {} },
          assistantMessageId: 'msg-1',
          riskSummary: '将删除当前句段',
          previewContract: {
            affectedCount: 1,
            affectedIds: ['utt-1'],
            reversible: true,
          },
        },
        aiTaskSession: { id: 'task-1', status: 'executing', updatedAt: '2026-03-30T00:00:00.000Z' },
        aiInteractionMetrics: null,
        aiToolDecisionLogs: [],
      },
      selectedAiWarning: true,
      selectedTranslationGapCount: 2,
      aiSidebarError: null,
    });

    expect(summary.tone).toBe('warning');
    expect(summary.headline).toBe('待确认操作');
    expect(summary.detail).toContain('将删除当前句段');
    expect(summary.chips).toContain('影响 1');
  });

  it('surfaces active task state when no blocking issue exists', () => {
    const summary = buildTranscriptionAssistantStatusSummary({
      locale: 'en',
      aiChatContextValue: {
        aiPendingToolCall: null,
        aiTaskSession: {
          id: 'task-2',
          status: 'waiting_clarify',
          toolName: 'set_translation_text',
          candidates: [{ key: 'a', label: 'A', argsPatch: {} }],
          updatedAt: '2026-03-30T00:00:00.000Z',
        },
        aiInteractionMetrics: { turnCount: 2, successCount: 1, failureCount: 0, clarifyCount: 1, explainFallbackCount: 0, cancelCount: 0, recoveryCount: 0 },
        aiToolDecisionLogs: [{ id: 'log-1', toolName: 'set_translation_text', decision: 'clarify', timestamp: '2026-03-30T00:00:00.000Z' }],
      },
      selectedAiWarning: false,
      selectedTranslationGapCount: 0,
      aiSidebarError: null,
    });

    expect(summary.tone).toBe('warning');
    expect(summary.headline).toBe('Task in progress');
    expect(summary.detail).toContain('Waiting for clarification');
    expect(summary.chips).toContain('Options 1');
  });

  it('falls back to idle ready state when no assistant signal is active', () => {
    const summary = buildTranscriptionAssistantStatusSummary({
      locale: 'zh-CN',
      aiChatContextValue: {
        aiPendingToolCall: null,
        aiTaskSession: { id: 'task-3', status: 'idle', updatedAt: '2026-03-30T00:00:00.000Z' },
        aiInteractionMetrics: { turnCount: 0, successCount: 0, failureCount: 0, clarifyCount: 0, explainFallbackCount: 0, cancelCount: 0, recoveryCount: 0 },
        aiToolDecisionLogs: [],
      },
      selectedAiWarning: false,
      selectedTranslationGapCount: 0,
      aiSidebarError: null,
    });

    expect(summary.tone).toBe('idle');
    expect(summary.headline).toBe('助手待命');
  });
});
