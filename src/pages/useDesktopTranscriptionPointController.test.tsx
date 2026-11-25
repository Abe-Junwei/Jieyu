/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../contexts/ToastContext';
import { useDesktopTranscriptionPointController } from './useDesktopTranscriptionPointController';

const createPoint = vi.fn();
const updatePointLabel = vi.fn();
const movePoint = vi.fn();
const deletePoint = vi.fn();

vi.mock('../app/desktopProjectReadPageAccess', () => ({
  createDesktopClient: () => ({
    createPoint,
    updatePointLabel,
    movePoint,
    deletePoint,
  }),
}));

function wrap({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe('useDesktopTranscriptionPointController', () => {
  beforeEach(() => {
    createPoint.mockReset();
    updatePointLabel.mockReset();
    movePoint.mockReset();
    deletePoint.mockReset();
  });

  it('creates at the playhead with ⌘Enter and opens label edit', async () => {
    createPoint.mockResolvedValue({
      id: 'p1',
      layerId: 'pt',
      timeMs: 1500,
      label: '',
    });
    const reload = vi.fn().mockResolvedValue(undefined);
    const seekTo = vi.fn();
    const clearUnitSelection = vi.fn();
    let layers: {
      id: string;
      contentType: string;
      points: { id: string; timeMs: number; label: string }[];
    }[] = [{ id: 'pt', contentType: 'point', points: [] }];
    const { result, rerender } = renderHook(
      () =>
        useDesktopTranscriptionPointController({
          locale: 'zh-CN',
          sessionId: 's1',
          desktopCall: vi.fn(),
          layers,
          durationSec: 10,
          playheadSec: () => 1.5,
          seekTo,
          clearUnitSelection,
          reload: async () => {
            layers = [
              {
                id: 'pt',
                contentType: 'point',
                points: [{ id: 'p1', timeMs: 1500, label: '' }],
              },
            ];
            await reload();
          },
        }),
      { wrapper: wrap },
    );

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
      );
      await Promise.resolve();
    });
    rerender();

    expect(createPoint).toHaveBeenCalledWith('s1', {
      layerId: 'pt',
      timeMs: 1500,
      label: '',
    });
    expect(reload).toHaveBeenCalled();
    expect(clearUnitSelection).toHaveBeenCalled();
    expect(seekTo).toHaveBeenCalledWith(1.5);
    expect(result.current.selected).toEqual({ layerId: 'pt', pointId: 'p1' });
    expect(result.current.editingId).toBe('p1');
  });

  it('keeps the saved time when a move conflicts', async () => {
    movePoint.mockRejectedValue(new Error('point time is taken'));
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionPointController({
          locale: 'zh-CN',
          sessionId: 's1',
          desktopCall: vi.fn(),
          layers: [
            {
              id: 'pt',
              contentType: 'point',
              points: [
                { id: 'a', timeMs: 100, label: 'a' },
                { id: 'b', timeMs: 200, label: 'b' },
              ],
            },
          ],
          durationSec: 10,
          playheadSec: () => 0,
          seekTo: () => undefined,
          clearUnitSelection: () => undefined,
          reload,
        }),
      { wrapper: wrap },
    );

    const target = document.createElement('div');
    document.body.appendChild(target);
    const down = {
      button: 0,
      pointerId: 1,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
      currentTarget: target,
    } as unknown as React.PointerEvent<HTMLElement>;

    act(() => {
      result.current.onPointPointerDown(
        down,
        'pt',
        { id: 'a', timeMs: 100, label: 'a' },
        () => 200,
      );
    });
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerup', { clientX: 40, bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(movePoint).toHaveBeenCalledWith('s1', { id: 'a', timeMs: 200 });
    expect(result.current.drag).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    document.body.removeChild(target);
  });

  it('keeps the label draft when save is rejected or unknown', async () => {
    updatePointLabel
      .mockRejectedValueOnce(new Error('point label must be text'))
      .mockRejectedValueOnce(new Error('edit outcome is unknown'));
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionPointController({
          locale: 'zh-CN',
          sessionId: 's1',
          desktopCall: vi.fn(),
          layers: [
            {
              id: 'pt',
              contentType: 'point',
              points: [{ id: 'a', timeMs: 100, label: 'saved' }],
            },
          ],
          durationSec: 10,
          playheadSec: () => 0,
          seekTo: () => undefined,
          clearUnitSelection: () => undefined,
          reload,
        }),
      { wrapper: wrap },
    );

    act(() => {
      result.current.editPoint('a', 'saved');
      result.current.setDraft('拍手');
    });
    await act(async () => {
      result.current.commitLabel();
      await Promise.resolve();
    });
    expect(result.current.editingId).toBe('a');
    expect(result.current.draft).toBe('拍手');
    expect(reload).not.toHaveBeenCalled();

    await act(async () => {
      result.current.commitLabel();
      await Promise.resolve();
    });
    expect(result.current.editingId).toBe('a');
    expect(result.current.draft).toBe('拍手');
  });

  it('cancels an in-flight drag with Escape and does not write', async () => {
    const reload = vi.fn();
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionPointController({
          locale: 'zh-CN',
          sessionId: 's1',
          desktopCall: vi.fn(),
          layers: [
            {
              id: 'pt',
              contentType: 'point',
              points: [{ id: 'a', timeMs: 100, label: 'a' }],
            },
          ],
          durationSec: 10,
          playheadSec: () => 0,
          seekTo: () => undefined,
          clearUnitSelection: () => undefined,
          reload,
        }),
      { wrapper: wrap },
    );

    const target = document.createElement('div');
    document.body.appendChild(target);
    act(() => {
      result.current.onPointPointerDown(
        {
          button: 0,
          pointerId: 2,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
          currentTarget: target,
        } as unknown as React.PointerEvent<HTMLElement>,
        'pt',
        { id: 'a', timeMs: 100, label: 'a' },
        () => 400,
      );
    });
    act(() => {
      target.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, bubbles: true }));
    });
    expect(result.current.drag?.timeMs).toBe(400);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(result.current.drag).toBeNull();
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerup', { clientX: 80, bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(movePoint).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    document.body.removeChild(target);
  });

  it('cancels an in-flight drag on pointercancel and does not write', async () => {
    const reload = vi.fn();
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionPointController({
          locale: 'zh-CN',
          sessionId: 's1',
          desktopCall: vi.fn(),
          layers: [
            {
              id: 'pt',
              contentType: 'point',
              points: [{ id: 'a', timeMs: 100, label: 'a' }],
            },
          ],
          durationSec: 10,
          playheadSec: () => 0,
          seekTo: () => undefined,
          clearUnitSelection: () => undefined,
          reload,
        }),
      { wrapper: wrap },
    );

    const target = document.createElement('div');
    document.body.appendChild(target);
    act(() => {
      result.current.onPointPointerDown(
        {
          button: 0,
          pointerId: 3,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
          currentTarget: target,
        } as unknown as React.PointerEvent<HTMLElement>,
        'pt',
        { id: 'a', timeMs: 100, label: 'a' },
        () => 700,
      );
    });
    act(() => {
      target.dispatchEvent(new PointerEvent('pointermove', { clientX: 90, bubbles: true }));
    });
    expect(result.current.drag?.timeMs).toBe(700);
    act(() => {
      target.dispatchEvent(new PointerEvent('pointercancel', { clientX: 90, bubbles: true }));
    });
    expect(result.current.drag).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(movePoint).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    document.body.removeChild(target);
  });
});
