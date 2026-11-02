/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n';
import type { LayerUnitDocType } from '../../db/types';
import { TranscriptionUnitSearch } from './TranscriptionUnitSearch';

const { loadCharacterVariantLines, saveCharacterVariantLines } = vi.hoisted(() => ({
  loadCharacterVariantLines: vi.fn(),
  saveCharacterVariantLines: vi.fn(async () => undefined),
}));

vi.mock('../../app/languageAssetPageAccess', () => ({
  LinguisticService: {
    units: {
      listTokensByUnitIds: vi.fn(async () => []),
      listMorphemesByTokenIds: vi.fn(async () => []),
    },
  },
  loadCharacterVariantLines,
  saveCharacterVariantLines,
}));

vi.mock('../../utils/fireAndForget', () => ({
  fireAndForget: (task: Promise<unknown>) => {
    void task;
  },
}));

afterEach(() => {
  cleanup();
  loadCharacterVariantLines.mockReset();
  saveCharacterVariantLines.mockReset();
  saveCharacterVariantLines.mockResolvedValue(undefined);
});

const unit = {
  id: 'u1',
  textId: 'text-1',
  startTime: 0,
  endTime: 1,
  ungrammatical: false,
} as unknown as LayerUnitDocType;

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale="zh-CN">
        <TranscriptionUnitSearch
          units={[unit]}
          sentenceLayerId="layer-1"
          onSelectUnit={vi.fn()}
        />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('TranscriptionUnitSearch character variants (#488)', () => {
  it('keeps a newer local draft when an older save reread arrives', async () => {
    let resolveLoad: ((value: string) => void) | undefined;
    loadCharacterVariantLines
      .mockResolvedValueOnce('Z')
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveLoad = resolve;
          }),
      );

    renderSearch();
    const input = await screen.findByTestId('transcription-character-variants');
    await waitFor(() => expect(input).toHaveValue('Z'));

    fireEvent.change(input, { target: { value: 'A' } });
    fireEvent.blur(input);
    await waitFor(() => expect(saveCharacterVariantLines).toHaveBeenCalledWith('text-1', 'A'));

    fireEvent.change(input, { target: { value: 'B' } });
    expect(input).toHaveValue('B');

    await act(async () => {
      resolveLoad?.('A');
      await Promise.resolve();
    });

    expect(input).toHaveValue('B');
  });
});
