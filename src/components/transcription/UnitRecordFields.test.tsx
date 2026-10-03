// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerUnitDocType } from '../../db';
import { LocaleProvider } from '../../i18n';
import {
  saveAnnotationUnitNote,
  saveAnnotationUnitTurn,
} from '../../pages/annotation/saveAnnotationUnitMeta';
import { UnitRecordFields } from './UnitRecordFields';

vi.mock('../../pages/annotation/saveAnnotationUnitMeta', () => ({
  listAnnotationUnitNotes: vi.fn(async () => [
    { id: 'n-tx', content: 'transcription', category: 'comment' },
    { id: 'n-tl', content: 'translation', category: 'topic' },
  ]),
  saveAnnotationUnitNote: vi.fn(async (input: { content: string; category: string }) => ({
    id: 'note-1',
    content: input.content,
    category: input.category,
  })),
  saveAnnotationUnitTurn: vi.fn(async () => ({ id: 'unit-1' })),
}));

afterEach(() => {
  cleanup();
  vi.mocked(saveAnnotationUnitNote).mockClear();
  vi.mocked(saveAnnotationUnitTurn).mockClear();
});

function renderFields() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const unit = {
    id: 'unit-1',
    textId: 'text-1',
    addressee: '',
    ungrammatical: false,
    actualForm: '',
    targetForm: '',
  } as LayerUnitDocType;
  render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale="zh-CN">
        <UnitRecordFields unit={unit} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('UnitRecordFields', () => {
  it('saves a translation note without rewriting the transcription note', async () => {
    renderFields();
    await waitFor(() => {
      expect(screen.getByTestId('translation-note-unit-1')).toHaveValue('translation');
    });
    const translation = screen.getByTestId('translation-note-unit-1');
    fireEvent.change(translation, { target: { value: 'translation edited' } });
    fireEvent.blur(translation);
    await waitFor(() => {
      expect(saveAnnotationUnitNote).toHaveBeenCalledWith({
        unitId: 'unit-1',
        content: 'translation edited',
        category: 'topic',
      });
    });
    expect(saveAnnotationUnitNote).not.toHaveBeenCalledWith(
      expect.objectContaining({ category: 'comment' }),
    );
  });

  it('saves the ungrammatical flag on the unit', async () => {
    renderFields();
    fireEvent.click(await screen.findByTestId('transcription-ungrammatical-unit-1'));
    await waitFor(() => {
      expect(saveAnnotationUnitTurn).toHaveBeenCalledWith(
        expect.objectContaining({ unitId: 'unit-1', textId: 'text-1', ungrammatical: true }),
      );
    });
  });
});
