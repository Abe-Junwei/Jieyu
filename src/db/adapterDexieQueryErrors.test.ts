import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isDexieIndexedQueryFallbackError,
  reportIfUnexpectedDexieDegradation,
  runDexieIndexedQueryOrElse,
} from './adapterDexieQueryErrors';

describe('isDexieIndexedQueryFallbackError', () => {
  it('returns true for typical Dexie not-indexed messages', () => {
    expect(isDexieIndexedQueryFallbackError(new Error('KeyPath frob is not indexed'))).toBe(true);
    expect(isDexieIndexedQueryFallbackError(new Error('NOT INDEXED on keyPath'))).toBe(true);
  });

  it('returns true for keypath invalid style messages', () => {
    expect(isDexieIndexedQueryFallbackError(new Error('KeyPath "x" is invalid for this store'))).toBe(true);
  });

  it('uses Dexie errnames with message when available', () => {
    const schema = new Error('KeyPath "x" is not valid');
    schema.name = Dexie.errnames.Schema;
    expect(isDexieIndexedQueryFallbackError(schema)).toBe(true);

    const noDetail = new Error('corrupt');
    noDetail.name = Dexie.errnames.Schema;
    expect(isDexieIndexedQueryFallbackError(noDetail)).toBe(false);
  });

  it('returns false for unrelated storage failures', () => {
    expect(isDexieIndexedQueryFallbackError(new Error('QuotaExceededError'))).toBe(false);
    expect(isDexieIndexedQueryFallbackError(new Error('Database closed'))).toBe(false);
    expect(isDexieIndexedQueryFallbackError(new Error('Unknown internal error'))).toBe(false);
  });
});

describe('runDexieIndexedQueryOrElse', () => {
  it('returns indexed result when the query succeeds', async () => {
    const result = await runDexieIndexedQueryOrElse(
      'test',
      async () => 42,
      async () => 0,
    );
    expect(result).toBe(42);
  });

  it('invokes fallback when indexed throws a fallback-class error', async () => {
    const e = new Error('KeyPath x is not indexed');
    const result = await runDexieIndexedQueryOrElse(
      'test',
      async () => {
        throw e;
      },
      async () => 'fallback',
    );
    expect(result).toBe('fallback');
  });

  it('invokes fallback when indexed throws a non-fallback error (and still recovers)', async () => {
    const result = await runDexieIndexedQueryOrElse(
      'test',
      async () => {
        throw new Error('disk full');
      },
      async () => 'ok',
    );
    expect(result).toBe('ok');
  });
});

describe('reportIfUnexpectedDexieDegradation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('always calls console.debug with the error', () => {
    const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const e = new Error('quota');
    reportIfUnexpectedDexieDegradation('t', e, 'label:');
    expect(dbg).toHaveBeenCalledWith('label:', e);
  });
});
