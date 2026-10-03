// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LocaleProvider } from '../../i18n';
import { listAnnotationUnitNotes, saveAnnotationUnitNote } from './saveAnnotationUnitMeta';
import { AnnotationIgtUnitExtras } from './AnnotationIgtUnitExtras';
import type { AnnotationUnitMetaController } from '../useAnnotationUnitMetaController';
import type { AnnotationRetokenizeController } from '../useAnnotationRetokenizeController';
import type { AnnotationValidatorPanelController } from '../useAnnotationValidatorPanelController';

const retokenize = {
  previewUnitId: '',
  proposedForms: [],
} as unknown as AnnotationRetokenizeController;
const validator = {
  unitId: '',
  pending: false,
  errorMessage: '',
  items: [],
} as AnnotationValidatorPanelController;

function renderNotes(unitId: string, notes: AnnotationUnitMetaController['notes']) {
  const unitMeta = {
    notes,
    noteText: '',
    noteCategory: 'comment',
    noteCategories: ['comment'],
    selfCertainty: '',
    saveNotice: { kind: 'idle', message: '' },
    onNoteTextChange: () => undefined,
    onNoteCategoryChange: () => undefined,
    onSaveNote: () => undefined,
    onSaveCategorizedNote: (category: 'comment' | 'topic', content: string) => {
      void saveAnnotationUnitNote({ unitId, content, category });
    },
    onSaveTurn: () => undefined,
    onSelfCertaintyChange: () => undefined,
  } as AnnotationUnitMetaController;
  return render(
    <LocaleProvider locale="zh-CN">
      <AnnotationIgtUnitExtras
        unitId={unitId}
        matches={[]}
        unitMeta={unitMeta}
        retokenize={retokenize}
        validator={validator}
        onFocusInput={() => undefined}
        showNote
        showCertainty={false}
        showReadouts={false}
      />
    </LocaleProvider>,
  );
}

describe('AnnotationIgtUnitExtras notes', () => {
  afterEach(async () => {
    cleanup();
    await db.user_notes.clear();
  });

  it('does not copy the previous unit note onto the next unit', async () => {
    await saveAnnotationUnitNote({ unitId: 'unit-a', content: 'A original', category: 'comment' });
    await saveAnnotationUnitNote({ unitId: 'unit-b', content: 'B original', category: 'comment' });
    const view = renderNotes('unit-a', [
      { id: 'note-a', content: 'A original', category: 'comment' },
    ]);
    const field = screen.getByTestId('annotation-igt-source-note-unit-a');
    fireEvent.change(field, { target: { value: 'A edited' } });
    fireEvent.blur(field);
    await waitFor(async () => {
      const notes = await listAnnotationUnitNotes('unit-a');
      expect(notes.find((note) => note.category === 'comment')?.content).toBe('A edited');
    });

    view.rerender(
      <LocaleProvider locale="zh-CN">
        <AnnotationIgtUnitExtras
          unitId="unit-b"
          matches={[]}
          unitMeta={
            {
              notes: [{ id: 'note-b', content: 'B original', category: 'comment' }],
              noteText: '',
              noteCategory: 'comment',
              noteCategories: ['comment'],
              selfCertainty: '',
              saveNotice: { kind: 'idle', message: '' },
              onNoteTextChange: () => undefined,
              onNoteCategoryChange: () => undefined,
              onSaveNote: () => undefined,
              onSaveCategorizedNote: (category: 'comment' | 'topic', content: string) => {
                void saveAnnotationUnitNote({ unitId: 'unit-b', content, category });
              },
              onSaveTurn: () => undefined,
              onSelfCertaintyChange: () => undefined,
            } as AnnotationUnitMetaController
          }
          retokenize={retokenize}
          validator={validator}
          onFocusInput={() => undefined}
          showNote
          showCertainty={false}
          showReadouts={false}
        />
      </LocaleProvider>,
    );
    const next = screen.getByTestId('annotation-igt-source-note-unit-b');
    expect((next as HTMLTextAreaElement).value).toBe('B original');
    fireEvent.blur(next);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(
      (await listAnnotationUnitNotes('unit-b')).find((note) => note.category === 'comment')
        ?.content,
    ).toBe('B original');
    expect(
      (await listAnnotationUnitNotes('unit-a')).find((note) => note.category === 'comment')
        ?.content,
    ).toBe('A edited');
  });
});
