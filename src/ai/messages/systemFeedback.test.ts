import { describe, expect, it } from 'vitest';
import {
  formatAiChatDisabledError,
  formatDuplicateRequestIgnoredDetail,
  formatDuplicateRequestIgnoredError,
  formatHistoryLoadFailedFallbackError,
  formatInvalidArgsError,
  formatNoExecutorInternalError,
  formatNoExecutorToolFailureDetail,
  formatRecoveredInterruptedMessage,
  formatToolExecutionFallbackError,
} from './systemFeedback';

describe('systemFeedback', () => {
  it('keeps Chinese copy as the default and supports English locale', () => {
    expect(formatAiChatDisabledError()).toContain('未启用');
    expect(formatAiChatDisabledError('en-US')).toContain('not enabled');
    expect(formatHistoryLoadFailedFallbackError('en-US')).toContain('Failed to load');
    expect(formatRecoveredInterruptedMessage('en-US')).toContain('interrupted');
    expect(formatNoExecutorToolFailureDetail('en-US')).toContain('executor');
    expect(formatNoExecutorInternalError('en-US')).toContain('executor');
    expect(formatToolExecutionFallbackError('en-US')).toContain('failed');
    expect(formatDuplicateRequestIgnoredDetail('en-US')).toContain('idempotency');
    expect(formatDuplicateRequestIgnoredError('en-US')).toContain('Duplicate');
    expect(formatInvalidArgsError('bad payload', 'en-US')).toContain('bad payload');
  });
});
