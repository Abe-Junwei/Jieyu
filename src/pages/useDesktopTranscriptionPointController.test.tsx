/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(cleanup);
  beforeEach(() => {
    createPoint.mockReset();
    updatePointLabel.mockReset();
    movePoint.mockReset();
    deletePoint.mockReset();
  });

  it('opens label edit only on re-click of the selected label or Enter', async () => {
    const seekTo = vi.fn();
    const { result } = renderHook(
      () =>
        useDesktopTranscriptionPointController({
          locale: 'zh-CN',
          sessionId: 's1',
          manuscriptId: 'm1',
          desktopCall: vi.fn(),
          layers: [
            {
              id: 'pt',
              contentType: 'point',
              points: [{ id: 'a', timeMs: 100, label: '拍手' }],
            },
          ],
          durationSec: 10,
          playheadSec: () => 0,
          seekTo,
          clearUnitSelection: () => undefined,
          reload: async () => undefined,
        }),
      { wrapper: wrap },
    );

    const down = {
      button: 0,
      currentTarget: document.createElement('div'),
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as unknown as React.PointerEvent<HTMLElement>;

    act(() => {
      result.current.onLabelPointerDown(down, 'pt', { id: 'a', timeMs: 100, label: '拍手' });
    });
    expect(result.current.selected).toEqual({ layerId: 'pt', pointId: 'a' });
    expect(result.current.editingId).toBeNull();

    act(() => {
      result.current.onLabelPointerDown(down, 'pt', { id: 'a', timeMs: 100, label: '拍手' });
    });
    expect(result.current.editingId).toBe('a');

    act(() => {
      result.current.cancelEdit();
    });
    expect(result.current.editingId).toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(result.current.editingId).toBe('a');
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
          manuscriptId: 'm1',
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
          manuscriptId: 'm1',
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
      clientX: 0,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
      currentTarget: target,
    } as unknown as React.PointerEvent<HTMLElement>;

    act(() => {
      result.current.onPointPointerDown(
        down,
        'pt',
        { id: 'a', timeMs: 100, label: 'a' },
        (x) => 100 + x * 2.5,
      );
    });
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { pointerId: 1, clientX: 40, bubbles: true }),
      );
      window.dispatchEvent(
        new PointerEvent('pointerup', { pointerId: 1, clientX: 40, bubbles: true }),
      );
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
          manuscriptId: 'm1',
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
          manuscriptId: 'm1',
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
          clientX: 0,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
          currentTarget: target,
        } as unknown as React.PointerEvent<HTMLElement>,
        'pt',
        { id: 'a', timeMs: 100, label: 'a' },
        (x) => 100 + x * 3.75,
      );
    });
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { pointerId: 2, clientX: 80, bubbles: true }),
      );
    });
    expect(result.current.drag?.timeMs).toBe(400);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(result.current.drag).toBeNull();
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointerup', { pointerId: 2, clientX: 80, bubbles: true }),
      );
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
          manuscriptId: 'm1',
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
          clientX: 0,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
          currentTarget: target,
        } as unknown as React.PointerEvent<HTMLElement>,
        'pt',
        { id: 'a', timeMs: 100, label: 'a' },
        (x) => 100 + x * (600 / 90),
      );
    });
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { pointerId: 3, clientX: 90, bubbles: true }),
      );
    });
    expect(result.current.drag?.timeMs).toBe(700);
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointercancel', { pointerId: 3, clientX: 90, bubbles: true }),
      );
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
