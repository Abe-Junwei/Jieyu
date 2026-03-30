// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import { useTranscriptionWorkspaceLayoutController } from './useTranscriptionWorkspaceLayoutController';

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

  it('hydrates persisted workspace layout state, prunes stale lane heights, and auto-scrolls the selected row', async () => {
    localStorage.setItem('jieyu:lane-label-width', '999');
    localStorage.setItem('jieyu:lane-heights', JSON.stringify({ 'layer-a': 168, stale: 220 }));
    localStorage.setItem('jieyu:video-preview-height', '80');
    localStorage.setItem('jieyu:video-right-panel-width', '1000');
    localStorage.setItem('jieyu:video-layout-mode', 'left');

    const scrollSpy = vi.fn();
    const utteranceRowRef = makeUtteranceRowRef(scrollSpy);

    const { result } = renderHook(() => useTranscriptionWorkspaceLayoutController({
      layers: [makeLayer('layer-a'), makeLayer('layer-b')],
      selectedTimelineOwnerUtteranceId: 'utt-1',
      utteranceRowRef,
    }));

    expect(result.current.laneLabelWidth).toBe(180);
    expect(result.current.videoPreviewHeight).toBe(120);
    expect(result.current.videoRightPanelWidth).toBe(720);
    expect(result.current.videoLayoutMode).toBe('left');

    await waitFor(() => {
      expect(result.current.timelineLaneHeights).toEqual({ 'layer-a': 168 });
    });

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
    expect(localStorage.getItem('jieyu:lane-heights')).toBe(JSON.stringify({ 'layer-a': 168 }));
  });

  it('handles focus-mode shortcuts and persists lane height updates', async () => {
    const { result } = renderHook(() => useTranscriptionWorkspaceLayoutController({
      layers: [makeLayer('layer-a')],
      selectedTimelineOwnerUtteranceId: undefined,
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

    await waitFor(() => {
      expect(localStorage.getItem('jieyu:lane-heights')).toBe(JSON.stringify({ 'layer-a': 144 }));
    });
  });
});