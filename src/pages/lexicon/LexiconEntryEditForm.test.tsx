// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyEntryFields } from '../../utils/dmlexEntry';
import type { LexiconEntryEditController } from '../useLexiconEntryEditController';
import { LexiconEntryEditForm } from './LexiconEntryEditForm';

function editor(overrides: Partial<LexiconEntryEditController> = {}): LexiconEntryEditController {
  return {
    fields: emptyEntryFields(),
    creating: false,
    saving: false,
    deleting: false,
    confirmDelete: false,
    saved: false,
    error: '',
    onFieldChange: vi.fn(),
    onSenseChange: vi.fn(),
    onAddSense: vi.fn(),
    onAddSubsense: vi.fn(),
    onMoveSense: vi.fn(),
    onRemoveSense: vi.fn(),
    onStartCreate: vi.fn(),
    onCancelCreate: vi.fn(),
    onSave: vi.fn(),
    onRequestDelete: vi.fn(),
    onCancelDelete: vi.fn(),
    onConfirmDelete: vi.fn(),
    ...overrides,
  };
}

describe('LexiconEntryEditForm', () => {
  it('edits the sense indicator and the sense note', () => {
    const onSenseChange = vi.fn();
    render(<LexiconEntryEditForm editor={editor({ onSenseChange })} />);

    fireEvent.change(screen.getByTestId('lexicon-entry-sense-0-indicator'), {
      target: { value: 'tree' },
    });
    fireEvent.change(screen.getByTestId('lexicon-entry-sense-0-note'), {
      target: { value: 'ridge' },
    });

    expect(onSenseChange).toHaveBeenCalledWith(0, 'indicator', 'tree');
    expect(onSenseChange).toHaveBeenCalledWith(0, 'note', 'ridge');
  });
});
