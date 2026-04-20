import type { MediaItemDocType } from '../db';

/** 从 `media_items.details` 读取录音 Blob（可为空大小；用于播放/物化 key） */
export function readAudioBlobFromDetails(details: unknown): Blob | null {
  if (!details || typeof details !== 'object') {
    return null;
  }
  const candidate = (details as { audioBlob?: unknown }).audioBlob;
  return candidate instanceof Blob ? candidate : null;
}

/** STT 等路径：仅当 Blob 非空时返回，否则 undefined */
export function readNonEmptyAudioBlobFromMediaItem(mediaItem?: MediaItemDocType): Blob | undefined {
  const b = readAudioBlobFromDetails(mediaItem?.details);
  return b && b.size > 0 ? b : undefined;
}
