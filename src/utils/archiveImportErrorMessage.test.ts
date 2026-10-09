import { describe, expect, it } from 'vitest';
import { ProjectOverwriteBlockedError, SnapshotFormatError } from '../db/snapshotFormatError';
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

  it('explains why an overwrite was refused (D5, 4.2-7, 7.4-3)', () => {
    const bytes = describeArchiveImportError(
      'en-US',
      new ProjectOverwriteBlockedError({
        reason: 'local-bytes-would-be-lost',
        message: 'raw',
        bytesAtRisk: ['media_items:m1', 'lexeme_assets:a1'],
      }),
    );
    expect(bytes).toContain('2 local');
    expect(bytes).toContain('Nothing was changed');
    const wrapped = new Error('[db.transaction:x] wrapped', {
      cause: new ProjectOverwriteBlockedError({ reason: 'snapshot-failed', message: 'raw' }),
    });
    expect(describeArchiveImportError('zh-CN', wrapped)).toContain('快照');
    expect(
      describeArchiveImportError(
        'en-US',
        new ProjectOverwriteBlockedError({ reason: 'not-allowed', message: 'raw' }),
      ),
    ).toContain('cannot be overwritten');
  });

  it('T44: a quota error, even wrapped in AbortError, says nothing was changed or deleted', () => {
    const quota = new DOMException('full', 'QuotaExceededError');
    const wrapped = Object.assign(new Error('Transaction aborted'), {
      name: 'AbortError',
      inner: quota,
    });
    const text = describeArchiveImportError('zh-CN', wrapped);
    expect(text).toContain('存储空间不足');
    expect(text).toContain('没有删除任何原件');
  });

  it('keeps other errors as they are', () => {
    expect(describeArchiveImportError('en-US', new Error('disk full'))).toBe('disk full');
  });
});
