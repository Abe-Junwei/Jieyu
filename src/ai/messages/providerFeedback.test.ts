import { describe, expect, it } from 'vitest';
import {
  formatConnectionHealthyMessage,
  formatConnectionProbeNoContentError,
  formatConnectionProbeSuccessMessage,
  formatEmptyModelResponseError,
} from './providerFeedback';

describe('providerFeedback', () => {
  it('keeps Chinese copy as the default and supports English locale', () => {
    expect(formatConnectionProbeNoContentError()).toContain('连接测试');
    expect(formatConnectionProbeNoContentError('en-US')).toContain('Connection test');
    expect(formatConnectionProbeSuccessMessage('OpenAI', true, 'en-US')).toContain('succeeded');
    expect(formatConnectionHealthyMessage('OpenAI', 'en-US')).toContain('healthy');
    expect(formatEmptyModelResponseError('en-US')).toContain('empty response');
  });
});
