import type { LayerDocType, UtteranceTextDocType } from '../db';
import { t, tf, type Locale } from '../i18n';

export const UNDO_LABEL_KEYS = {
  editUtteranceText: 'transcription.utteranceAction.undo.editText',
  updateTiming: 'transcription.utteranceAction.undo.updateTiming',
  clearTranslationText: 'transcription.utteranceAction.undo.clearTranslation',
  editTranslationText: 'transcription.utteranceAction.undo.editTranslation',
  createNextUtterance: 'transcription.utteranceAction.undo.createNext',
  createFromSelection: 'transcription.utteranceAction.undo.createFromSelection',
  deleteUtterance: 'transcription.utteranceAction.undo.delete',
  mergeWithPrevious: 'transcription.utteranceAction.undo.mergePrevious',
  mergeWithNext: 'transcription.utteranceAction.undo.mergeNext',
  splitUtterance: 'transcription.utteranceAction.undo.split',
  deleteSelectedUtterances: 'transcription.utteranceAction.undo.deleteSelection',
  offsetSelectedTimes: 'transcription.utteranceAction.undo.offsetSelection',
  scaleSelectedTimes: 'transcription.utteranceAction.undo.scaleSelection',
  splitByRegex: 'transcription.utteranceAction.undo.regexSplitSelection',
  mergeSelectedUtterances: 'transcription.utteranceAction.undo.mergeSelection',
  editSelfCertainty: 'transcription.utteranceAction.undo.editSelfCertainty',
} as const;

export type UndoLabelKey = keyof typeof UNDO_LABEL_KEYS;

export function getUndoLabel(locale: Locale, key: UndoLabelKey): string {
  return t(locale, UNDO_LABEL_KEYS[key]);
}

export function resolveUtteranceActionErrorDetail(locale: Locale, error: unknown): string {
  return error instanceof Error ? error.message : t(locale, 'transcription.error.common.unknown');
}

type LegacySpeakerLinkedUtteranceText = UtteranceTextDocType & {
  recordedBySpeakerId?: string;
  speakerId?: string;
};

export function stripSpeakerAssociationFromTranslationText(doc: UtteranceTextDocType): UtteranceTextDocType {
  const { recordedBySpeakerId: _recordedBySpeakerId, speakerId: _speakerId, ...rest } = doc as LegacySpeakerLinkedUtteranceText;
  return rest as UtteranceTextDocType;
}

export function formatRollbackFailureMessage(locale: Locale, actionKey: UndoLabelKey, error: unknown): string {
  return tf(locale, 'transcription.error.action.rollbackAfterFailure', {
    action: getUndoLabel(locale, actionKey),
    message: resolveUtteranceActionErrorDetail(locale, error),
  });
}

export function resolveProjectionLayerIdsForNewUtterance(
  layerById: ReadonlyMap<string, LayerDocType>,
  defaultTranscriptionLayerId: string | undefined,
  focusedLayerId: string | undefined,
): string[] {
  const targetLayerId = focusedLayerId ?? defaultTranscriptionLayerId;
  if (!targetLayerId) return [];

  const resolved = new Set<string>([targetLayerId]);
  const targetLayer = layerById.get(targetLayerId);
  if (!targetLayer) return [...resolved];

  if (targetLayer.layerType === 'transcription' && targetLayer.constraint === 'symbolic_association') {
    const parentLayerId = targetLayer.parentLayerId?.trim() ?? '';
    const parentLayer = parentLayerId ? layerById.get(parentLayerId) : undefined;
    if (parentLayer && parentLayer.layerType === 'transcription' && parentLayer.constraint === 'independent_boundary') {
      resolved.add(parentLayer.id);
    }
  }

  return [...resolved];
}
