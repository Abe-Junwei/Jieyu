/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  DesktopTranscriptionMergeDialog,
  type MergePreviewView,
} from './DesktopTranscriptionMergeDialog';
afterEach(cleanup);
it('groups recordings by all three sources and requires explicit discard before one confirm', () => {
  const ids = ['a', 'b', 'c'];
  const clips = Array.from({ length: 6 }, (_, index) => ({
    id: `clip-${index}`,
    unitId: ids[Math.floor(index / 2)]!,
    layerId: 'tx',
    fileId: `file-${index}`,
  }));
  const preview: MergePreviewView = {
    unitIds: ids,
    keepId: 'a',
    removeId: 'c',
    gapMs: 0,
    noteCount: 0,
    separator: ' ',
    baseline: 'baseline',
    earlier: clips.slice(0, 2),
    later: clips.slice(2),
  };
  const onConfirm = vi.fn();
  render(
    <DesktopTranscriptionMergeDialog
      locale="en-US"
      sessionId="session"
      preview={preview}
      stale={false}
      desktopCall={async () => null}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
  for (const index of [1, 2, 3]) expect(screen.getByText(`Source segment ${index}`)).toBeVisible();
  const confirm = screen.getByRole('button', { name: 'Merge' });
  expect(confirm).toBeDisabled();
  fireEvent.click(screen.getAllByRole('checkbox')[5]!);
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  expect(onConfirm).toHaveBeenCalledWith(['clip-5'], []);
});
