// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { useDesktopCorpusQuery } from './useDesktopCorpusQuery';

const queryCorpus = vi.fn();

vi.mock('../app/desktopProjectReadPageAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/desktopProjectReadPageAccess')>();
  return {
    ...actual,
    createDesktopClient: () => ({
      queryCorpus,
    }),
  };
});

vi.mock('../i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../i18n')>();
  return {
    ...actual,
    useLocale: () => 'en-US' as const,
    t: (_locale: string, key: string) => key,
  };
});

function item(unitId: string) {
  return {
    manuscriptId: 'ms',
    layerId: 'ly',
    unitId,
    startTime: Number(unitId.replace(/\D/g, '') || 0),
    endTime: 1,
    text: unitId,
    textSpans: [],
    hits: [],
  };
}

describe('useDesktopCorpusQuery (#406)', () => {
  beforeEach(() => {
    queryCorpus.mockReset();
  });

  it('loads more with the committed filters after the draft changes', async () => {
    queryCorpus
      .mockResolvedValueOnce({
        items: [item('u1')],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [item('u2')],
        hasMore: false,
      });

    const host = { desktopCall: vi.fn() } as unknown as DesktopReadHost;
    const { result } = renderHook(() => useDesktopCorpusQuery(host, 'session-1'));

    await act(async () => {
      result.current.setText('alpha');
    });
    await act(async () => {
      result.current.search();
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(queryCorpus).toHaveBeenLastCalledWith(
      'session-1',
      expect.objectContaining({ text: 'alpha', limit: 20 }),
    );

    await act(async () => {
      result.current.setText('beta');
    });
    await act(async () => {
      result.current.more();
    });
    await waitFor(() => expect(result.current.items.map((row) => row.unitId)).toEqual(['u1', 'u2']));
    expect(queryCorpus).toHaveBeenLastCalledWith(
      'session-1',
      expect.objectContaining({
        text: 'alpha',
        cursor: {
          manuscriptId: 'ms',
          layerId: 'ly',
          startTime: 1,
          unitId: 'u1',
        },
      }),
    );
    expect(queryCorpus.mock.calls.at(-1)?.[1]).not.toEqual(
      expect.objectContaining({ text: 'beta' }),
    );
  });
});
