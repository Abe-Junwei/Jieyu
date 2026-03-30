import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { getDb } from '../db';
import type {
  LayerDocType,
  MediaItemDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
import { newId } from '../utils/transcriptionFormatters';
import {
  listUtteranceTextsByUtterance,
  removeUtteranceTextFromSegmentationV2,
  syncUtteranceTextToSegmentationV2,
} from '../services/LayerSegmentationTextService';
import {
  type UtteranceTextWithoutLayerId,
  withUtteranceTextLayerId,
} from '../services/LayerIdBridgeService';
import type { SaveState } from './transcriptionTypes';

type UseTranscriptionVoiceTranslationActionsParams = {
  resolveUtteranceById: (db: Awaited<ReturnType<typeof getDb>>, utteranceId: string) => Promise<UtteranceDocType | null>;
  setMediaItems: Dispatch<SetStateAction<MediaItemDocType[]>>;
  setSaveState: (s: SaveState) => void;
  setTranslations: Dispatch<SetStateAction<UtteranceTextDocType[]>>;
};

export function useTranscriptionVoiceTranslationActions({
  resolveUtteranceById,
  setMediaItems,
  setSaveState,
  setTranslations,
}: UseTranscriptionVoiceTranslationActionsParams) {
  const saveVoiceTranslation = useCallback(async (
    blob: Blob,
    targetUtterance: UtteranceDocType,
    targetLayer: LayerDocType,
  ) => {
    if (!targetUtterance || !targetLayer) {
      throw new Error('请先选择句子与翻译层');
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const existingAudioTranslation = (await listUtteranceTextsByUtterance(db, targetUtterance.id))
      .filter((item) => item.layerId === targetLayer.id && Boolean(item.translationAudioMediaId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    const mediaId = newId('media');
    const newMedia: MediaItemDocType = {
      id: mediaId,
      textId: targetUtterance.textId,
      filename: `${targetLayer.key}-${mediaId}.webm`,
      isOfflineCached: true,
      details: { source: 'translation-recording', mimeType: blob.type || 'audio/webm', audioBlob: blob },
      createdAt: now,
    } as MediaItemDocType;
    await db.collections.media_items.insert(newMedia);

    const translationId = existingAudioTranslation?.id ?? newId('utr');
    const newTranslation: UtteranceTextDocType = existingAudioTranslation
      ? {
        ...existingAudioTranslation,
        modality: existingAudioTranslation.modality === 'mixed' || Boolean(existingAudioTranslation.text) ? 'mixed' : 'audio',
        translationAudioMediaId: mediaId,
        sourceType: 'human',
        updatedAt: now,
      }
      : {
        ...withUtteranceTextLayerId({
          id: translationId,
          utteranceId: targetUtterance.id,
          modality: 'audio',
          translationAudioMediaId: mediaId,
          sourceType: 'human',
          createdAt: now,
          updatedAt: now,
        } as UtteranceTextWithoutLayerId, { layerId: targetLayer.id }),
      } as UtteranceTextDocType;

    await syncUtteranceTextToSegmentationV2(db, targetUtterance, newTranslation);

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
    setSaveState({ kind: 'done', message: `录音翻译已保存 (${translationId})` });
  }, [setMediaItems, setSaveState, setTranslations]);

  const deleteVoiceTranslation = useCallback(async (
    targetUtterance: UtteranceDocType,
    targetLayer: LayerDocType,
  ) => {
    if (!targetUtterance || !targetLayer) {
      throw new Error('请先选择句子与翻译层');
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const existingAudioTranslation = (await listUtteranceTextsByUtterance(db, targetUtterance.id))
      .filter((item) => item.layerId === targetLayer.id && Boolean(item.translationAudioMediaId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    const mediaId = existingAudioTranslation?.translationAudioMediaId;
    if (!existingAudioTranslation || !mediaId) {
      setSaveState({ kind: 'done', message: '当前翻译没有可删除的录音' });
      return;
    }

    const normalizedText = (existingAudioTranslation.text ?? '').trim();
    const utterance = await resolveUtteranceById(db, targetUtterance.id);

    if (normalizedText) {
      const { translationAudioMediaId: _removedAudioId, ...translationWithoutAudio } = existingAudioTranslation;
      const updatedTranslation: UtteranceTextDocType = {
        ...translationWithoutAudio,
        modality: 'text',
        updatedAt: now,
      } as UtteranceTextDocType;
      if (utterance) {
        await syncUtteranceTextToSegmentationV2(db, utterance, updatedTranslation);
      }
      setTranslations((prev) => prev.map((item) => (item.id === existingAudioTranslation.id ? updatedTranslation : item)));
    } else {
      await removeUtteranceTextFromSegmentationV2(db, existingAudioTranslation);
      setTranslations((prev) => prev.filter((item) => item.id !== existingAudioTranslation.id));
    }

    await db.dexie.media_items.delete(mediaId);
    setMediaItems((prev) => prev.filter((item) => item.id !== mediaId));
    setSaveState({ kind: 'done', message: '录音翻译已删除' });
  }, [resolveUtteranceById, setMediaItems, setSaveState, setTranslations]);

  return {
    saveVoiceTranslation,
    deleteVoiceTranslation,
  };
}