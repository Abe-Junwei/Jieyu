import type { LayerDocType } from '../db';
import { getLayerLabelParts } from '../utils/transcriptionFormatters';
import { escapeRegExp } from '../utils/escapeRegExp';
import type { LayerActionPopoverMessages } from '../i18n/messages';

export type LayerActionType =
  | 'create-transcription'
  | 'create-translation'
  | 'edit-transcription-metadata'
  | 'edit-translation-metadata'
  | 'delete';

export function resolveCreateFailureText(
  message: string | undefined,
  fallback: string,
  createFailedPrefix: string,
  createdPrefix: string,
): string {
  const raw = (message ?? '').trim();
  const text = raw.replace(new RegExp(`^${escapeRegExp(createFailedPrefix)}[:：]\\s*`, 'u'), '');
  if (!text) return fallback;
  if (text.startsWith(createdPrefix) || text.startsWith('Created ')) return fallback;
  return text;
}

export function getCreateFallbackMessage(
  action: LayerActionType,
  messages: LayerActionPopoverMessages,
): string {
  if (action === 'create-translation') {
    return messages.translationCreateFallback;
  }
  if (action === 'create-transcription') {
    return messages.transcriptionCreateFallback;
  }
  return messages.genericActionFailed;
}

export function formatParentLayerOptionLabel(layer: LayerDocType): string {
  const { type, lang, alias } = getLayerLabelParts(layer);
  return alias ? `${type} · ${lang} · ${alias}` : `${type} · ${lang}`;
}
