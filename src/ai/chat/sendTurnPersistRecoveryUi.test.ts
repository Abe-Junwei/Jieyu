import { describe, expect, it } from 'vitest';
import { isSendTurnPersistLayerRecoveryHintMessage } from './sendTurnPersistRecoveryUi';

describe('sendTurnPersistRecoveryUi', () => {
  it('detects en-US persist recovery hint', () => {
    expect(
      isSendTurnPersistLayerRecoveryHintMessage(
        'Local session save failed (on-screen text is kept as far as possible). Retry shortly, or check browser storage and IndexedDB space. Current model label: Mock',
      ),
    ).toBe(true);
  });

  it('detects zh-CN persist recovery hint prefix', () => {
    expect(
      isSendTurnPersistLayerRecoveryHintMessage(
        '\u672c\u5730\u4f1a\u8bdd\u5b58\u6863\u5931\u8d25\uff08\u754c\u9762\u6587\u672c\u5df2\u5c3d\u91cf\u4fdd\u7559\uff09\u3002',
      ),
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isSendTurnPersistLayerRecoveryHintMessage('network error')).toBe(false);
    expect(isSendTurnPersistLayerRecoveryHintMessage('')).toBe(false);
  });
});
