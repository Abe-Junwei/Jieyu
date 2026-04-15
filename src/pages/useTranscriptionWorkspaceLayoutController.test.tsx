// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import { useTranscriptionWorkspaceLayoutController } from './useTranscriptionWorkspaceLayoutController';
import { emitWorkspaceLayoutPreferenceChanged } from '../utils/workspaceLayoutPreferenceSync';

function makeLayer(id: string): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType: 'transcription',
    languageId: 'zh-CN',
    modality: 'text',
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
  } as LayerDocType;
}

function makeUtteranceRowRef(scrollIntoView?: () => void): MutableRefObject<Record<string, HTMLDivElement | null>> {
  return {
    current: {
      'utt-1': scrollIntoView ? ({ scrollIntoView } as unknown as HTMLDivElement) : null,
    },
  };
}

describe('useTranscriptionWorkspaceLayoutController', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('hydrates persisted workspace layout state, prunes stale lane heights, and respects stored auto-scroll preference', async () => {
    localStorage.setItem('jieyu:lane-label-width', '999');
    localStorage.setItem('jieyu:lane-heights', JSON.stringify({ 'layer-a': 168, stale: 220 }));
    localStorage.setItem('jieyu:video-preview-height', '80');
    localStorage.setItem('jieyu:video-right-panel-width', '1000');
    localStorage.setItem('jieyu:video-layout-mode', 'left');
    localStorage.setItem('jieyu:workspace-auto-scroll-enabled', '0');
    localStorage.setItem('jieyu:workspace-snap-enabled', '1');
    localStorage.setItem('jieyu:workspace-default-zoom-mode', 'custom');

    const scrollSpy = vi.fn();
    const utteranceRowRef = makeUtteranceRowRef(scrollSpy);

    const { result } = renderHook(() => useTranscriptionWorkspaceLayoutController({
      layers: [makeLayer('layer-a'), makeLayer('layer-b')],
      selectedTimelineOwnerUnitId: 'utt-1',
      utteranceRowRef,
    }));

    expect(result.current.laneLabelWidth).toBe(180);
    expect(result.current.videoPreviewHeight).toBe(120);
    expect(result.current.videoRightPanelWidth).toBe(720);
    expect(result.current.videoLayoutMode).toBe('left');
    expect(result.current.autoScrollEnabled).toBe(false);
    expect(result.current.snapEnabled).toBe(true);
    expect(result.current.zoomMode).toBe('custom');

    await waitFor(() => {
      expect(result.current.timelineLaneHeights).toEqual({ 'layer-a': 168 });
    });

    expect(scrollSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('jieyu:lane-heights')).toBe(JSON.stringify({ 'layer-a': 168 }));
  });

  it('handles focus-mode shortcuts and persists lane height updates', async () => {
    const { result } = renderHook(() => useTranscriptionWorkspaceLayoutController({
      layers: [makeLayer('layer-a')],
      selectedTimelineOwnerUnitId: undefined,
      utteranceRowRef: makeUtteranceRowRef(),
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', metaKey: true, shiftKey: true }));
    });
    expect(result.current.isFocusMode).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
    });
    expect(result.current.showShortcuts).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.isFocusMode).toBe(false);

    act(() => {
      result.current.handleTimelineLaneHeightChange('layer-a', 144);
    });

    act(() => {
      result.current.setAutoScrollEnabled(false);
      result.current.setSnapEnabled(true);
      result.current.setZoomMode('fit-selection');
    });

    await waitFor(() => {
      expect(localStorage.getItem('jieyu:lane-heights')).toBe(JSON.stringify({ 'layer-a': 144 }));
      expect(localStorage.getItem('jieyu:workspace-auto-scroll-enabled')).toBe('0');
      expect(localStorage.getItem('jieyu:workspace-snap-enabled')).toBe('1');
      expect(localStorage.getItem('jieyu:workspace-default-zoom-mode')).toBe('fit-selection');
    });
  });

  it('clears document resize styles on unmount during active resize', async () => {
    const { result, unmount } = renderHook(() => useTranscriptionWorkspaceLayoutController({
      layers: [makeLayer('layer-a')],
      selectedTimelineOwnerUnitId: undefined,
      utteranceRowRef: makeUtteranceRowRef(),
    }));

    act(() => {
      result.current.handleVideoPreviewResizeStart({
        clientY: 120,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.handleVideoPreviewResizeStart>[0]);
    });

    await waitFor(() => {
      expect(document.body.style.userSelect).toBe('none');
      expect(document.body.style.cursor).toBe('ns-resize');
    });

    unmount();

    expect(document.body.style.userSelect).toBe('');
    expect(document.body.style.cursor).toBe('');
  });

  it('applies video layout defaults immediately after settings update event', () => {
    localStorage.setItem('jieyu:video-preview-height', '220');
    localStorage.setItem('jieyu:video-right-panel-width', '360');
    localStorage.setItem('jieyu:video-layout-mode', 'top');

    const { result } = renderHook(() => useTranscriptionWorkspaceLayoutController({
      layers: [makeLayer('layer-a')],
      selectedTimelineOwnerUnitId: undefined,
      utteranceRowRef: makeUtteranceRowRef(),
    }));

    expect(result.current.videoPreviewHeight).toBe(220);
    expect(result.current.videoRightPanelWidth).toBe(360);
    expect(result.current.videoLayoutMode).toBe('top');

    act(() => {
      localStorage.setItem('jieyu:video-preview-height', '420');
      localStorage.setItem('jieyu:video-right-panel-width', '520');
      localStorage.setItem('jieyu:video-layout-mode', 'left');
      emitWorkspaceLayoutPreferenceChanged();
    });

    expect(result.current.videoPreviewHeight).toBe(420);
    expect(result.current.videoRightPanelWidth).toBe(520);
    expect(result.current.videoLayoutMode).toBe('left');
  });
});