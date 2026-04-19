// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db } from '../db';
import { SegmentMetaService } from '../services/SegmentMetaService';
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
    db.unit_tokens.clear(),
    db.unit_morphemes.clear(),
    db.segment_meta.clear(),
    db.layer_units.clear(),
    db.layer_unit_contents.clear(),
    db.speakers.clear(),
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
    await db.unit_tokens.put({
      id: 'utt_legacy::w2',
      textId: 'text_1',
      unitId: 'utt_legacy',
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
    await db.unit_tokens.put({
      id: 'utt_read::w1',
      textId: 'text_1',
      unitId: 'utt_read',
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

  it('refreshes unified segment metadata after adding an unit note', async () => {
    const now = new Date().toISOString();
    await db.layer_units.bulkPut([
      {
        id: 'utt_meta',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_seg',
        unitType: 'unit',
        startTime: 0,
        endTime: 2,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'seg_meta',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_seg',
        unitType: 'segment',
        parentUnitId: 'utt_meta',
        rootUnitId: 'utt_meta',
        startTime: 0,
        endTime: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.layer_unit_contents.put({
      id: 'content_meta',
      textId: 'text_1',
      unitId: 'seg_meta',
      layerId: 'layer_seg',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'hello',
      sourceType: 'human',
      createdAt: now,
      updatedAt: now,
    });
    await SegmentMetaService.rebuildForLayerMedia('layer_seg', 'media_1');

    const target: NoteTarget = {
      targetType: 'unit',
      targetId: 'utt_meta',
    };

    render(<UseNotesHarness target={target} />);
    fireEvent.click(screen.getByText('add-note'));

    await waitFor(async () => {
      const rows = await SegmentMetaService.listByLayerMedia('layer_seg', 'media_1');
      expect(rows[0]?.noteCategoryKeys).toEqual(['linguistic']);
    });
  });

});
