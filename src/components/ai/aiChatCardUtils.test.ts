import { describe, expect, it } from 'vitest';
import { buildPinnedSummary, formatPendingTarget, formatPolicyReasonExplanation } from './aiChatCardUtils';

describe('aiChatCardUtils', () => {
  it.each([
    ['previous', '前一个句段'],
    ['next', '后一个句段'],
    ['penultimate', '倒数第二个句段'],
    ['middle', '中间那个句段'],
  ])('formats pending delete selector target for %s', (segmentPosition, expectedLabel) => {
    const value = formatPendingTarget(true, {
      name: 'delete_transcription_segment',
      arguments: { segmentPosition },
    });

    expect(value).toBe(expectedLabel);
  });

  it('formats known policy reason code into readable explanation', () => {
    expect(formatPolicyReasonExplanation(false, 'user_directive_confirmation_required'))
      .toContain('requires confirmation before execution');
    expect(formatPolicyReasonExplanation(true, 'user_directive_confirmation_required'))
      .toContain('要求先确认再执行');
  });

  it('buildPinnedSummary clips directive-style user text', () => {
    const zh = buildPinnedSummary('请记住：所有回答用英文', true);
    expect(zh.length).toBeGreaterThan(0);
    expect(zh).toContain('英文');
    const en = buildPinnedSummary('Remember: answer in English', false);
    expect(en.length).toBeGreaterThan(0);
  });
});