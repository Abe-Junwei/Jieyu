import type { LayerDocType, LayerUnitContentDocType } from '../db';
import { t, tf, type Locale } from '../i18n';

export const UNDO_LABEL_KEYS = {
  editUnitText: 'transcription.unitAction.undo.editText',
  updateTiming: 'transcription.unitAction.undo.updateTiming',
  clearTranslationText: 'transcription.unitAction.undo.clearTranslation',
  editTranslationText: 'transcription.unitAction.undo.editTranslation',
  createAdjacentUnit: 'transcription.unitAction.undo.createNext',
  createFromSelection: 'transcription.unitAction.undo.createFromSelection',
  deleteUnit: 'transcription.unitAction.undo.delete',
  mergeWithPrevious: 'transcription.unitAction.undo.mergePrevious',
  mergeWithNext: 'transcription.unitAction.undo.mergeNext',
  splitUnit: 'transcription.unitAction.undo.split',
  deleteSelectedUnits: 'transcription.unitAction.undo.deleteSelection',
  offsetSelectedTimes: 'transcription.unitAction.undo.offsetSelection',
  scaleSelectedTimes: 'transcription.unitAction.undo.scaleSelection',
  splitByRegex: 'transcription.unitAction.undo.regexSplitSelection',
  mergeSelectedUnits: 'transcription.unitAction.undo.mergeSelection',
  editSelfCertainty: 'transcription.unitAction.undo.editSelfCertainty',
  /** 同时修改段行/单元行上的多个 per-layer 存储字段（status / provenance / selfCertainty 等） */
  editPerLayerRowFields: 'transcription.unitAction.undo.editPerLayerRowFields',
} as const;

export type UndoLabelKey = keyof typeof UNDO_LABEL_KEYS;

export function getUndoLabel(locale: Locale, key: UndoLabelKey): string {
  return t(locale, UNDO_LABEL_KEYS[key]);
}

export function resolveUnitActionErrorDetail(locale: Locale, error: unknown): string {
  return error instanceof Error ? error.message : t(locale, 'transcription.error.common.unknown');
}

type LegacySpeakerLinkedUnitText = LayerUnitContentDocType & {
  recordedBySpeakerId?: string;
  speakerId?: string;
};

export function stripSpeakerAssociationFromTranslationText(doc: LayerUnitContentDocType): LayerUnitContentDocType {
  const { recordedBySpeakerId: _recordedBySpeakerId, speakerId: _speakerId, ...rest } = doc as LegacySpeakerLinkedUnitText;
  return rest as LayerUnitContentDocType;
}

export function formatRollbackFailureMessage(locale: Locale, actionKey: UndoLabelKey, error: unknown): string {
  return tf(locale, 'transcription.error.action.rollbackAfterFailure', {
    action: getUndoLabel(locale, actionKey),
    message: resolveUnitActionErrorDetail(locale, error),
  });
}

export function resolveProjectionLayerIdsForNewUnit(
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
