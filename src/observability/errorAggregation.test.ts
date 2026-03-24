import { beforeEach, describe, expect, it } from 'vitest';
import {
  getStructuredErrorAggregation,
  recordStructuredError,
  resetStructuredErrorAggregation,
} from './errorAggregation';

describe('errorAggregation', () => {
  beforeEach(() => {
    resetStructuredErrorAggregation();
  });

  it('aggregates same error bucket by category/action/recoverable/i18nKey', () => {
    recordStructuredError({
      category: 'conflict',
      action: '导入文件',
      recoverable: true,
      i18nKey: 'transcription.importExport.conflict',
    });
    recordStructuredError({
      category: 'conflict',
      action: '导入文件',
      recoverable: true,
      i18nKey: 'transcription.importExport.conflict',
    });

    const stats = getStructuredErrorAggregation();
    expect(stats).toHaveLength(1);
    expect(stats[0]).toEqual(expect.objectContaining({
      category: 'conflict',
      action: '导入文件',
      recoverable: true,
      i18nKey: 'transcription.importExport.conflict',
      count: 2,
    }));
    expect(stats[0]?.lastSeenAt).toBeTruthy();
  });

  it('keeps different i18nKey in different buckets', () => {
    recordStructuredError({
      category: 'action',
      action: '导入文件',
      recoverable: true,
      i18nKey: 'transcription.importExport.failed',
    });
    recordStructuredError({
      category: 'action',
      action: '导入文件',
      recoverable: true,
      i18nKey: 'transcription.action.audioImportFailed',
    });

    const stats = getStructuredErrorAggregation();
    expect(stats).toHaveLength(2);
    expect(stats.every((entry) => entry.count === 1)).toBe(true);
  });
});
