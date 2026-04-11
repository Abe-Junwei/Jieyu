import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItemDocType } from '../db';

type Params = {
  mediaItems: MediaItemDocType[];
  selectedMediaId: string;
  setSelectedMediaId: (id: string) => void;
  selectedUtteranceMediaId: string | undefined;
  selectedUtteranceMedia: MediaItemDocType | undefined;
};

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];

function isMediaVideo(media: MediaItemDocType): boolean {
  const details = media.details as Record<string, unknown> | undefined;
  const blob = details?.audioBlob;
  if (blob instanceof Blob && (blob.type.startsWith('video/') || blob.type === 'application/octet-stream')) {
    // For blobs with unknown type, check filename extension
    const filename = media.filename.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => filename.endsWith(ext));
  }
  if (blob instanceof Blob && blob.type.startsWith('video/')) {
    return true;
  }
  if (media.url) {
    const url = media.url.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => url.includes(ext));
  }
  return false;
}

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

    if (!media) {
      // 选中媒体切换时可能出现短暂空态，避免提前 revoke 导致 blob 加载失败 | During media switching, avoid premature revoke on transient empty state.
      if (selectedMediaId) {
        return;
      }
      blobMediaIdRef.current = undefined;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = undefined;
      }
      setSelectedMediaUrl(undefined);
      return;
    }

    if (mediaId && mediaId === blobMediaIdRef.current) return;
    blobMediaIdRef.current = mediaId;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = undefined;
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
  }, [selectedMediaId, selectedUtteranceMedia]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  // 缓存已选媒体的 Blob 字节数，用于 VAD 预热前置门控 | Cache selected media blob byte size for VAD pre-fetch gate
  const selectedMediaBlobSize = useMemo(() => {
    const details = selectedUtteranceMedia?.details as Record<string, unknown> | undefined;
    const blob = details?.audioBlob;
    return blob instanceof Blob ? blob.size : undefined;
  }, [selectedUtteranceMedia]);

  return {
    selectedMediaUrl,
    selectedMediaBlobSize,
    selectedMediaIsVideo: selectedUtteranceMedia ? isMediaVideo(selectedUtteranceMedia) : false,
  };
}