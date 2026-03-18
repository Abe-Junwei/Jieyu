import { useEffect, useRef, useState } from 'react';
import type { MediaItemDocType } from '../../db';

type Params = {
  mediaItems: MediaItemDocType[];
  selectedMediaId: string;
  setSelectedMediaId: (id: string) => void;
  selectedUtteranceMediaId: string | undefined;
  selectedUtteranceMedia: MediaItemDocType | undefined;
};

export function useTranscriptionMediaSelection({
  mediaItems,
  selectedMediaId,
  setSelectedMediaId,
  selectedUtteranceMediaId,
  selectedUtteranceMedia,
}: Params) {
  useEffect(() => {
    if (selectedUtteranceMediaId) {
      if (selectedUtteranceMediaId !== selectedMediaId) {
        setSelectedMediaId(selectedUtteranceMediaId);
      }
      return;
    }

    if (mediaItems.length === 0) {
      if (selectedMediaId) setSelectedMediaId('');
      return;
    }

    if (!selectedMediaId) {
      const firstMedia = mediaItems[0];
      if (firstMedia) setSelectedMediaId(firstMedia.id);
      return;
    }

    const exists = mediaItems.some((item) => item.id === selectedMediaId);
    if (!exists) {
      const firstMedia = mediaItems[0];
      if (firstMedia) setSelectedMediaId(firstMedia.id);
    }
  }, [mediaItems, selectedMediaId, selectedUtteranceMediaId, setSelectedMediaId]);

  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | undefined>();
  const objectUrlRef = useRef<string | undefined>(undefined);
  const blobMediaIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const media = selectedUtteranceMedia;
    const mediaId = media?.id;

    if (mediaId && mediaId === blobMediaIdRef.current) return;
    blobMediaIdRef.current = mediaId;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = undefined;
    }

    if (!media) {
      setSelectedMediaUrl(undefined);
      return;
    }

    const details = media.details as Record<string, unknown> | undefined;
    const blob = details?.audioBlob;
    if (blob instanceof Blob) {
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setSelectedMediaUrl(url);
      return;
    }

    setSelectedMediaUrl(media.url);
  }, [selectedUtteranceMedia]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  return {
    selectedMediaUrl,
  };
}