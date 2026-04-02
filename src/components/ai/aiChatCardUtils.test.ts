import { describe, expect, it } from 'vitest';
import { formatPendingTarget } from './aiChatCardUtils';

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
});