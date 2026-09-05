import type { LexemeAssetKind } from '../db/types';

export const LEXEME_ASSET_MAX_BYTES = 5 * 1024 * 1024;

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const AUDIO_MIME = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-wav',
  'audio/wave',
]);
const DOCUMENT_MIME = new Set(['application/pdf', 'text/plain']);

export function classifyLexemeAssetMime(mimeType: string): LexemeAssetKind | null {
  const normalized = mimeType.trim().toLowerCase();
  if (IMAGE_MIME.has(normalized)) return 'image';
  if (AUDIO_MIME.has(normalized)) return 'audio';
  if (DOCUMENT_MIME.has(normalized)) return 'document';
  return null;
}

export function lexemeAssetAcceptAttribute(): string {
  return [...IMAGE_MIME, ...AUDIO_MIME, ...DOCUMENT_MIME].join(',');
}
