import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  consumeExchangePath,
  grantExchangePath,
  resetExchangePathGrants,
} from './exchangePathGrant';

afterEach(() => {
  resetExchangePathGrants();
});

describe('exchangePathGrant', () => {
  it('returns the dialog path once for the matching session and purpose (#482)', () => {
    const id = grantExchangePath('session-a', '/tmp/in.eaf', 'import');
    expect(consumeExchangePath('session-a', id, 'import')).toBe(path.resolve('/tmp/in.eaf'));
    expect(() => consumeExchangePath('session-a', id, 'import')).toThrow(
      'exchange path is not granted',
    );
  });

  it('rejects a mismatched session, purpose, or unknown id', () => {
    const id = grantExchangePath('session-a', '/tmp/out.jyt', 'export');
    expect(() => consumeExchangePath('session-b', id, 'export')).toThrow(
      'exchange path is not granted',
    );
    expect(() => consumeExchangePath('session-a', id, 'import')).toThrow(
      'exchange path is not granted',
    );
    expect(() => consumeExchangePath('session-a', 'missing', 'export')).toThrow(
      'exchange path is not granted',
    );
  });
});
