import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { getDb } from '../db';
import type { LayerDocType, MediaItemDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import { newId } from '../utils/transcriptionFormatters';
import { listUnitTextsByUnit, removeUnitTextFromSegmentationV2, syncUnitTextToSegmentationV2 } from '../services/LayerSegmentationTextService';
import { type UnitTextWithoutLayerId, withUnitTextLayerId } from '../services/LayerIdBridgeService';
import type { SaveState } from './transcriptionTypes';
import { t, tf, useLocale } from '../i18n';

type UseTranscriptionVoiceTranslationActionsParams = {
  resolveUnitById: (db: Awaited<ReturnType<typeof getDb>>, unitId: string) => Promise<LayerUnitDocType | null>;
  setMediaItems: Dispatch<SetStateAction<MediaItemDocType[]>>;
  setSaveState: (s: SaveState) => void;
  setTranslations: Dispatch<SetStateAction<LayerUnitContentDocType[]>>;
};

export function useTranscriptionVoiceTranslationActions({
  resolveUnitById,
  setMediaItems,
  setSaveState,
  setTranslations,
}: UseTranscriptionVoiceTranslationActionsParams) {
  const locale = useLocale();

  const saveVoiceTranslation = useCallback(async (
    blob: Blob,
    targetUnit: LayerUnitDocType,
    targetLayer: LayerDocType,
  ) => {
    if (!targetUnit || !targetLayer) {
      throw new Error(t(locale, 'transcription.error.validation.voiceTranslationTargetRequired'));
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const existingAudioTranslation = (await listUnitTextsByUnit(db, targetUnit.id))
      .filter((item) => item.layerId === targetLayer.id && Boolean(item.translationAudioMediaId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    const mediaId = newId('media');
    const newMedia: MediaItemDocType = {
      id: mediaId,
      textId: targetUnit.textId,
      filename: `${targetLayer.key}-${mediaId}.webm`,
      isOfflineCached: true,
      details: { source: 'translation-recording', mimeType: blob.type || 'audio/webm', audioBlob: blob },
      createdAt: now,
    } as MediaItemDocType;
    await db.collections.media_items.insert(newMedia);

    const translationId = existingAudioTranslation?.id ?? newId('utr');
    const newTranslation: LayerUnitContentDocType = existingAudioTranslation
      ? {
        ...existingAudioTranslation,
        modality: existingAudioTranslation.modality === 'mixed' || Boolean(existingAudioTranslation.text) ? 'mixed' : 'audio',
        translationAudioMediaId: mediaId,
        sourceType: 'human',
        updatedAt: now,
      }
      : {
        ...withUnitTextLayerId({
          id: translationId,
          unitId: targetUnit.id,
          modality: 'audio',
          translationAudioMediaId: mediaId,
          sourceType: 'human',
          createdAt: now,
          updatedAt: now,
        } as UnitTextWithoutLayerId, { layerId: targetLayer.id }),
      } as LayerUnitContentDocType;

    await syncUnitTextToSegmentationV2(db, targetUnit, newTranslation);

    if (existingAudioTranslation?.translationAudioMediaId) {
      await db.dexie.media_items.delete(existingAudioTranslation.translationAudioMediaId);
    }

    setMediaItems((prev) => {
      const filtered = existingAudioTranslation?.translationAudioMediaId
        ? prev.filter((item) => item.id !== existingAudioTranslation.translationAudioMediaId)
        : prev;
      return [...filtered, newMedia];
    });
    setTranslations((prev) => {
      if (!existingAudioTranslation) {
        return [...prev, newTranslation];
      }
      return prev.map((item) => (item.id === existingAudioTranslation.id ? newTranslation : item));
    });
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.voiceTranslation.done.saved', { id: translationId }),
    });
  }, [locale, setMediaItems, setSaveState, setTranslations]);

  const deleteVoiceTranslation = useCallback(async (
    targetUnit: LayerUnitDocType,
    targetLayer: LayerDocType,
  ) => {
    if (!targetUnit || !targetLayer) {
      throw new Error(t(locale, 'transcription.error.validation.voiceTranslationTargetRequired'));
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const existingAudioTranslation = (await listUnitTextsByUnit(db, targetUnit.id))
      .filter((item) => item.layerId === targetLayer.id && Boolean(item.translationAudioMediaId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    const mediaId = existingAudioTranslation?.translationAudioMediaId;
    if (!existingAudioTranslation || !mediaId) {
      setSaveState({ kind: 'done', message: t(locale, 'transcription.voiceTranslation.done.noAudioToDelete') });
      return;
    }

    const normalizedText = (existingAudioTranslation.text ?? '').trim();
    const unit = await resolveUnitById(db, targetUnit.id);

    if (normalizedText) {
      const { translationAudioMediaId: _removedAudioId, ...translationWithoutAudio } = existingAudioTranslation;
      const updatedTranslation: LayerUnitContentDocType = {
        ...translationWithoutAudio,
        modality: 'text',
        updatedAt: now,
      } as LayerUnitContentDocType;
      if (unit) {
        await syncUnitTextToSegmentationV2(db, unit, updatedTranslation);
      }
      setTranslations((prev) => prev.map((item) => (item.id === existingAudioTranslation.id ? updatedTranslation : item)));
    } else {
      await removeUnitTextFromSegmentationV2(db, existingAudioTranslation);
      setTranslations((prev) => prev.filter((item) => item.id !== existingAudioTranslation.id));
    }

    await db.dexie.media_items.delete(mediaId);
    setMediaItems((prev) => prev.filter((item) => item.id !== mediaId));
    setSaveState({ kind: 'done', message: t(locale, 'transcription.voiceTranslation.done.deleted') });
  }, [locale, resolveUnitById, setMediaItems, setSaveState, setTranslations]);

  return {
    saveVoiceTranslation,
    deleteVoiceTranslation,
  };
}