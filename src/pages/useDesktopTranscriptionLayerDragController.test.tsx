/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { settleLayerDrop } from './desktopTranscriptionLayerDrag';
import { useDesktopTranscriptionLayerDragController } from './useDesktopTranscriptionLayerDragController';

const layers = [
  { id: 'tx', contentType: 'transcription', tierType: 'time-aligned' },
  { id: 'child', contentType: 'transcription', tierType: 'time-aligned' },
  { id: 'tr', contentType: 'translation', tierType: 'symbolic-association' },
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('layer drag controller', () => {
  it('does not write during the drag, and Escape writes nothing', () => {
    vi.useFakeTimers();
    const desktopCall = vi.fn(async () => null);
    const { result } = renderHook(() =>
      useDesktopTranscriptionLayerDragController({
        sessionId: 'session',
        desktopCall,
        layers,
        links: [],
        currentLayerId: 'tx',
        refresh: async () => undefined,
        report: vi.fn(),
      }),
    );
    const button = document.createElement('button');
    act(() => {
      result.current.onPointerDown('child', 'sidebar', {
        button: 0,
        pointerId: 1,
        clientX: 4,
        clientY: 8,
        currentTarget: button,
      } as never);
    });
    expect(desktopCall).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.draggedIds).toEqual(['child']);
    expect(desktopCall).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.draggedIds).toEqual([]);
    act(() => {
      result.current.onPointerDown('child', 'sidebar', {
        button: 0,
        pointerId: 1,
        clientX: 4,
        clientY: 8,
        currentTarget: button,
      } as never);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      window.dispatchEvent(new Event('pointercancel'));
    });
    expect(result.current.draggedIds).toEqual([]);
    expect(desktopCall).not.toHaveBeenCalled();
  });

  it('does not start or write when the hold is cancelled before it activates', async () => {
    vi.useFakeTimers();
    const desktopCall = vi.fn(async () => null);
    const target = document.createElement('div');
    target.dataset.layerId = 'tx';
    target.dataset.dragSurface = 'sidebar';
    document.elementFromPoint = () => target;
    const { result, unmount } = renderHook(() =>
      useDesktopTranscriptionLayerDragController({
        sessionId: 'session',
        desktopCall,
        layers,
        links: [],
        currentLayerId: 'tx',
        refresh: async () => undefined,
        report: vi.fn(),
      }),
    );
    const press = () => {
      act(() => {
        result.current.onPointerDown('child', 'sidebar', {
          button: 0,
          pointerId: 1,
          clientX: 4,
          clientY: 8,
          currentTarget: document.createElement('button'),
        } as never);
      });
    };
    const release = async () => {
      await act(async () => {
        window.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 10 }));
      });
    };
    press();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.draggedIds).toEqual([]);
    await release();
    expect(desktopCall).not.toHaveBeenCalled();

    press();
    await release();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.draggedIds).toEqual([]);
    expect(desktopCall).not.toHaveBeenCalled();

    press();
    unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(desktopCall).not.toHaveBeenCalled();
  });

  it('rejects a transcription host drop without writing', async () => {
    vi.useFakeTimers();
    const desktopCall = vi.fn(async () => null);
    const onLayerMoved = vi.fn();
    const target = document.createElement('div');
    target.dataset.layerId = 'tx';
    target.dataset.dragSurface = 'sidebar';
    document.elementFromPoint = () => target;
    const { result } = renderHook(() =>
      useDesktopTranscriptionLayerDragController({
        sessionId: 'session',
        desktopCall,
        layers,
        links: [],
        currentLayerId: 'tx',
        refresh: async () => undefined,
        report: vi.fn(),
        onLayerMoved,
      }),
    );
    act(() => {
      result.current.onPointerDown('child', 'sidebar', {
        button: 0,
        pointerId: 1,
        clientX: 1,
        clientY: 1,
        currentTarget: document.createElement('button'),
      } as never);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(desktopCall).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 10 }));
    });
    expect(desktopCall).not.toHaveBeenCalled();
    expect(onLayerMoved).not.toHaveBeenCalled();
  });

  it('returns a hosted transcription to the front and keeps it selected', async () => {
    const desktopCall = vi.fn(async () => null);
    const onLayerMoved = vi.fn();
    const { result } = renderHook(() =>
      useDesktopTranscriptionLayerDragController({
        sessionId: 'session',
        desktopCall,
        layers,
        links: [{ layerId: 'child', hostLayerId: 'tx', isPreferred: true, linkType: 'direct' }],
        currentLayerId: 'tx',
        refresh: async () => undefined,
        report: vi.fn(),
        onLayerMoved,
      }),
    );
    act(() => {
      result.current.returnToRoot('child');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(desktopCall).toHaveBeenCalledWith('session', 'layers.clearHosts', {
      layerId: 'child',
      sortOrder: 0,
    });
    expect(onLayerMoved).toHaveBeenCalledWith('child', []);
  });

  it('hides return-to-root for a translation and offers it for a hosted transcription', () => {
    const { result } = renderHook(() =>
      useDesktopTranscriptionLayerDragController({
        sessionId: 'session',
        desktopCall: vi.fn(async () => null),
        layers,
        links: [{ layerId: 'child', hostLayerId: 'tx', isPreferred: true, linkType: 'direct' }],
        currentLayerId: 'tx',
        refresh: async () => undefined,
        report: vi.fn(),
      }),
    );
    expect(result.current.showReturn('tr')).toBe(false);
    expect(result.current.showReturn('child')).toBe(true);
    expect(result.current.returnReason('child')).toBeNull();
    expect(result.current.attachReason('child')).toBe('app.desktopTranscription.layerDropNotHost');
  });

  it('cancels the hold when the pointer moves before it activates', () => {
    vi.useFakeTimers();
    const desktopCall = vi.fn(async () => null);
    const { result } = renderHook(() =>
      useDesktopTranscriptionLayerDragController({
        sessionId: 'session',
        desktopCall,
        layers,
        links: [],
        currentLayerId: 'tx',
        refresh: async () => undefined,
        report: vi.fn(),
      }),
    );
    act(() => {
      result.current.onPointerDown('child', 'sidebar', {
        button: 0,
        pointerId: 1,
        clientX: 4,
        clientY: 8,
        currentTarget: document.createElement('button'),
      } as never);
    });
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 8 }));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.draggedIds).toEqual([]);
    expect(desktopCall).not.toHaveBeenCalled();
  });
  it('cancels an active drag on blur and ignores a later release', async () => {
    vi.useFakeTimers();
    const desktopCall = vi.fn(async () => null);
    const target = document.createElement('div');
    target.dataset.layerId = 'tx';
    target.dataset.dragSurface = 'sidebar';
    document.elementFromPoint = () => target;
    const { result } = renderHook(() =>
      useDesktopTranscriptionLayerDragController({
        sessionId: 'session',
        desktopCall,
        layers,
        links: [],
        currentLayerId: 'tx',
        refresh: async () => undefined,
        report: vi.fn(),
      }),
    );
    act(() =>
      result.current.onPointerDown('child', 'sidebar', {
        button: 0,
        pointerId: 1,
        clientX: 1,
        clientY: 1,
        currentTarget: document.createElement('button'),
      } as never),
    );
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.draggedIds).toEqual(['child']);
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(result.current.draggedIds).toEqual([]);
    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 10 }));
    });
    expect(desktopCall).not.toHaveBeenCalled();
  });

  it('shares the write lock between menu actions until refresh finishes', async () => {
    let finish!: () => void;
    const desktopCall = vi.fn(async () => null);
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useDesktopTranscriptionLayerDragController({
        sessionId: 'session',
        desktopCall,
        layers,
        links: [{ layerId: 'child', hostLayerId: 'tx', isPreferred: true }],
        currentLayerId: 'tx',
        refresh,
        report: vi.fn(),
      }),
    );
    await act(async () => {
      result.current.returnToRoot('child');
      result.current.attachToCurrent('child');
    });
    expect(desktopCall).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await act(async () => result.current.attachToCurrent('child'));
    expect(desktopCall).toHaveBeenCalledTimes(1);
  });
  it('locates the revealed row on both surfaces after rendering and skips hidden rows', async () => {
    let frame!: FrameRequestCallback;
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((next) => {
      frame = next;
      return 1;
    });
    const scrolls: ReturnType<typeof vi.fn>[] = [];
    const rows: HTMLElement[] = [];
    try {
      await settleLayerDrop(
        {
          sessionId: 'session',
          desktopCall: vi.fn(async () => null),
          layers,
          links: [],
          refresh: async () => undefined,
          report: vi.fn(),
        },
        { ok: true, action: 'clear', layerId: 'child', sortOrder: 0 },
        {
          writing: { current: false },
          setNotice: vi.fn(),
        },
      );
      for (const surface of ['sidebar', 'timeline', 'timeline']) {
        const row = document.createElement('div');
        row.dataset.layerId = 'child';
        row.dataset.dragSurface = surface;
        const visible = rows.length < 2;
        row.getClientRects = () => (visible ? [{}] : []) as never;
        row.scrollIntoView = vi.fn();
        scrolls.push(row.scrollIntoView as ReturnType<typeof vi.fn>);
        rows.push(row);
        document.body.append(row);
      }
      expect(scrolls[0]).not.toHaveBeenCalled();
      frame(0);
      expect(scrolls[0]).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
      expect(scrolls[1]).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
      expect(scrolls[2]).not.toHaveBeenCalled();
    } finally {
      rows.forEach((row) => row.remove());
      raf.mockRestore();
    }
  });
  it('offers the top drop zone when dragging an independent transcription root', async () => {
    vi.useFakeTimers();
    const desktopCall = vi.fn(async () => null);
    const target = document.createElement('div');
    target.dataset.drop = 'root';
    target.dataset.dropIndex = '0';
    target.dataset.dragSurface = 'timeline';
    document.elementFromPoint = () => target;
    const { result } = renderHook(() =>
      useDesktopTranscriptionLayerDragController({
        sessionId: 'session',
        desktopCall,
        layers,
        links: [],
        currentLayerId: 'tx',
        refresh: async () => undefined,
        report: vi.fn(),
      }),
    );
    act(() =>
      result.current.onPointerDown('child', 'timeline', {
        button: 0,
        pointerId: 1,
        clientX: 1,
        clientY: 1,
        currentTarget: document.createElement('span'),
      } as never),
    );
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.rootZone).toBe(true);
    expect(result.current.returnReason('child')).toBe('app.desktopTranscription.layerAlreadyRoot');
    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 10 }));
    });
    expect(desktopCall).toHaveBeenCalledWith('session', 'layers.clearHosts', {
      layerId: 'child',
      sortOrder: 0,
    });
  });
});
