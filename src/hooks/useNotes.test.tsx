// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db } from '../../db';
import { useNotes, type NoteTarget } from './useNotes';

function UseNotesHarness({ target }: { target: NoteTarget | null }) {
  const { notes, addNote } = useNotes(target);

  return (
    <div>
      <button
        onClick={() => {
          void addNote({ eng: 'note-content' }, 'linguistic');
        }}
      >
        add-note
      </button>
      <div data-testid="note-count">{notes.length}</div>
    </div>
  );
}

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.user_notes.clear(),
    db.utterance_tokens.clear(),
    db.utterance_morphemes.clear(),
  ]);
}

describe('useNotes canonical target resolution', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(async () => {
    await db.open();
    await clearDatabase();
  });

  it('writes token note to canonical token id when target uses index', async () => {
    await db.utterance_tokens.put({
      id: 'utt_legacy::w2',
      textId: 'text_1',
      utteranceId: 'utt_legacy',
      form: { default: 'tok' },
      tokenIndex: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const target: NoteTarget = {
      targetType: 'token',
      targetId: 'w2',
      targetIndex: 1,
      parentTargetId: 'utt_legacy',
    };

    render(<UseNotesHarness target={target} />);

    fireEvent.click(screen.getByText('add-note'));

    await waitFor(async () => {
      const all = await db.user_notes.toArray();
      expect(all).toHaveLength(1);
      expect(all[0]!.targetType).toBe('token');
      expect(all[0]!.targetId).toBe('utt_legacy::w2');
      expect(all[0]!.targetIndex).toBeUndefined();
      expect(all[0]!.parentTargetId).toBe('utt_legacy');
    });
  });

  it('reads canonical token notes when UI target is index-based', async () => {
    await db.utterance_tokens.put({
      id: 'utt_read::w1',
      textId: 'text_1',
      utteranceId: 'utt_read',
      form: { default: 'tok' },
      tokenIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.user_notes.put({
      id: 'note_1',
      targetType: 'token',
      targetId: 'utt_read::w1',
      parentTargetId: 'utt_read',
      content: { eng: 'existing-note' },
      category: 'linguistic',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const target: NoteTarget = {
      targetType: 'token',
      targetId: 'w1',
      targetIndex: 0,
      parentTargetId: 'utt_read',
    };

    render(<UseNotesHarness target={target} />);

    await waitFor(() => {
      expect(screen.getByTestId('note-count').textContent).toBe('1');
    });
  });
});
