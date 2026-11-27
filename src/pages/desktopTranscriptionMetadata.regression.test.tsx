/** @vitest-environment jsdom */
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '../contexts/ToastContext';
import { useDesktopTranscriptionMetadataController } from './useDesktopTranscriptionMetadataController';
import { useDesktopTranscriptionSelectionController } from './useDesktopTranscriptionSelectionController';
function wrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
afterEach(cleanup);
it('drops selection when the last visible unit disappears', () => {
  const a = { id: 'a', layerId: 'tx', startTime: 0, endTime: 1 };
  const { result, rerender } = renderHook(
    ({ units }) => useDesktopTranscriptionSelectionController(null, units),
    { initialProps: { units: [a] } },
  );
  act(() => result.current.selectUnit(a));
  rerender({ units: [] });
  expect(result.current.selectedUnitIds).toEqual([]);
});
it('a delayed note save must not reopen the previous manuscript dialog', async () => {
  let finish!: (v: unknown) => void;
  const pending = new Promise((resolve) => (finish = resolve));
  const desktopCall = vi.fn(async (_session: string, method: string) =>
    method === 'notes.createForUnitText' ? pending : [],
  );
  const base: Parameters<typeof useDesktopTranscriptionMetadataController>[0] = {
    locale: 'en-US',
    sessionId: 's',
    desktopCall,
    textLayerId: 'txA',
    layerName: 'A',
    orthographyLabel: '',
    selectedUnitIds: ['a'],
    certaintyOf: () => null,
    writeScope: () => ({}),
    reload: async () => {},
    refetchNotes: async () => [],
    listNotesForUnits: () => [],
  };
  const { result, rerender } = renderHook(
    (input: Parameters<typeof useDesktopTranscriptionMetadataController>[0]) =>
      useDesktopTranscriptionMetadataController(input),
    { initialProps: base, wrapper },
  );
  act(() => result.current.laneMetadata.onOpenNotes());
  act(() => result.current.notesDialogBindings.onAdd());
  act(() => result.current.notesDialogBindings.onDraft('old draft'));
  act(() => result.current.notesDialogBindings.onSave());
  rerender({ ...base, textLayerId: 'txB', layerName: 'B', selectedUnitIds: ['b'] });
  act(() => result.current.notesDialogBindings.onClose());
  act(() => result.current.laneMetadata.onOpenNotes());
  await act(async () => {
    finish({ id: 'noteA' });
    await pending;
  });
  expect(result.current.notesDialogBindings.state?.unitIds).toEqual(['b']);
});
