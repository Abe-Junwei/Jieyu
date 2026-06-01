import { describe, expect, it } from 'vitest';
import { formatStructuredAnswerEmpty } from './structuredAnswerCopy';

describe('structuredAnswerCopy', () => {
  it('selects empty structured answer copy by locale', () => {
    expect(formatStructuredAnswerEmpty('zh-CN')).toContain('结构化证据');
    expect(formatStructuredAnswerEmpty('en-US')).toContain('structured evidence');
  });
});
