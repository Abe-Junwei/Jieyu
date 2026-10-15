// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranscriptionMediaSelection } from './useTranscriptionMediaSelection';
import type { MediaItemDocType } from '../../db';

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
    timelineKind: 'acoustic',
    byteLocation: 'managed',
    availability: 'available',
    createdAt: '2026-04-10T00:00:00.000Z',
  } as MediaItemDocType;
}

describe('useTranscriptionMediaSelection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps existing blob URL during transient empty media state', async () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:media-1-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const setSelectedMediaId = vi.fn();
    const media = makeBlobMedia('media-1');

    const { result, rerender } = renderHook<
      ReturnType<typeof useTranscriptionMediaSelection>,
      HookProps
    >(
      (props: HookProps) =>
        useTranscriptionMediaSelection({
          ...props,
          setSelectedMediaId,
        }),
      {
        initialProps: {
          mediaItems: [media],
          selectedMediaId: 'media-1',
          selectedUnitMediaId: undefined,
          selectedUnitMedia: media,
        },
      },
    );

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
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:media-1-url')
      .mockReturnValueOnce('blob:media-2-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const setSelectedMediaId = vi.fn();
    const mediaA = makeBlobMedia('media-1', 'a.wav');
    const mediaB = makeBlobMedia('media-2', 'b.wav');

    const { result, rerender } = renderHook<
      ReturnType<typeof useTranscriptionMediaSelection>,
      HookProps
    >(
      (props: HookProps) =>
        useTranscriptionMediaSelection({
          ...props,
          setSelectedMediaId,
        }),
      {
        initialProps: {
          mediaItems: [mediaA, mediaB],
          selectedMediaId: 'media-1',
          selectedUnitMediaId: undefined,
          selectedUnitMedia: mediaA,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.selectedMediaUrl).toBe('blob:media-1-url');
    });

    rerender({
      mediaItems: [mediaA],
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

  it('refreshes playback after replacing same-size audio on the same media row', async () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:old-audio')
      .mockReturnValueOnce('blob:new-audio');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const setSelectedMediaId = vi.fn();
    const oldMedia = {
      ...makeBlobMedia('media-1'),
      contentSha256: 'a'.repeat(64),
    };
    const newMedia = {
      ...oldMedia,
      contentSha256: 'b'.repeat(64),
      details: { audioBlob: new Blob(['next'], { type: 'audio/wav' }) },
    };

    const { result, rerender } = renderHook(
      (props: HookProps) => useTranscriptionMediaSelection({ ...props, setSelectedMediaId }),
      {
        initialProps: {
          mediaItems: [oldMedia],
          selectedMediaId: 'media-1',
          selectedUnitMediaId: undefined,
          selectedUnitMedia: oldMedia,
        },
      },
    );
    expect(result.current.selectedMediaUrl).toBe('blob:old-audio');

    rerender({
      mediaItems: [newMedia],
      selectedMediaId: 'media-1',
      selectedUnitMediaId: undefined,
      selectedUnitMedia: newMedia,
    });

    await waitFor(() => expect(result.current.selectedMediaUrl).toBe('blob:new-audio'));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:old-audio');
  });

  it('clears the stale blob URL when the same media id becomes a document placeholder after deletion', async () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:media-1-url');
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

    const { result, rerender } = renderHook<
      ReturnType<typeof useTranscriptionMediaSelection>,
      HookProps
    >(
      (props: HookProps) =>
        useTranscriptionMediaSelection({
          ...props,
          setSelectedMediaId,
        }),
      {
        initialProps: {
          mediaItems: [audioMedia],
          selectedMediaId: 'media-1',
          selectedUnitMediaId: undefined,
          selectedUnitMedia: audioMedia,
        },
      },
    );

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

  it('keeps the imported recording when the selected sentence points at a row with no audio', () => {
    const setSelectedMediaId = vi.fn();
    const imported = makeBlobMedia('media-new', 'speech.wav');
    const empty = {
      ...makeBlobMedia('media-old', 'old.wav'),
      details: {},
      byteLocation: 'none',
      availability: 'missing',
    } as MediaItemDocType;
    renderHook(() =>
      useTranscriptionMediaSelection({
        mediaItems: [empty, imported],
        selectedMediaId: 'media-new',
        setSelectedMediaId,
        selectedUnitMediaId: 'media-old',
        selectedUnitMedia: imported,
      }),
    );
    expect(setSelectedMediaId).not.toHaveBeenCalled();
  });

  it('stays on the open row when it has no audio, even if another row does', () => {
    const setSelectedMediaId = vi.fn();
    const imported = makeBlobMedia('media-new', 'speech.wav');
    const empty = {
      ...makeBlobMedia('media-old', 'old.wav'),
      details: {},
      byteLocation: 'none',
      availability: 'missing',
    } as MediaItemDocType;
    renderHook(() =>
      useTranscriptionMediaSelection({
        mediaItems: [empty, imported],
        selectedMediaId: 'media-old',
        setSelectedMediaId,
        selectedUnitMediaId: '__unknown_media__',
        selectedUnitMedia: empty,
      }),
    );
    expect(setSelectedMediaId).not.toHaveBeenCalled();
  });

  it('does not draw another recording when the open row has no bytes', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:imported');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const imported = makeBlobMedia('media-new', 'speech.wav');
    const empty = {
      ...makeBlobMedia('media-old', 'speech.wav'),
      details: {},
      byteLocation: 'none',
      availability: 'missing',
    } as MediaItemDocType;
    const { result, rerender } = renderHook(
      ({ selectedMediaId }: { selectedMediaId: string }) =>
        useTranscriptionMediaSelection({
          mediaItems: [empty, imported],
          selectedMediaId,
          setSelectedMediaId: vi.fn(),
          selectedUnitMediaId: selectedMediaId,
          selectedUnitMedia: selectedMediaId === 'media-new' ? imported : empty,
        }),
      { initialProps: { selectedMediaId: 'media-new' } },
    );
    await waitFor(() => {
      expect(result.current.selectedMediaUrl).toBe('blob:imported');
    });
    rerender({ selectedMediaId: 'media-old' });
    await waitFor(() => {
      expect(result.current.selectedMediaUrl).toBeUndefined();
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('does not retarget the recording when the selected unit media id is not loaded', async () => {
    const setSelectedMediaId = vi.fn();
    const media = makeBlobMedia('media-1');
    renderHook(() =>
      useTranscriptionMediaSelection({
        mediaItems: [media],
        selectedMediaId: 'media-1',
        setSelectedMediaId,
        selectedUnitMediaId: '__unknown_media__',
        selectedUnitMedia: media,
      }),
    );
    expect(setSelectedMediaId).not.toHaveBeenCalled();
  });
});
