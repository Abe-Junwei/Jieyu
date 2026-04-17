import { describe, expect, it } from 'vitest';
import { formatTaskTraceOutcome } from './aiChatCardFollowUps';
import type { AiTaskTraceEntry } from '../../ai/chat/chatDomain.types';

function makeEntry(outcome?: AiTaskTraceEntry['outcome']): AiTaskTraceEntry {
  return {
    phase: 'answer',
    stepNumber: 1,
    timestamp: '2026-04-17T00:00:00.000Z',
    ...(outcome !== undefined ? { outcome } : {}),
  };
}

describe('formatTaskTraceOutcome', () => {
  it('returns zh status labels from centralized message catalog', () => {
    expect(formatTaskTraceOutcome(makeEntry('clarify'), true)).toBe('需澄清');
    expect(formatTaskTraceOutcome(makeEntry('error'), true)).toBe('失败');
    expect(formatTaskTraceOutcome(makeEntry('done'), true)).toBe('完成');
    expect(formatTaskTraceOutcome(makeEntry(undefined), true)).toBe('进行中');
  });

  it('returns en status labels from centralized message catalog', () => {
    expect(formatTaskTraceOutcome(makeEntry('clarify'), false)).toBe('Needs input');
    expect(formatTaskTraceOutcome(makeEntry('error'), false)).toBe('Error');
    expect(formatTaskTraceOutcome(makeEntry('done'), false)).toBe('Done');
    expect(formatTaskTraceOutcome(makeEntry(undefined), false)).toBe('Running');
  });
});
