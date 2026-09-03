import { describe, expect, it } from 'vitest';
import { formatSemanticGuardBlockedMessage } from './semanticGuardFeedback';

describe('formatSemanticGuardBlockedMessage', () => {
  it('returns zh-CN copy by default', () => {
    expect(formatSemanticGuardBlockedMessage()).toContain('安全护栏');
  });

  it('returns en-US copy when locale is en-US', () => {
    expect(formatSemanticGuardBlockedMessage('en-US')).toContain('local safety guard');
  });
});
