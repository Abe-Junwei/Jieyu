/** @vitest-environment jsdom */
import { act, renderHook, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { ToastProvider } from '../contexts/ToastContext';
import { useDesktopTranscriptionPointController } from './useDesktopTranscriptionPointController';
const { createPoint, deletePoint, updatePointLabel } = vi.hoisted(() => ({
  createPoint: vi.fn(),
  deletePoint: vi.fn(),
  updatePointLabel: vi.fn(),
}));
vi.mock('../app/desktopProjectReadPageAccess', () => ({
  createDesktopClient: () => ({ createPoint, deletePoint, updatePointLabel }),
}));
function wrap({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('point craft regressions', () => {
  const layers = [
    {
      id: 'pt',
      contentType: 'point',
      points: [
        { id: 'a', timeMs: 100, label: 'saved' },
        { id: 'b', timeMs: 200, label: 'b' },
      ],
    },
  ];
  const base = () => ({
    locale: 'zh-CN' as const,
    sessionId: 's1',
    manuscriptId: 'm1',
    desktopCall: vi.fn(),
    layers,
    durationSec: 10,
    playheadSec: () => 1,
    seekTo: vi.fn(),
    clearUnitSelection: vi.fn(),
    reload: async () => undefined,
  });
  it.each(['input', 'textarea', 'select', 'div'])(
    'leaves point selection and storage alone while editing another %s',
    async (tag) => {
      let api!: ReturnType<typeof useDesktopTranscriptionPointController>;
      function Fixture() {
        api = useDesktopTranscriptionPointController(base());
        return (
          <button
            onPointerDown={(event) => api.onLabelPointerDown(event, 'pt', layers[0]!.points[0]!)}
          >
            Point
          </button>
        );
      }
      render(<Fixture />, { wrapper: wrap });
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Point' }), { button: 0 });
      const field = document.createElement(tag);
      if (tag === 'div') field.setAttribute('contenteditable', 'true');
      document.body.append(field);
      field.focus();
      await act(async () => {
        for (const key of [
          'Delete',
          'Backspace',
          'ArrowLeft',
          'ArrowRight',
          'Home',
          'End',
          'Enter',
        ]) {
          field.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
          );
        }
        field.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
        );
      });
      field.remove();
      expect(api.selected).toEqual({ layerId: 'pt', pointId: 'a' });
      expect(api.editingId).toBeNull();
      expect(deletePoint).not.toHaveBeenCalled();
      expect(createPoint).not.toHaveBeenCalled();
    },
  );
  it('create response after switching manuscript must not seek new view', async () => {
    let finish!: (p: { id: string; timeMs: number }) => void;
    createPoint.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const props = base();
    const { result, rerender } = renderHook(
      ({ shown, manuscriptId }) =>
        useDesktopTranscriptionPointController({ ...props, layers: shown, manuscriptId }),
      { initialProps: { shown: layers, manuscriptId: 'm1' }, wrapper: wrap },
    );
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
      );
    });
    rerender({ shown: [{ id: 'other', contentType: 'point', points: [] }], manuscriptId: 'm2' });
    await act(async () => {
      finish({ id: 'new-old-point', timeMs: 1000 });
      await Promise.resolve();
    });
    expect(props.seekTo).not.toHaveBeenCalled();
    expect(result.current.editingId).toBeNull();
  });
  it('late save of a must not close b editor', async () => {
    let finish!: () => void;
    updatePointLabel.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useDesktopTranscriptionPointController(base()), {
      wrapper: wrap,
    });
    act(() => result.current.editPoint('a', 'saved'));
    act(() => result.current.commitLabel());
    act(() => result.current.editPoint('b', 'new draft'));
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(result.current.editingId).toBe('b');
    expect(result.current.draft).toBe('new draft');
  });
});
