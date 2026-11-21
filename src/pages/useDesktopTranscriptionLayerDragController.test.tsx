/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('writes the host link only when the pointer is released on a transcription header', async () => {
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
    expect(desktopCall).toHaveBeenCalledWith('session', 'layers.setHosts', {
      layerId: 'child',
      hostLayerIds: ['tx'],
      preferredHostLayerId: 'tx',
      linkType: 'direct',
      append: true,
    });
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
    expect(result.current.attachReason('child')).toBeNull();
  });
});
