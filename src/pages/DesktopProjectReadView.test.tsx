/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopProjectReadView } from './DesktopProjectReadView';

afterEach(() => {
  cleanup();
});

const unit = {
  id: 'u1',
  layerId: 'layer-1',
  startTime: 0,
  endTime: 2,
  text: 'sentence',
};

function renderView(
  overrides: {
    onSaveNote?: (unitId: string, text: string) => void | Promise<void>;
    onSaveTierNote?: (
      unitId: string,
      view: 'timeline' | 'waveform',
      text: string,
    ) => void | Promise<void>;
  } = {},
) {
  const onSaveNote = overrides.onSaveNote ?? vi.fn(async () => undefined);
  const onSaveTierNote = overrides.onSaveTierNote ?? vi.fn(async () => undefined);
  render(
    <DesktopProjectReadView
      manuscripts={[{ id: 'm1', title: { zh: '文稿' } }]}
      manuscriptId="m1"
      units={[unit]}
      notes={[]}
      audioUrl={null}
      timeMapping={null}
      emptyLabel="empty"
      audioLabel="audio"
      textLabel="Text"
      saveTextLabel="Save text"
      undoTextLabel="Undo text"
      splitLabel="Split"
      splitTimeLabel="Split time"
      mergeNextLabel="Merge next"
      boundaryLabel="Boundary"
      moveBoundaryLabel="Move boundary"
      offsetLabel="Offset"
      scaleLabel="Scale"
      saveMappingLabel="Save mapping"
      noteLabel="Note"
      saveNoteLabel="Save note"
      saveTimelineNoteLabel="Save timeline note"
      saveWaveformNoteLabel="Save waveform note"
      draft={null}
      onEditText={() => undefined}
      onComposeText={() => undefined}
      onLeaveUnit={(go) => go()}
      onSelectManuscript={() => undefined}
      onSaveText={() => undefined}
      onUndoText={() => undefined}
      onSplit={() => undefined}
      onMerge={() => undefined}
      onMoveBoundary={() => undefined}
      onSaveMapping={() => undefined}
      onSaveNote={onSaveNote}
      onSaveTierNote={onSaveTierNote}
    />,
  );
  return { onSaveNote, onSaveTierNote };
}

describe('DesktopProjectReadView note draft', () => {
  it('keeps the note draft when save rejects', async () => {
    const onSaveNote = vi.fn(async () => {
      throw new Error('persist failed');
    });
    renderView({ onSaveNote });
    fireEvent.click(screen.getByRole('button', { name: '0.0–2.0 sentence' }));
    const note = screen.getByRole('textbox', { name: 'Note' });
    fireEvent.change(note, { target: { value: 'keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => {
      expect(onSaveNote).toHaveBeenCalledWith('u1', 'keep me');
    });
    expect((note as HTMLInputElement).value).toBe('keep me');
  });

  it('clears the note draft only after save resolves', async () => {
    let resolveSave: (() => void) | undefined;
    const onSaveNote = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderView({ onSaveNote });
    fireEvent.click(screen.getByRole('button', { name: '0.0–2.0 sentence' }));
    const note = screen.getByRole('textbox', { name: 'Note' });
    fireEvent.change(note, { target: { value: 'pending' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => {
      expect(onSaveNote).toHaveBeenCalled();
    });
    expect((note as HTMLInputElement).value).toBe('pending');
    resolveSave?.();
    await waitFor(() => {
      expect((note as HTMLInputElement).value).toBe('');
    });
  });

  it('keeps the draft when a tier note save rejects', async () => {
    const onSaveTierNote = vi.fn(async () => {
      throw new Error('tier persist failed');
    });
    renderView({ onSaveTierNote });
    fireEvent.click(screen.getByRole('button', { name: '0.0–2.0 sentence' }));
    const note = screen.getByRole('textbox', { name: 'Note' });
    fireEvent.change(note, { target: { value: 'tier keep' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save timeline note' }));
    await waitFor(() => {
      expect(onSaveTierNote).toHaveBeenCalledWith('u1', 'timeline', 'tier keep');
    });
    expect((note as HTMLInputElement).value).toBe('tier keep');
  });
});
