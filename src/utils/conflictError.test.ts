import { describe, expect, it } from 'vitest';
import { hasConflictKeyword, isLikelyConflictError, isNamedConflictError } from './conflictError';

describe('conflictError utils', () => {
  it('hasConflictKeyword should match conflict messages', () => {
    expect(hasConflictKeyword('row changed externally')).toBe(true);
    expect(hasConflictKeyword('detected conflict in persistence')).toBe(true);
    expect(hasConflictKeyword('plain unknown error')).toBe(false);
  });

  it('isNamedConflictError should match known conflict names', () => {
    const err = new Error('any');
    err.name = 'TranscriptionPersistenceConflictError';
    expect(isNamedConflictError(err, ['TranscriptionPersistenceConflictError'])).toBe(true);
    expect(isNamedConflictError(err, ['OtherError'])).toBe(false);
  });

  it('isLikelyConflictError should match either by name or message keyword', () => {
    const named = new Error('foo');
    named.name = 'RecoveryApplyConflictError';

    const keyword = new Error('row changed externally by another operation');
    keyword.name = 'SomeOtherError';

    const normal = new Error('network unavailable');

    expect(isLikelyConflictError(named, ['RecoveryApplyConflictError'])).toBe(true);
    expect(isLikelyConflictError(keyword, ['RecoveryApplyConflictError'])).toBe(true);
    expect(isLikelyConflictError(normal, ['RecoveryApplyConflictError'])).toBe(false);
  });
});
