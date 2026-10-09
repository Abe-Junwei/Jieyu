import { describe, expect, it } from 'vitest';
import { SnapshotFormatError } from '../db/snapshotFormatError';
import { describeArchiveImportError } from './archiveImportErrorMessage';

describe('describeArchiveImportError (RD-1)', () => {
  it('names the old database instead of showing a zod dump', () => {
    const error = new Error('[db.transaction:x] wrapped', {
      cause: new SnapshotFormatError({
        code: 'legacy-database',
        message: 'raw',
        schemaVersion: 4,
        dbName: 'jieyudb_v2',
      }),
    });
    const text = describeArchiveImportError('zh-CN', error);
    expect(text).toContain('jieyudb_v2');
    expect(text).toContain('旧版本');
    expect(text).not.toContain('{');
  });

  it('lists invalid record counts per collection', () => {
    const text = describeArchiveImportError(
      'en-US',
      new SnapshotFormatError({
        code: 'invalid-records',
        message: 'raw',
        invalidCollections: [
          { collection: 'media_items', invalid: 3, firstIssue: 'timelineKind: Required' },
          { collection: 'structural_rule_profiles', invalid: 1, firstIssue: 'scope' },
        ],
      }),
    );
    expect(text).toContain('4 record(s)');
    expect(text).toContain('media_items ×3');
  });

  it('keeps other errors as they are', () => {
    expect(describeArchiveImportError('en-US', new Error('disk full'))).toBe('disk full');
  });
});
