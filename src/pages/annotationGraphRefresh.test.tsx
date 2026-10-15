// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';
import { useAnnotationAlternativeAnalysisController } from './useAnnotationAlternativeAnalysisController';
import { useAnnotationMweController } from './useAnnotationMweController';
import { useAnnotationPosBatchController } from './useAnnotationPosBatchController';
import { useAnnotationRelationController } from './useAnnotationRelationController';

const saveGraph = vi.hoisted(() => vi.fn());
const savePos = vi.hoisted(() => vi.fn(async (_writes?: unknown) => 1));

vi.mock('./annotation/saveAnnotationUnitAnalysisGraph', () => ({
  saveAnnotationUtteranceGraphChange: (...args: unknown[]) => saveGraph(...args),
}));

vi.mock('./annotation/saveAnnotationPosByForm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./annotation/saveAnnotationPosByForm')>();
  return {
    ...actual,
    saveAnnotationPosByForm: (writes: Parameters<typeof actual.saveAnnotationPosByForm>[0]) =>
      savePos(writes),
  };
});

const row: AnnotationIgtRow = {
  id: 'u1',
  timeLabel: '0',
  startTime: 0,
  endTime: 1,
  mediaId: 'm',
  surface: 'ka',
  tokens: [{ id: 't1', form: 'ka', gloss: '', pos: '', glossLang: 'en' }],
  translation: '',
  transcriptionHref: '',
};

const graphInput = {
  row,
  tokenDrafts: {},
  morphDrafts: {},
  morphsByTokenId: {},
  linksByTokenId: {},
};

describe('annotation refresh after a saved graph write', () => {
  beforeEach(() => {
    saveGraph.mockReset();
    saveGraph.mockResolvedValue({ id: 'graph' });
    savePos.mockClear();
  });

  it('keeps the MWE selection and does not write again when refresh fails', async () => {
    const reload = vi.fn().mockRejectedValue(new Error('refresh'));
    const { result } = renderHook(() => useAnnotationMweController('text-1', reload));
    act(() => {
      result.current.toggle('u1', 't1');
    });

    await act(async () => {
      await result.current.confirm(graphInput);
    });
    expect(saveGraph).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('stale');
    expect(result.current.selectedByUnit.u1).toEqual(['t1']);

    await act(async () => {
      await result.current.confirm(graphInput);
    });
    expect(saveGraph).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(2);

    reload.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.retryRefresh();
    });
    expect(saveGraph).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('');
    expect(result.current.selectedByUnit.u1).toEqual([]);
  });

  it('reports a failed graph write without refreshing', async () => {
    const reload = vi.fn();
    saveGraph.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useAnnotationRelationController('text-1', reload));
    await act(async () => {
      await result.current.apply({
        ...graphInput,
        mark: { kind: 'allomorph', morphId: 't1' },
      });
    });
    expect(result.current.error).toBe('failed');
    expect(reload).not.toHaveBeenCalled();
  });

  it('retries an alternative-analysis refresh without writing the graph again', async () => {
    const reload = vi.fn().mockRejectedValue(new Error('refresh'));
    const { result } = renderHook(() =>
      useAnnotationAlternativeAnalysisController('text-1', reload),
    );
    await act(async () => {
      await result.current.select({ ...graphInput, relationId: 'rel-1' });
    });
    expect(result.current.error).toBe('stale');
    reload.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.addPos({ ...graphInput, tokenId: 't1', pos: 'N' });
    });
    expect(saveGraph).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('');
  });

  it('does not write the part of speech again while a refresh is still pending', async () => {
    const reload = vi.fn().mockRejectedValue(new Error('refresh'));
    const clearDrafts = vi.fn();
    const { result } = renderHook(() => useAnnotationPosBatchController(reload, clearDrafts));
    await act(async () => {
      await result.current.apply({
        rows: [row],
        drafts: {},
        sourceTokenId: 't1',
        pos: 'N',
      });
    });
    expect(savePos).toHaveBeenCalledTimes(1);
    expect(clearDrafts).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('stale');

    await act(async () => {
      await result.current.apply({
        rows: [row],
        drafts: {},
        sourceTokenId: 't1',
        pos: 'N',
      });
    });
    expect(savePos).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('stale');
  });
});
