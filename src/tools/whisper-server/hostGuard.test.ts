import { describe, expect, it } from 'vitest';

import { isAllowedHostHeader } from './hostGuard.js';

describe('whisper-server isAllowedHostHeader', () => {
  it('accepts localhost and 127.0.0.1 with or without port', () => {
    for (const h of [
      'localhost',
      'localhost:3040',
      '127.0.0.1',
      '127.0.0.1:3040',
      'LOCALHOST:3040',
    ]) {
      expect(isAllowedHostHeader(h)).toBe(true);
    }
  });

  it('rejects missing, LAN, rebinding and malformed hosts', () => {
    for (const h of [
      undefined,
      '',
      '192.168.1.5:3040',
      'evil.example:3040',
      'localhost.evil.example',
      'a b',
    ]) {
      expect(isAllowedHostHeader(h)).toBe(false);
    }
  });

  it('accepts an explicit non-wildcard bind host, never a wildcard', () => {
    expect(isAllowedHostHeader('192.168.1.5:3040', '192.168.1.5')).toBe(true);
    expect(isAllowedHostHeader('192.168.1.5:3040', '0.0.0.0')).toBe(false);
  });
});
