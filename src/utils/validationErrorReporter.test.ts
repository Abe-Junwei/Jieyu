import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportValidationError } from './validationErrorReporter';
import { getStructuredErrorAggregation, resetStructuredErrorAggregation } from '../observability/errorAggregation';

describe('validationErrorReporter', () => {
  beforeEach(() => {
    resetStructuredErrorAggregation();
  });

  it('reports provided validation message', () => {
    const setErrorMessage = vi.fn<(message: string) => void>();

    const result = reportValidationError({
      message: '请先选择要处理的句段',
      setErrorMessage,
      action: '选择句段',
    });

    expect(result.message).toBe('请先选择要处理的句段');
    expect(result.meta).toEqual(expect.objectContaining({
      category: 'validation',
      action: '选择句段',
      recoverable: true,
    }));
    expect(setErrorMessage).toHaveBeenCalledWith('请先选择要处理的句段');
  });

  it('uses fallback message when input message is blank', () => {
    const setErrorMessage = vi.fn<(message: string) => void>();

    const result = reportValidationError({
      message: '   ',
      setErrorMessage,
      fallbackMessage: '默认前置校验错误',
    });

    expect(result.message).toBe('默认前置校验错误');
    expect(setErrorMessage).toHaveBeenCalledWith('默认前置校验错误');
  });

  it('supports structured setErrorState callback', () => {
    const setErrorState = vi.fn<(payload: { message: string; meta: { category: string; action: string } }) => void>();

    reportValidationError({
      message: '请先选择句段',
      action: '批量合并',
      setErrorState,
      i18nKey: 'transcription.action.mergeSelectionRequireOne',
    });

    expect(setErrorState).toHaveBeenCalledWith({
      message: '请先选择句段',
      meta: expect.objectContaining({
        category: 'validation',
        action: '批量合并',
        i18nKey: 'transcription.action.mergeSelectionRequireOne',
      }),
    });

    const stats = getStructuredErrorAggregation();
    expect(stats).toEqual([
      expect.objectContaining({
        category: 'validation',
        action: '批量合并',
        i18nKey: 'transcription.action.mergeSelectionRequireOne',
        count: 1,
      }),
    ]);
  });
});
