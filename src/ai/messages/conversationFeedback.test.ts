import { describe, expect, it } from 'vitest';
import {
  formatActionClarify,
  formatAbortedMessage,
  formatEmptyModelReply,
  formatFirstChunkTimeoutError,
  formatNonActionFallback,
  formatPendingConfirmationBlockedError,
  formatSessionBudgetExceededError,
  formatStreamingBusyError,
  formatTargetClarify,
} from './conversationFeedback';

describe('conversationFeedback', () => {
  it('keeps Chinese copy as the default for existing callers', () => {
    expect(formatNonActionFallback('你好', 'concise')).toContain('你好');
    expect(formatStreamingBusyError()).toContain('生成中');
  });

  it('formats non-action and clarify messages in English when locale is en-US', () => {
    expect(formatNonActionFallback('hello', 'concise', 'en-US')).toContain('Hi');
    expect(formatActionClarify('Annotate', 'concise', 'en-US')).toContain('possible action');
    const targetClarify = formatTargetClarify(
      'Split segment',
      'missing-unit-target',
      'detailed',
      [{ label: 'Segment 1' }],
      'en-US',
    );
    expect(targetClarify).toContain('missing target segment');
    expect(targetClarify).toContain('Select the target first');
    expect(targetClarify).not.toContain('缺少目标句段');
  });

  it('formats send-turn errors in English when locale is en-US', () => {
    expect(formatEmptyModelReply('en-US')).toContain('No valid model reply');
    expect(formatStreamingBusyError('en-US')).toContain('previous reply');
    expect(formatPendingConfirmationBlockedError('en-US')).toContain('waiting for confirmation');
    expect(formatSessionBudgetExceededError(10, 8, 5, 'en-US')).toContain('token budget');
    expect(formatSessionBudgetExceededError(10, 8, 5, 'en-US')).not.toContain('预算已超限');
    expect(formatFirstChunkTimeoutError(false, 'Provider', 'en-US')).toContain('timed out');
    expect(formatAbortedMessage('en-US')).toBe('Interrupted');
  });

  it('keeps target clarify hints and session budget errors in Chinese for zh-CN', () => {
    expect(
      formatTargetClarify('拆分语段', 'missing-unit-target', 'concise', [], 'zh-CN'),
    ).toContain('缺少目标句段');
    expect(formatSessionBudgetExceededError(10, 8, 5, 'zh-CN')).toContain('token 预算已超限');
  });
});
