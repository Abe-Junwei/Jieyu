// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranscriptionMediaSelection } from './useTranscriptionMediaSelection';
import type { MediaItemDocType } from '../db';

type HookProps = {
  mediaItems: MediaItemDocType[];
  selectedMediaId: string;
  selectedUnitMediaId: string | undefined;
  selectedUnitMedia: MediaItemDocType | undefined;
};

function makeBlobMedia(id: string, filename = 'demo.wav'): MediaItemDocType {
  return {
    id,
    textId: 'text-1',
    filename,
    duration: 3.2,
    details: {
      audioBlob: new Blob(['demo'], { type: 'audio/wav' }),
    },
    isOfflineCached: true,
    createdAt: '2026-04-10T00:00:00.000Z',
  } as MediaItemDocType;
}

describe('useTranscriptionMediaSelection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps existing blob URL during transient empty media state', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:media-1-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const setSelectedMediaId = vi.fn();
    const media = makeBlobMedia('media-1');

    const { result, rerender } = renderHook<ReturnType<typeof useTranscriptionMediaSelection>, HookProps>((props: HookProps) => useTranscriptionMediaSelection({
      ...props,
      setSelectedMediaId,
    }), {
      initialProps: {
        mediaItems: [media],
        selectedMediaId: 'media-1',
        selectedUnitMediaId: undefined,
        selectedUnitMedia: media,
      },
    });

    await waitFor(() => {
      expect(result.current.selectedMediaUrl).toBe('blob:media-1-url');
    });

    rerender({
      mediaItems: [media],
      selectedMediaId: 'media-1',
      selectedUnitMediaId: undefined,
      selectedUnitMedia: undefined,
    });

    await waitFor(() => {
      expect(result.current.selectedMediaUrl).toBe('blob:media-1-url');
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(0);

    rerender({
      mediaItems: [media],
      selectedMediaId: '',
      selectedUnitMediaId: undefined,
      selectedUnitMedia: undefined,
    });

    await waitFor(() => {
      expect(result.current.selectedMediaUrl).toBeUndefined();
    });
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('revokes old blob URL only after next media is resolved', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:media-1-url')
      .mockReturnValueOnce('blob:media-2-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const setSelectedMediaId = vi.fn();
    const mediaA = makeBlobMedia('media-1', 'a.wav');
    const mediaB = makeBlobMedia('media-2', 'b.wav');

    const { result, rerender } = renderHook<ReturnType<typeof useTranscriptionMediaSelection>, HookProps>((props: HookProps) => useTranscriptionMediaSelection({
      ...props,
      setSelectedMediaId,
    }), {
      initialProps: {
        mediaItems: [mediaA, mediaB],
        selectedMediaId: 'media-1',
        selectedUnitMediaId: undefined,
        selectedUnitMedia: mediaA,
      },
    });

    await waitFor(() => {
      expect(result.current.selectedMediaUrl).toBe('blob:media-1-url');
    });

    rerender({
      mediaItems: [mediaA, mediaB],
      selectedMediaId: 'media-2',
      selectedUnitMediaId: undefined,
      selectedUnitMedia: undefined,
    });

    await waitFor(() => {
      expect(result.current.selectedMediaUrl).toBe('blob:media-1-url');
    });
    expect(revokeObjectURL).toHaveBeenCalledTimes(0);

    rerender({
      mediaItems: [mediaA, mediaB],
      selectedMediaId: 'media-2',
      selectedUnitMediaId: undefined,
      selectedUnitMedia: mediaB,
    });

    await waitFor(() => {
      expect(result.current.selectedMediaUrl).toBe('blob:media-2-url');
    });
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:media-1-url');
  });

  it('clears the stale blob URL when the same media id becomes a document placeholder after deletion', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:media-1-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const setSelectedMediaId = vi.fn();
    const audioMedia = makeBlobMedia('media-1', 'demo.wav');
    const placeholderMedia = {
      ...audioMedia,
      filename: 'document-placeholder.track',
      details: {
        placeholder: true,
        timelineMode: 'document',
      },
    } as MediaItemDocType;

    const { result, rerender } = renderHook<ReturnType<typeof useTranscriptionMediaSelection>, HookProps>((props: HookProps) => useTranscriptionMediaSelection({
      ...props,
      setSelectedMediaId,
    }), {
      initialProps: {
        mediaItems: [audioMedia],
        selectedMediaId: 'media-1',
        selectedUnitMediaId: undefined,
        selectedUnitMedia: audioMedia,
      },
    });

    await waitFor(() => {
      expect(result.current.selectedMediaUrl).toBe('blob:media-1-url');
    });

    rerender({
      mediaItems: [placeholderMedia],
      selectedMediaId: 'media-1',
      selectedUnitMediaId: undefined,
      selectedUnitMedia: placeholderMedia,
    });

    await waitFor(() => {
      expect(result.current.selectedMediaUrl).toBeUndefined();
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:media-1-url');
  });
});
