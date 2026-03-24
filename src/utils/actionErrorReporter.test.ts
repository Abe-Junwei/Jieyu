import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportActionError } from './actionErrorReporter';
import {
  getStructuredErrorAggregation,
  resetStructuredErrorAggregation,
} from '../observability/errorAggregation';

describe('actionErrorReporter', () => {
  beforeEach(() => {
    resetStructuredErrorAggregation();
  });

  it('uses conflictMessage when error is conflict-like', () => {
    const setErrorMessage = vi.fn<(message: string) => void>();
    const error = new Error('row changed externally');

    const result = reportActionError({
      actionLabel: '批量时间偏移',
      error,
      setErrorMessage,
      conflictNames: ['TranscriptionPersistenceConflictError'],
      conflictMessage: '检测到并发冲突，请刷新后重试',
      fallbackMessage: '批量时间偏移失败，已回滚：x',
    });

    expect(result.message).toBe('检测到并发冲突，请刷新后重试');
    expect(result.meta.category).toBe('conflict');
    expect(result.meta.action).toBe('批量时间偏移');
    expect(setErrorMessage).toHaveBeenCalledWith('检测到并发冲突，请刷新后重试');
  });

  it('uses fallbackMessage when error is not conflict-like', () => {
    const setErrorMessage = vi.fn<(message: string) => void>();
    const error = new Error('network unavailable');

    const result = reportActionError({
      actionLabel: '批量时间缩放',
      error,
      setErrorMessage,
      conflictNames: ['TranscriptionPersistenceConflictError'],
      fallbackMessage: '批量时间缩放失败，已回滚：network unavailable',
    });

    expect(result.message).toBe('批量时间缩放失败，已回滚：network unavailable');
    expect(result.meta.category).toBe('action');
    expect(setErrorMessage).toHaveBeenCalledWith('批量时间缩放失败，已回滚：network unavailable');
  });

  it('falls back to default conflict-aware action message when no custom messages provided', () => {
    const setErrorMessage = vi.fn<(message: string) => void>();
    const error = new Error('disk full');

    const result = reportActionError({
      actionLabel: '正则批量拆分',
      error,
      setErrorMessage,
    });

    expect(result.message).toBe('正则批量拆分失败：disk full');
    expect(result.meta).toEqual(expect.objectContaining({
      category: 'action',
      action: '正则批量拆分',
      recoverable: true,
    }));
    expect(setErrorMessage).toHaveBeenCalledWith('正则批量拆分失败：disk full');
  });

  it('supports structured setErrorState callback', () => {
    const setErrorState = vi.fn<(payload: { message: string; meta: { category: string; action: string } }) => void>();

    const result = reportActionError({
      actionLabel: '导入文件',
      error: new Error('disk full'),
      setErrorState,
      i18nKey: 'transcription.importExport.importFailed',
    });

    expect(setErrorState).toHaveBeenCalledWith({
      message: '导入文件失败：disk full',
      meta: expect.objectContaining({
        category: 'action',
        action: '导入文件',
        i18nKey: 'transcription.importExport.importFailed',
      }),
    });
    expect(result.meta.i18nKey).toBe('transcription.importExport.importFailed');
  });

  it('uses conflictI18nKey on conflict path and fallbackI18nKey on non-conflict path', () => {
    const conflictResult = reportActionError({
      actionLabel: '导入文件',
      error: new Error('TranscriptionPersistenceConflictError: row changed externally'),
      conflictI18nKey: 'transcription.importExport.conflict',
      fallbackI18nKey: 'transcription.importExport.failed',
    });
    const actionResult = reportActionError({
      actionLabel: '导入文件',
      error: new Error('network unavailable'),
      conflictI18nKey: 'transcription.importExport.conflict',
      fallbackI18nKey: 'transcription.importExport.failed',
    });

    expect(conflictResult.meta.i18nKey).toBe('transcription.importExport.conflict');
    expect(actionResult.meta.i18nKey).toBe('transcription.importExport.failed');

    const stats = getStructuredErrorAggregation();
    expect(stats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: 'conflict',
        action: '导入文件',
        i18nKey: 'transcription.importExport.conflict',
      }),
      expect.objectContaining({
        category: 'action',
        action: '导入文件',
        i18nKey: 'transcription.importExport.failed',
      }),
    ]));
  });
});
