/** 写入失败分类（rev5 6.2）| Write-failure classification */
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { classifyStorageFailure, describeStorageFailure } from './storageFailure';

describe('classifyStorageFailure', () => {
  it.each([
    [new DOMException('q', 'QuotaExceededError'), 'quota-exceeded'],
    [new DOMException('a', 'AbortError'), 'aborted'],
    [new DOMException('t', 'TransactionInactiveError'), 'transaction-inactive'],
    [
      new DOMException('The database connection is closing.', 'InvalidStateError'),
      'connection-closed',
    ],
    [new Dexie.DatabaseClosedError(), 'connection-closed'],
    [new DOMException('v', 'VersionError'), 'version'],
    [new Error('boom'), 'unknown'],
  ] as const)('%s → %s', (error, kind) => {
    expect(classifyStorageFailure(error).kind).toBe(kind);
  });

  it('looks through Dexie AbortError wrappers for a quota error', () => {
    const wrapped = new Dexie.AbortError(
      'Transaction aborted',
      new DOMException('q', 'QuotaExceededError'),
    );
    expect(classifyStorageFailure(wrapped).kind).toBe('quota-exceeded');
  });

  it('describes failures honestly with the original error name', () => {
    expect(
      describeStorageFailure(
        classifyStorageFailure(new DOMException('full', 'QuotaExceededError')),
      ),
    ).toBe('storage quota exceeded (QuotaExceededError: full)');
  });
});
