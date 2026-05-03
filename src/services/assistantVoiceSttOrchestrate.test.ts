import { describe, expect, it, vi, afterEach } from 'vitest';
import { runVoiceFinalSttResolutionTail } from './assistantVoiceSttOrchestrate';
import * as intentDispatch from './assistantVoiceIntentDispatch';
import type { VoiceSession } from './IntentRouter';
import type { SttResult } from './VoiceInputService';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runVoiceFinalSttResolutionTail', () => {
  it('invokes afterIntentResolved, then append + commit, then awaits dispatch (implementation order)', async () => {
    const order: string[] = [];
    const appendSpy = vi.spyOn(intentDispatch, 'appendTurnToVoiceSession');
    const dispatchSpy = vi.spyOn(intentDispatch, 'dispatchResolvedVoiceIntent').mockImplementation(async () => {
      order.push('dispatch');
    });

    const baseSession: VoiceSession = {
      id: 'vs-1',
      startedAt: 1,
      entries: [],
      mode: 'command',
    };
    const sttResult: SttResult = {
      text: 'hello',
      lang: 'en-US',
      isFinal: true,
      confidence: 0.9,
      engine: 'web-speech',
    };

    await runVoiceFinalSttResolutionTail({
      baseSession,
      intent: { type: 'chat', text: 'hello', raw: 'hello' },
      sttResult,
      llmFallbackFailed: false,
      afterIntentResolved: () => {
        order.push('afterIntent');
      },
      commitAppendedSession: () => {
        expect(appendSpy).toHaveBeenCalledTimes(1);
        order.push('commit');
      },
      locale: 'en-US',
      safeMode: false,
      intentRouter: {
        shouldConfirmFuzzyAction: () => false,
        isDestructiveAction: () => false,
      },
      executeAction: vi.fn(),
      queueAiThinking: vi.fn(),
      setError: vi.fn(),
      setAgentState: vi.fn(),
      setPendingConfirm: vi.fn(),
      inputModality: 'voice',
    });

    expect(order).toEqual(['afterIntent', 'commit', 'dispatch']);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });
});
