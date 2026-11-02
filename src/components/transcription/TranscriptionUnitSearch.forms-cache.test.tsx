/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n';
import type { LayerUnitDocType } from '../../db/types';
import { dispatchWorkspaceUnitUpdated } from '../../utils/workspaceEvents';
import { TranscriptionUnitSearch } from './TranscriptionUnitSearch';

const { listTokensByUnitIds, listMorphemesByTokenIds, loadCharacterVariantLines } = vi.hoisted(
  () => ({
    listTokensByUnitIds: vi.fn(),
    listMorphemesByTokenIds: vi.fn(async () => []),
    loadCharacterVariantLines: vi.fn(async () => ''),
  }),
);

vi.mock('../../app/languageAssetPageAccess', () => ({
  LinguisticService: {
    units: {
      listTokensByUnitIds,
      listMorphemesByTokenIds,
    },
  },
  loadCharacterVariantLines,
  saveCharacterVariantLines: vi.fn(async () => undefined),
}));

vi.mock('../../utils/fireAndForget', () => ({
  fireAndForget: (task: Promise<unknown>) => {
    void task;
  },
}));

afterEach(() => {
  cleanup();
  listTokensByUnitIds.mockReset();
  listMorphemesByTokenIds.mockReset();
  listMorphemesByTokenIds.mockResolvedValue([]);
  loadCharacterVariantLines.mockReset();
  loadCharacterVariantLines.mockResolvedValue('');
});

const unit = {
  id: 'u1',
  textId: 'text-1',
  startTime: 0,
  endTime: 1,
  ungrammatical: false,
} as unknown as LayerUnitDocType;

function renderSearch() {
  // Match production freshness so unitId-only keys stay cached across form edits.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale="zh-CN">
        <TranscriptionUnitSearch
          units={[unit]}
          sentenceLayerId="layer-1"
          getUnitText={() => 'sentence surface'}
          onSelectUnit={vi.fn()}
        />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('TranscriptionUnitSearch forms cache (#490)', () => {
  it('refetches word forms after a workspace unit update so the new form is searchable', async () => {
    listTokensByUnitIds.mockResolvedValue([
      {
        id: 'tok-1',
        textId: 'text-1',
        unitId: 'u1',
        form: { default: 'alpha' },
        tokenIndex: 0,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    renderSearch();
    fireEvent.change(screen.getByTestId('transcription-search-mode'), {
      target: { value: 'word' },
    });
    fireEvent.change(screen.getByTestId('transcription-search'), {
      target: { value: 'alpha' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('transcription-search-hit-u1')).toBeTruthy();
    });
    expect(listTokensByUnitIds).toHaveBeenCalledTimes(1);

    listTokensByUnitIds.mockResolvedValue([
      {
        id: 'tok-1',
        textId: 'text-1',
        unitId: 'u1',
        form: { default: 'beta' },
        tokenIndex: 0,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    // Without invalidation the cached forms stay "alpha" until staleTime elapses.
    fireEvent.change(screen.getByTestId('transcription-search'), {
      target: { value: 'beta' },
    });
    expect(screen.queryByTestId('transcription-search-hit-u1')).toBeNull();

    await act(async () => {
      dispatchWorkspaceUnitUpdated({ unitId: 'u1', revision: 2 });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(listTokensByUnitIds.mock.calls.length).toBeGreaterThan(1);
      expect(screen.getByTestId('transcription-search-hit-u1')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('transcription-search'), {
      target: { value: 'alpha' },
    });
    await waitFor(() => {
      expect(screen.queryByTestId('transcription-search-hit-u1')).toBeNull();
    });
  });

  it('ignores unit updates for units outside the current search set', async () => {
    listTokensByUnitIds.mockResolvedValue([
      {
        id: 'tok-1',
        textId: 'text-1',
        unitId: 'u1',
        form: { default: 'alpha' },
        tokenIndex: 0,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    renderSearch();
    fireEvent.change(screen.getByTestId('transcription-search-mode'), {
      target: { value: 'word' },
    });
    fireEvent.change(screen.getByTestId('transcription-search'), {
      target: { value: 'alpha' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('transcription-search-hit-u1')).toBeTruthy();
    });
    const callsBefore = listTokensByUnitIds.mock.calls.length;

    listTokensByUnitIds.mockResolvedValue([
      {
        id: 'tok-1',
        textId: 'text-1',
        unitId: 'u1',
        form: { default: 'beta' },
        tokenIndex: 0,
        createdAt: '',
        updatedAt: '',
      },
    ]);

    await act(async () => {
      dispatchWorkspaceUnitUpdated({ unitId: 'other-unit', revision: 9 });
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(listTokensByUnitIds.mock.calls.length).toBe(callsBefore);
  });
});
