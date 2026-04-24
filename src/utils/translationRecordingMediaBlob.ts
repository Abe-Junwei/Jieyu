import type { MediaItemDocType } from '../db';

/**
 * 翻译/转写条录音入库时的文件名后缀（与 `blob.type`、`MediaRecorder.mimeType` 对齐）。
 * Safari 常见 `audio/mp4` → 使用 `.m4a` 以与导入侧约定一致。
 */
export function fileExtensionForRecordedVoiceBlob(blob: Blob): string {
  const t = (blob.type || '').toLowerCase();
  if (t.includes('webm')) return 'webm';
  if (t.includes('mp4')) return 'm4a';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  return 'webm';
}

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
