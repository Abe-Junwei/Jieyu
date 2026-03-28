import { useCallback } from 'react';
import { getDb } from '../db';
import type {
  AnchorDocType,
  MediaItemDocType,
  LayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
import { LinguisticService } from '../services/LinguisticService';
import { newId, formatTime } from '../utils/transcriptionFormatters';
import { shouldPushTimingUndo, type TimingUndoState } from '../utils/selectionUtils';
import { createLogger } from '../observability/logger';
import { reportActionError } from '../utils/actionErrorReporter';
import { reportValidationError } from '../utils/validationErrorReporter';
import { createTimelineUnit, type SaveState, type SnapGuide, type TimelineUnit } from './transcriptionTypes';
import { invalidateUtteranceEmbeddings } from '../ai/embeddings/EmbeddingInvalidationService';
import {
  listUtteranceTextsByUtterance,
  removeUtteranceTextFromSegmentationV2,
  syncUtteranceTextToSegmentationV2,
} from '../services/LayerSegmentationTextService';
import {
  type UtteranceTextWithoutLayerId,
  withUtteranceTextLayerId,
} from '../services/LayerIdBridgeService';

const log = createLogger('useTranscriptionUtteranceActions');

type LegacySpeakerLinkedUtteranceText = UtteranceTextDocType & {
  recordedBySpeakerId?: string;
  speakerId?: string;
};

function stripSpeakerAssociationFromTranslationText(doc: UtteranceTextDocType): UtteranceTextDocType {
  // 翻译层数据不应保留说话人关联字段 | Translation rows should not keep speaker-linked fields
  const { recordedBySpeakerId: _recordedBySpeakerId, speakerId: _speakerId, ...rest } = doc as LegacySpeakerLinkedUtteranceText;
  return rest as UtteranceTextDocType;
}

function formatRollbackFailureMessage(actionLabel: string, error: unknown): string {
  const message = error instanceof Error ? error.message : '未知错误';
  return `${actionLabel}失败，已回滚：${message}`;
}

function resolveProjectionLayerIdsForNewUtterance(
  layerById: ReadonlyMap<string, LayerDocType>,
  defaultTranscriptionLayerId: string | undefined,
  focusedLayerId: string | undefined,
): string[] {
  const targetLayerId = focusedLayerId ?? defaultTranscriptionLayerId;
  if (!targetLayerId) return [];

  const resolved = new Set<string>([targetLayerId]);
  const targetLayer = layerById.get(targetLayerId);
  if (!targetLayer) return [...resolved];

  // 依赖转写层新建句段时，同时补父独立转写层的 canonical segment 投影 | When creating from a dependent transcription layer, also project to the parent independent transcription layer.
  if (targetLayer.layerType === 'transcription' && targetLayer.constraint === 'symbolic_association') {
    const parentLayerId = targetLayer.parentLayerId?.trim() ?? '';
    const parentLayer = parentLayerId ? layerById.get(parentLayerId) : undefined;
    if (parentLayer && parentLayer.layerType === 'transcription' && parentLayer.constraint === 'independent_boundary') {
      resolved.add(parentLayer.id);
    }
  }

  return [...resolved];
}

export type TranscriptionUtteranceActionsParams = {
  defaultTranscriptionLayerId: string | undefined;
  layerById: Map<string, LayerDocType>;
  selectedUtteranceMedia: MediaItemDocType | undefined;
  activeUtteranceUnitId: string;
  translations: UtteranceTextDocType[];
  utterancesRef: React.MutableRefObject<UtteranceDocType[]>;
  utterancesOnCurrentMediaRef: React.MutableRefObject<UtteranceDocType[]>;
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  timingGestureRef: React.MutableRefObject<{ active: boolean; utteranceId: string | null }>;
  timingUndoRef: React.MutableRefObject<TimingUndoState | null>;
  pushUndo: (label: string) => void;
  rollbackUndo?: () => Promise<void>;
  createAnchor: (db: Awaited<ReturnType<typeof getDb>>, mediaId: string, time: number) => Promise<AnchorDocType>;
  updateAnchorTime: (db: Awaited<ReturnType<typeof getDb>>, anchorId: string, newTime: number) => Promise<void>;
  pruneOrphanAnchors: (db: Awaited<ReturnType<typeof getDb>>, removedUtteranceIds: Set<string>) => Promise<void>;
  setSaveState: (s: SaveState) => void;
  setSnapGuide: React.Dispatch<React.SetStateAction<SnapGuide>>;
  setMediaItems: React.Dispatch<React.SetStateAction<MediaItemDocType[]>>;
  setTranslations: React.Dispatch<React.SetStateAction<UtteranceTextDocType[]>>;
  setUtterances: React.Dispatch<React.SetStateAction<UtteranceDocType[]>>;
  setUtteranceDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setSelectedUtteranceIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedTimelineUnit?: React.Dispatch<React.SetStateAction<TimelineUnit | null>>;
  allowOverlapInTranscription?: boolean;
};

export function useTranscriptionUtteranceActions({
  defaultTranscriptionLayerId,
  layerById,
  selectedUtteranceMedia,
  activeUtteranceUnitId,
  translations,
  utterancesRef,
  utterancesOnCurrentMediaRef,
  getUtteranceTextForLayer,
  timingGestureRef,
  timingUndoRef,
  pushUndo,
  rollbackUndo,
  createAnchor,
  updateAnchorTime,
  pruneOrphanAnchors,
  setSaveState,
  setSnapGuide,
  setMediaItems,
  setTranslations,
  setUtterances,
  setUtteranceDrafts,
  setSelectedUtteranceIds,
  setSelectedTimelineUnit,
  allowOverlapInTranscription = false,
}: TranscriptionUtteranceActionsParams) {
  const selectUtterancePrimary = useCallback((id: string) => {
    setSelectedUtteranceIds(id ? new Set([id]) : new Set());
    setSelectedTimelineUnit?.(id ? createTimelineUnit(defaultTranscriptionLayerId ?? '', id, 'utterance') : null);
  }, [defaultTranscriptionLayerId, setSelectedTimelineUnit, setSelectedUtteranceIds]);

  const clearSelection = useCallback(() => {
    setSelectedUtteranceIds(new Set());
    setSelectedTimelineUnit?.(null);
  }, [setSelectedTimelineUnit, setSelectedUtteranceIds]);

  const resolveUtteranceById = useCallback(async (db: Awaited<ReturnType<typeof getDb>>, utteranceId: string) => {
    const local = utterancesRef.current.find((item) => item.id === utteranceId);
    if (local) return local;
    const row = await db.collections.utterances.findOne({ selector: { id: utteranceId } }).exec();
    return (row?.toJSON() as UtteranceDocType | undefined) ?? null;
  }, [utterancesRef]);

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

    const translationId = newId('utr');
    const newTranslation: UtteranceTextDocType = {
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

    setMediaItems((prev) => [...prev, newMedia]);
    setTranslations((prev) => [...prev, newTranslation]);
    setSaveState({ kind: 'done', message: `录音翻译已保存 (${translationId})` });
  }, [setMediaItems, setSaveState, setTranslations]);

  const saveUtteranceText = useCallback(async (utteranceId: string, value: string, layerId?: string) => {
    const resolvedLayerId = layerId ?? defaultTranscriptionLayerId;
    const targetLayer = resolvedLayerId ? layerById.get(resolvedLayerId) : undefined;
    const isDefaultLayer = !targetLayer
      || (targetLayer.layerType === 'transcription'
        && (targetLayer.isDefault === true || targetLayer.id === defaultTranscriptionLayerId));

    pushUndo('编辑转写文本');
    const db = await getDb();
    const now = new Date().toISOString();
    const normalizedValue = value.trim();
    let shouldInvalidateEmbeddings = false;

    if (targetLayer) {
      const allTexts = await listUtteranceTextsByUtterance(db, utteranceId);
      const existing = allTexts
        .filter(
          (item) =>
            item.layerId === targetLayer.id
            && (item.modality === 'text' || item.modality === 'mixed'),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

      if (!normalizedValue) {
        if (existing) {
          await removeUtteranceTextFromSegmentationV2(db, existing);
          setTranslations((prev) => prev.filter((item) => item.id !== existing.id));
          shouldInvalidateEmbeddings = isDefaultLayer;
        }
      } else if (existing) {
        const didTextChange = (existing.text ?? '').trim() !== normalizedValue;
        const updatedTranslation: UtteranceTextDocType = {
          ...existing,
          text: normalizedValue,
          updatedAt: now,
        } as UtteranceTextDocType;
        const utterance = await resolveUtteranceById(db, utteranceId);
        if (utterance) {
          await syncUtteranceTextToSegmentationV2(db, utterance, updatedTranslation);
        }
        setTranslations((prev) => prev.map((item) => (item.id === existing.id ? updatedTranslation : item)));
        shouldInvalidateEmbeddings = isDefaultLayer && didTextChange;
      } else {
        const newTranslation: UtteranceTextDocType = {
          ...withUtteranceTextLayerId({
            id: newId('utr'),
            utteranceId,
            modality: 'text',
            text: normalizedValue,
            sourceType: 'human',
            createdAt: now,
            updatedAt: now,
          } as UtteranceTextWithoutLayerId, { layerId: targetLayer.id }),
        } as UtteranceTextDocType;
        const utterance = await resolveUtteranceById(db, utteranceId);
        if (utterance) {
          await syncUtteranceTextToSegmentationV2(db, utterance, newTranslation);
        }
        setTranslations((prev) => [...prev, newTranslation]);
        shouldInvalidateEmbeddings = isDefaultLayer;
      }
    }

    if (shouldInvalidateEmbeddings) {
      await invalidateUtteranceEmbeddings(db, [utteranceId]);
    }

    if (isDefaultLayer) {
      setUtteranceDrafts((prev) => ({ ...prev, [utteranceId]: value }));
    }

    setSaveState({ kind: 'done', message: '已更新转写文本' });
  }, [defaultTranscriptionLayerId, layerById, pushUndo, resolveUtteranceById, setSaveState, setTranslations, setUtteranceDrafts]);

  const saveUtteranceTiming = useCallback(async (utteranceId: string, startTime: number, endTime: number) => {
    const db = await getDb();
    const target = await db.collections.utterances.findOne({ selector: { id: utteranceId } }).exec();
    if (!target) {
      reportValidationError({
        message: '未找到目标句子，无法更新时间戳',
        i18nKey: 'transcription.error.validation.updateTimingTargetMissing',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const current = target.toJSON() as unknown as UtteranceDocType;
    const minSpan = 0.05;

    const allDocs = await db.collections.utterances.find().exec();
    const siblings = allDocs
      .map((doc) => doc.toJSON() as unknown as UtteranceDocType)
      .filter((item) => item.id !== utteranceId && item.mediaId === current.mediaId)
      .sort((a, b) => a.startTime - b.startTime);

    const proposed = { id: utteranceId, startTime, endTime };
    const timeline = [...siblings, proposed].sort((a, b) => a.startTime - b.startTime);
    const currentIndex = timeline.findIndex((item) => item.id === utteranceId);
    const prev = currentIndex > 0 ? timeline[currentIndex - 1] : undefined;
    const next = currentIndex >= 0 && currentIndex < timeline.length - 1 ? timeline[currentIndex + 1] : undefined;

    const gap = 0.02;
    const lowerBound = allowOverlapInTranscription ? 0 : (prev ? prev.endTime + gap : 0);
    const upperBound = allowOverlapInTranscription ? Number.POSITIVE_INFINITY : (next ? next.startTime - gap : Number.POSITIVE_INFINITY);

    setSnapGuide({ visible: false });

    if (Number.isFinite(upperBound) && upperBound - lowerBound < minSpan) {
      reportValidationError({
        message: '相邻区间过近，无法调整到有效长度。',
        i18nKey: 'transcription.error.validation.updateTimingNoValidSpan',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      setUtterances((prevRows) => [...prevRows]);
      return;
    }

    const boundedStart = Math.max(lowerBound, startTime);
    const maxAllowedStart = Number.isFinite(upperBound) ? upperBound - minSpan : Number.POSITIVE_INFINITY;
    const normalizedStart = Math.max(0, Math.min(boundedStart, maxAllowedStart, endTime - minSpan));
    const boundedEnd = Math.max(normalizedStart + minSpan, endTime);
    const normalizedEnd = Number.isFinite(upperBound) ? Math.min(boundedEnd, upperBound) : boundedEnd;

    const gesture = timingGestureRef.current;
    if (!(gesture.active && gesture.utteranceId === utteranceId)) {
      const undoDecision = shouldPushTimingUndo(
        timingUndoRef.current,
        utteranceId,
        Date.now(),
        500,
      );
      timingUndoRef.current = undoDecision.next;
      if (undoDecision.shouldPush) {
        pushUndo('调整时间区间');
      }
    }

    const updated: UtteranceDocType = {
      ...current,
      startTime: Number(normalizedStart.toFixed(3)),
      endTime: Number(normalizedEnd.toFixed(3)),
      updatedAt: new Date().toISOString(),
    };

    await LinguisticService.saveUtterance(updated);

    if (updated.startAnchorId && updated.startTime !== current.startTime) {
      await updateAnchorTime(db, updated.startAnchorId, updated.startTime);
    }
    if (updated.endAnchorId && updated.endTime !== current.endTime) {
      await updateAnchorTime(db, updated.endAnchorId, updated.endTime);
    }

    setUtterances((prev) => prev.map((item) => (item.id === utteranceId ? updated : item)));
    setSaveState({
      kind: 'done',
      message: `已更新时间区间 ${formatTime(updated.startTime)} - ${formatTime(updated.endTime)}`,
    });
  }, [allowOverlapInTranscription, pushUndo, setSaveState, setSnapGuide, setUtterances, timingGestureRef, timingUndoRef, updateAnchorTime]);

  const saveTextTranslationForUtterance = useCallback(async (utteranceId: string, value: string, layerId: string) => {
    if (!layerId) {
      reportValidationError({
        message: '请先选择翻译层',
        i18nKey: 'transcription.error.validation.translationLayerRequired',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const targetLayer = layerById.get(layerId);
    if (!targetLayer || targetLayer.layerType !== 'translation') {
      reportValidationError({
        message: '目标层不是翻译层，无法保存翻译文本',
        i18nKey: 'transcription.error.validation.translationLayerRequired',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const trimmed = value.trim();

    // 按 utteranceId 索引查询，避免全表扫描 | Query by utteranceId index to avoid full table scan
    const allTexts = await listUtteranceTextsByUtterance(db, utteranceId);
    const candidates = allTexts
      .filter(
        (item) =>
          item.layerId === layerId &&
          (item.modality === 'text' || item.modality === 'mixed'),
      );

    if (!trimmed) {
      const existing = candidates[0];
      if (existing) {
        pushUndo('清空翻译文本');
        await removeUtteranceTextFromSegmentationV2(db, existing);
        setTranslations((prev) => prev.filter((item) => item.id !== existing.id));
        setSaveState({ kind: 'done', message: '已清空翻译文本' });
      }
      return;
    }

    pushUndo('编辑翻译文本');
    const existing = [...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    if (existing) {
      const sanitizedExisting = stripSpeakerAssociationFromTranslationText(existing);
      const updatedTranslation: UtteranceTextDocType = {
        ...sanitizedExisting,
        text: trimmed,
        modality: sanitizedExisting.modality,
        updatedAt: now,
      } as UtteranceTextDocType;
      const utterance = await resolveUtteranceById(db, utteranceId);
      if (utterance) {
        await syncUtteranceTextToSegmentationV2(db, utterance, updatedTranslation);
      }
      setTranslations((prev) => prev.map((item) => (item.id === existing.id ? updatedTranslation : item)));
    } else {
      const newTranslation: UtteranceTextDocType = {
        ...withUtteranceTextLayerId({
          id: newId('utr'),
          utteranceId,
          modality: 'text',
          text: trimmed,
          sourceType: 'human',
          createdAt: now,
          updatedAt: now,
        } as UtteranceTextWithoutLayerId, { layerId }),
      } as UtteranceTextDocType;
      const utterance = await resolveUtteranceById(db, utteranceId);
      if (utterance) {
        await syncUtteranceTextToSegmentationV2(db, utterance, newTranslation);
      }
      setTranslations((prev) => [...prev, newTranslation]);
    }

    setSaveState({ kind: 'done', message: '已更新翻译文本' });
  }, [layerById, pushUndo, resolveUtteranceById, setSaveState, setTranslations]);

  const createNextUtterance = useCallback(async (base: UtteranceDocType, playerDuration: number) => {
    pushUndo('创建句段');
    const db = await getDb();
    const now = new Date().toISOString();

    const start = base.endTime;
    const fallbackEnd = start + 2;
    const end = playerDuration > 0 ? Math.min(playerDuration, fallbackEnd) : fallbackEnd;
    const finalEnd = end <= start ? start + 0.8 : end;

    const mediaId = base.mediaId ?? '';
    const startAnchor = await createAnchor(db, mediaId, start);
    const endAnchor = await createAnchor(db, mediaId, finalEnd);

    const createdId = newId('utt');
    const newUtterance: UtteranceDocType = {
      id: createdId,
      textId: base.textId,
      ...(base.mediaId ? { mediaId: base.mediaId } : {}),
      startTime: start,
      endTime: finalEnd,
      startAnchorId: startAnchor.id,
      endAnchorId: endAnchor.id,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    } as UtteranceDocType;
    await LinguisticService.saveUtterance(newUtterance);

    setUtterances((prev) => [...prev, newUtterance]);
    setUtteranceDrafts((prev) => ({ ...prev, [createdId]: '' }));
    selectUtterancePrimary(createdId);
    setSaveState({ kind: 'done', message: `已创建新区间 ${formatTime(start)} - ${formatTime(finalEnd)}` });
  }, [createAnchor, pushUndo, selectUtterancePrimary, setSaveState, setUtteranceDrafts, setUtterances]);

  const createUtteranceFromSelection = useCallback(async (start: number, end: number, options?: { speakerId?: string; focusedLayerId?: string }) => {
    const media = selectedUtteranceMedia;
    if (!media) {
      reportValidationError({
        message: '请先导入并选择音频。',
        i18nKey: 'transcription.error.validation.mediaRequired',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const minSpan = 0.05;
    const gap = 0.02;
    const rawStart = Math.max(0, Math.min(start, end));
    const rawEnd = Math.max(start, end);

    const siblings = utterancesRef.current
      .filter((item) => item.mediaId === media.id)
      .sort((a, b) => a.startTime - b.startTime);

    const insertionIndex = siblings.findIndex((item) => item.startTime > rawStart);
    const prev = insertionIndex < 0
      ? siblings[siblings.length - 1]
      : insertionIndex === 0
        ? undefined
        : siblings[insertionIndex - 1];
    const next = insertionIndex < 0 ? undefined : siblings[insertionIndex];

    const lowerBound = allowOverlapInTranscription ? 0 : Math.max(0, prev ? prev.endTime + gap : 0);
    const mediaDuration = typeof media.duration === 'number' ? media.duration : Number.POSITIVE_INFINITY;
    const upperFromNext = allowOverlapInTranscription
      ? Number.POSITIVE_INFINITY
      : (next ? next.startTime - gap : Number.POSITIVE_INFINITY);
    const upperBound = Math.min(mediaDuration, upperFromNext);

    const boundedStart = Math.max(lowerBound, rawStart);
    const normalizedEnd = Math.max(boundedStart + minSpan, rawEnd);
    const boundedEnd = Math.min(upperBound, normalizedEnd);

    if (!Number.isFinite(boundedEnd) || boundedEnd - boundedStart < minSpan) {
      reportValidationError({
        message: '选区与现有句段重叠，无法创建。请在空白区重新拖拽。',
        i18nKey: 'transcription.error.validation.createFromSelectionOverlap',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo('从选区创建句段');

    const db = await getDb();
    const now = new Date().toISOString();
    const finalStart = Number(boundedStart.toFixed(3));
    const finalEnd = Number(boundedEnd.toFixed(3));

    const startAnchor = await createAnchor(db, media.id, finalStart);
    const endAnchor = await createAnchor(db, media.id, finalEnd);

    const createdId = newId('utt');
    const newUtterance: UtteranceDocType = {
      id: createdId,
      textId: media.textId,
      mediaId: media.id,
      startTime: finalStart,
      endTime: finalEnd,
      startAnchorId: startAnchor.id,
      endAnchorId: endAnchor.id,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
      ...(options?.speakerId ? { speakerId: options.speakerId } : {}),
    } as UtteranceDocType;
    await LinguisticService.saveUtterance(newUtterance);

    // 为当前层补内容投影；若当前层是依赖转写层，同时补父独立转写层投影 | Project content for the current layer; if it is a dependent transcription layer, also project to the parent independent transcription layer.
    const projectionLayerIds = resolveProjectionLayerIdsForNewUtterance(
      layerById,
      defaultTranscriptionLayerId,
      options?.focusedLayerId,
    );
    if (projectionLayerIds.length > 0) {
      const projectedTexts: UtteranceTextDocType[] = [];
      for (const projectionLayerId of projectionLayerIds) {
        const emptyText: UtteranceTextDocType = {
          ...withUtteranceTextLayerId({
            id: newId('utr'),
            utteranceId: createdId,
            modality: 'text',
            text: '',
            sourceType: 'human',
            createdAt: now,
            updatedAt: now,
          } as UtteranceTextWithoutLayerId, { layerId: projectionLayerId }),
        } as UtteranceTextDocType;
        await syncUtteranceTextToSegmentationV2(db, newUtterance, emptyText);
        projectedTexts.push(emptyText);
      }
      setTranslations((prev) => [...prev, ...projectedTexts]);
    }

    setUtterances((prev) => [...prev, newUtterance]);
    setUtteranceDrafts((prev) => ({ ...prev, [createdId]: '' }));
    selectUtterancePrimary(createdId);
    setSaveState({ kind: 'done', message: `已新建句段 ${formatTime(finalStart)} - ${formatTime(finalEnd)}` });
  }, [allowOverlapInTranscription, createAnchor, defaultTranscriptionLayerId, pushUndo, selectedUtteranceMedia, selectUtterancePrimary, setSaveState, setTranslations, setUtteranceDrafts, setUtterances, utterancesRef]);

  const deleteUtterance = useCallback(async (utteranceId: string) => {
    const target = utterancesRef.current.find((u) => u.id === utteranceId);
    if (!target) {
      reportValidationError({
        message: '未找到目标句段',
        i18nKey: 'transcription.error.validation.deleteTargetMissing',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo('删除句段');
    await LinguisticService.removeUtterance(utteranceId);

    setUtterances((prev) => prev.filter((u) => u.id !== utteranceId));
    setTranslations((prev) => prev.filter((t) => t.utteranceId !== utteranceId));
    if (activeUtteranceUnitId === utteranceId) clearSelection();

    const db = await getDb();
    await pruneOrphanAnchors(db, new Set([utteranceId]));

    setSaveState({ kind: 'done', message: '已删除句段' });
  }, [activeUtteranceUnitId, clearSelection, pruneOrphanAnchors, pushUndo, setSaveState, setTranslations, setUtterances, utterancesRef]);

  const reassignTranslations = useCallback(async (
    survivorId: string,
    removedId: string,
    db: Awaited<ReturnType<typeof getDb>>,
    now: string,
  ) => {
    const removedTranslations = translations.filter((t) => t.utteranceId === removedId);
    const survivorTranslations = translations.filter((t) => t.utteranceId === survivorId);
    const newTranslations: UtteranceTextDocType[] = [];
    const updatedTranslations: UtteranceTextDocType[] = [];
    const survivorUtterance = await resolveUtteranceById(db, survivorId);

    for (const rt of removedTranslations) {
      const targetLayerId = rt.layerId;
      const match = survivorTranslations.find(
        (st) => st.layerId === targetLayerId && st.modality === rt.modality,
      );
      if (match && rt.text) {
        const merged: UtteranceTextDocType = {
          ...match,
          text: (match.text ?? '') + rt.text,
          updatedAt: now,
        } as UtteranceTextDocType;
        if (survivorUtterance) {
          await syncUtteranceTextToSegmentationV2(db, survivorUtterance, merged);
        }
        updatedTranslations.push(merged);
      } else if (!match) {
        const reassigned: UtteranceTextDocType = {
          ...rt,
          utteranceId: survivorId,
          updatedAt: now,
        } as UtteranceTextDocType;
        if (survivorUtterance) {
          await syncUtteranceTextToSegmentationV2(db, survivorUtterance, reassigned);
        }
        newTranslations.push(reassigned);
      }
    }

    await LinguisticService.removeUtterance(removedId);
    return { newTranslations, updatedTranslations };
  }, [resolveUtteranceById, translations]);

  const mergeWithPrevious = useCallback(async (utteranceId: string) => {
    const sorted = utterancesRef.current
      .filter((u) => u.mediaId === utterancesRef.current.find((t) => t.id === utteranceId)?.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((u) => u.id === utteranceId);
    if (idx <= 0) {
      reportValidationError({
        message: '没有前一句段可合并',
        i18nKey: 'transcription.error.validation.mergePreviousUnavailable',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const prev = sorted[idx - 1]!;
    const curr = sorted[idx]!;

    pushUndo('向前合并句段');
    const db = await getDb();
    const now = new Date().toISOString();
    const updated: UtteranceDocType = {
      ...prev,
      endTime: curr.endTime,
      endAnchorId: curr.endAnchorId ?? prev.endAnchorId,
      updatedAt: now,
    } as UtteranceDocType;
    await LinguisticService.saveUtterance(updated);

    const { newTranslations, updatedTranslations } = await reassignTranslations(prev.id, curr.id, db, now);

    setUtterances((p) => p.filter((u) => u.id !== curr.id).map((u) => (u.id === prev.id ? updated : u)));
    setTranslations((p) => {
      const updatedIds = new Set(updatedTranslations.map((t) => t.id));
      return [
        ...p.filter((t) => t.utteranceId !== curr.id && !updatedIds.has(t.id)),
        ...updatedTranslations,
        ...newTranslations,
      ];
    });
    selectUtterancePrimary(prev.id);
    await pruneOrphanAnchors(db, new Set([curr.id]));
    setSaveState({ kind: 'done', message: `已向前合并 ${formatTime(updated.startTime)} - ${formatTime(updated.endTime)}` });
  }, [pruneOrphanAnchors, pushUndo, reassignTranslations, selectUtterancePrimary, setSaveState, setTranslations, setUtterances, utterancesRef]);

  const mergeWithNext = useCallback(async (utteranceId: string) => {
    const sorted = utterancesRef.current
      .filter((u) => u.mediaId === utterancesRef.current.find((t) => t.id === utteranceId)?.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((u) => u.id === utteranceId);
    if (idx < 0 || idx >= sorted.length - 1) {
      reportValidationError({
        message: '没有后一句段可合并',
        i18nKey: 'transcription.error.validation.mergeNextUnavailable',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const curr = sorted[idx]!;
    const next = sorted[idx + 1]!;

    pushUndo('向后合并句段');
    const db = await getDb();
    const now = new Date().toISOString();
    const updated: UtteranceDocType = {
      ...curr,
      endTime: next.endTime,
      endAnchorId: next.endAnchorId ?? curr.endAnchorId,
      updatedAt: now,
    } as UtteranceDocType;
    await LinguisticService.saveUtterance(updated);

    const { newTranslations, updatedTranslations } = await reassignTranslations(curr.id, next.id, db, now);

    setUtterances((p) => p.filter((u) => u.id !== next.id).map((u) => (u.id === curr.id ? updated : u)));
    setTranslations((p) => {
      const updatedIds = new Set(updatedTranslations.map((t) => t.id));
      return [
        ...p.filter((t) => t.utteranceId !== next.id && !updatedIds.has(t.id)),
        ...updatedTranslations,
        ...newTranslations,
      ];
    });
    selectUtterancePrimary(curr.id);
    await pruneOrphanAnchors(db, new Set([next.id]));
    setSaveState({ kind: 'done', message: `已向后合并 ${formatTime(updated.startTime)} - ${formatTime(updated.endTime)}` });
  }, [pruneOrphanAnchors, pushUndo, reassignTranslations, selectUtterancePrimary, setSaveState, setTranslations, setUtterances, utterancesRef]);

  const splitUtterance = useCallback(async (utteranceId: string, splitTime: number) => {
    const target = utterancesRef.current.find((u) => u.id === utteranceId);
    if (!target) {
      reportValidationError({
        message: '未找到目标句段',
        i18nKey: 'transcription.error.validation.splitTargetMissing',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const minSpan = 0.05;
    if (splitTime - target.startTime < minSpan || target.endTime - splitTime < minSpan) {
      reportValidationError({
        message: '拆分点过于接近句段边界',
        i18nKey: 'transcription.error.validation.splitPointTooClose',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo('拆分句段');
    const db = await getDb();
    const now = new Date().toISOString();
    const text = getUtteranceTextForLayer(target);
    const splitTimeFixed = Number(splitTime.toFixed(3));
    const splitAnchor = await createAnchor(db, target.mediaId ?? '', splitTimeFixed);

    const updatedFirst: UtteranceDocType = {
      ...target,
      endTime: splitTimeFixed,
      endAnchorId: splitAnchor.id,
      updatedAt: now,
    };
    await LinguisticService.saveUtterance(updatedFirst);

    const secondStartAnchor = await createAnchor(db, target.mediaId ?? '', splitTimeFixed);
    const secondId = newId('utt');
    const secondHalf: UtteranceDocType = {
      ...target,
      id: secondId,
      startTime: splitTimeFixed,
      endTime: target.endTime,
      startAnchorId: secondStartAnchor.id,
      endAnchorId: target.endAnchorId,
      annotationStatus: 'raw',
      createdAt: now,
      updatedAt: now,
    } as UtteranceDocType;
    await LinguisticService.saveUtterance(secondHalf);

    const origTranslations = translations.filter((t) => t.utteranceId === utteranceId);
    const copiedTranslations: UtteranceTextDocType[] = [];
    for (const ot of origTranslations) {
      const copy: UtteranceTextDocType = {
        ...ot,
        id: newId('utr'),
        utteranceId: secondId,
        createdAt: now,
        updatedAt: now,
      } as UtteranceTextDocType;
      await syncUtteranceTextToSegmentationV2(db, secondHalf, copy);
      copiedTranslations.push(copy);
    }

    setUtterances((prev) => [
      ...prev.map((u) => (u.id === utteranceId ? updatedFirst : u)),
      secondHalf,
    ]);
    setTranslations((prev) => [...prev, ...copiedTranslations]);
    setUtteranceDrafts((prev) => ({ ...prev, [utteranceId]: text, [secondId]: text }));
    selectUtterancePrimary(secondId);
    setSaveState({ kind: 'done', message: `已拆分为 ${formatTime(updatedFirst.startTime)}-${formatTime(updatedFirst.endTime)} 和 ${formatTime(secondHalf.startTime)}-${formatTime(secondHalf.endTime)}` });
  }, [createAnchor, getUtteranceTextForLayer, pushUndo, selectUtterancePrimary, setSaveState, setTranslations, setUtteranceDrafts, setUtterances, translations, utterancesRef]);

  const deleteSelectedUtterances = useCallback(async (ids: Set<string>) => {
    const targets = utterancesRef.current.filter((u) => ids.has(u.id));
    if (targets.length === 0) return;

    pushUndo('批量删除句段');
    const idsToDelete = targets.map((u) => u.id);
    await LinguisticService.removeUtterancesBatch(idsToDelete);

    const idsToDeleteSet = new Set(idsToDelete);
    setUtterances((prev) => prev.filter((u) => !idsToDeleteSet.has(u.id)));
    setTranslations((prev) => prev.filter((t) => !idsToDeleteSet.has(t.utteranceId)));
    clearSelection();

    const dbInst = await getDb();
    await pruneOrphanAnchors(dbInst, idsToDeleteSet);
    setSaveState({ kind: 'done', message: `已删除 ${targets.length} 个句段` });
  }, [clearSelection, pruneOrphanAnchors, pushUndo, setSaveState, setTranslations, setUtterances, utterancesRef]);

  const offsetSelectedTimes = useCallback(async (ids: Set<string>, deltaSec: number) => {
    const targets = utterancesOnCurrentMediaRef.current
      .filter((u) => ids.has(u.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (targets.length === 0) return;
    if (!Number.isFinite(deltaSec) || Math.abs(deltaSec) < 0.0005) return;

    const minSpan = 0.05;
    const gap = 0.02;
    const transformed = new Map<string, { startTime: number; endTime: number }>();
    for (const u of targets) {
      const startTime = Number((u.startTime + deltaSec).toFixed(3));
      const endTime = Number((u.endTime + deltaSec).toFixed(3));
      if (startTime < 0 || endTime - startTime < minSpan) {
        reportValidationError({
          message: '时间偏移后出现负时间或句段过短，操作已取消。',
          i18nKey: 'transcription.error.validation.offsetInvalidRange',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
        return;
      }
      transformed.set(u.id, { startTime, endTime });
    }

    if (!allowOverlapInTranscription) {
      const timeline = utterancesOnCurrentMediaRef.current
        .map((u) => {
          const next = transformed.get(u.id);
          return next ? { ...u, ...next } : u;
        })
        .sort((a, b) => a.startTime - b.startTime);
      for (let i = 1; i < timeline.length; i++) {
        if (timeline[i]!.startTime < timeline[i - 1]!.endTime + gap) {
          reportValidationError({
            message: '时间偏移会造成句段重叠，操作已取消。',
            i18nKey: 'transcription.error.validation.offsetOverlap',
            setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          });
          return;
        }
      }
    }

    pushUndo('批量时间偏移');
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const updatedRows = targets.map((u) => {
        const next = transformed.get(u.id)!;
        return {
          ...u,
          startTime: next.startTime,
          endTime: next.endTime,
          updatedAt: now,
        } as UtteranceDocType;
      });
      await LinguisticService.saveUtterancesBatch(updatedRows);

      await Promise.all(updatedRows.map(async (u) => {
        if (u.startAnchorId) await updateAnchorTime(db, u.startAnchorId, u.startTime);
        if (u.endAnchorId) await updateAnchorTime(db, u.endAnchorId, u.endTime);
      }));

      const byId = new Map(updatedRows.map((row) => [row.id, row]));
      setUtterances((prev) => prev.map((u) => byId.get(u.id) ?? u));
      setSaveState({ kind: 'done', message: `已偏移 ${updatedRows.length} 个句段（${deltaSec >= 0 ? '+' : ''}${deltaSec.toFixed(3)}s）` });
    } catch (error) {
      if (rollbackUndo) {
        try {
          await rollbackUndo();
        } catch (rollbackError) {
          log.warn('Rollback after offsetSelectedTimes failure also failed', {
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }
      const message = error instanceof Error ? error.message : '未知错误';
      log.error('offsetSelectedTimes failed', {
        targetCount: targets.length,
        deltaSec,
        error: message,
      });
      reportActionError({
        actionLabel: '批量时间偏移',
        error,
        i18nKey: 'transcription.error.action.offsetBatchFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        fallbackMessage: formatRollbackFailureMessage('批量时间偏移', error),
      });
    }
  }, [allowOverlapInTranscription, pushUndo, rollbackUndo, setSaveState, setUtterances, updateAnchorTime, utterancesOnCurrentMediaRef]);

  const scaleSelectedTimes = useCallback(async (ids: Set<string>, factor: number, anchorTime?: number) => {
    const targets = utterancesOnCurrentMediaRef.current
      .filter((u) => ids.has(u.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (targets.length === 0) return;
    if (!Number.isFinite(factor) || factor <= 0) {
      reportValidationError({
        message: '缩放系数必须大于 0。',
        i18nKey: 'transcription.error.validation.scaleFactorInvalid',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const pivot = Number.isFinite(anchorTime ?? NaN)
      ? Number(anchorTime)
      : targets[0]!.startTime;
    const minSpan = 0.05;
    const gap = 0.02;
    const transformed = new Map<string, { startTime: number; endTime: number }>();
    for (const u of targets) {
      const startTime = Number((pivot + (u.startTime - pivot) * factor).toFixed(3));
      const endTime = Number((pivot + (u.endTime - pivot) * factor).toFixed(3));
      if (startTime < 0 || endTime - startTime < minSpan) {
        reportValidationError({
          message: '缩放后出现负时间或句段过短，操作已取消。',
          i18nKey: 'transcription.error.validation.scaleInvalidRange',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
        return;
      }
      transformed.set(u.id, { startTime, endTime });
    }

    if (!allowOverlapInTranscription) {
      const timeline = utterancesOnCurrentMediaRef.current
        .map((u) => {
          const next = transformed.get(u.id);
          return next ? { ...u, ...next } : u;
        })
        .sort((a, b) => a.startTime - b.startTime);
      for (let i = 1; i < timeline.length; i++) {
        if (timeline[i]!.startTime < timeline[i - 1]!.endTime + gap) {
          reportValidationError({
            message: '时间缩放会造成句段重叠，操作已取消。',
            i18nKey: 'transcription.error.validation.scaleOverlap',
            setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          });
          return;
        }
      }
    }

    pushUndo('批量时间缩放');
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const updatedRows = targets.map((u) => {
        const next = transformed.get(u.id)!;
        return {
          ...u,
          startTime: next.startTime,
          endTime: next.endTime,
          updatedAt: now,
        } as UtteranceDocType;
      });
      await LinguisticService.saveUtterancesBatch(updatedRows);

      await Promise.all(updatedRows.map(async (u) => {
        if (u.startAnchorId) await updateAnchorTime(db, u.startAnchorId, u.startTime);
        if (u.endAnchorId) await updateAnchorTime(db, u.endAnchorId, u.endTime);
      }));

      const byId = new Map(updatedRows.map((row) => [row.id, row]));
      setUtterances((prev) => prev.map((u) => byId.get(u.id) ?? u));
      setSaveState({ kind: 'done', message: `已缩放 ${updatedRows.length} 个句段（x${factor.toFixed(3)}）` });
    } catch (error) {
      if (rollbackUndo) {
        try {
          await rollbackUndo();
        } catch (rollbackError) {
          log.warn('Rollback after scaleSelectedTimes failure also failed', {
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }
      const message = error instanceof Error ? error.message : '未知错误';
      log.error('scaleSelectedTimes failed', {
        targetCount: targets.length,
        factor,
        ...(anchorTime !== undefined && { anchorTime }),
        error: message,
      });
      reportActionError({
        actionLabel: '批量时间缩放',
        error,
        i18nKey: 'transcription.error.action.scaleBatchFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        fallbackMessage: formatRollbackFailureMessage('批量时间缩放', error),
      });
    }
  }, [allowOverlapInTranscription, pushUndo, rollbackUndo, setSaveState, setUtterances, updateAnchorTime, utterancesOnCurrentMediaRef]);

  const splitByRegex = useCallback(async (ids: Set<string>, pattern: string, flags = '') => {
    const rawPattern = pattern.trim();
    if (!rawPattern) {
      reportValidationError({
        message: '正则表达式不能为空。',
        i18nKey: 'transcription.error.validation.regexPatternRequired',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const normalizedFlags = [...new Set(`${flags}g`.split(''))].join('');
    let splitter: RegExp;
    try {
      splitter = new RegExp(rawPattern, normalizedFlags);
    } catch (err) {
      console.error('[Jieyu] useTranscriptionUtteranceActions: regex compilation failed', { rawPattern, flags, err });
      reportValidationError({
        message: '正则表达式无效。',
        i18nKey: 'transcription.error.validation.regexPatternInvalid',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const targets = utterancesOnCurrentMediaRef.current
      .filter((u) => ids.has(u.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (targets.length === 0) return;

    const minSpan = 0.05;
    const db = await getDb();
    const now = new Date().toISOString();
    const updates: UtteranceDocType[] = [];
    const inserts: UtteranceDocType[] = [];
    const copiedTranslations: UtteranceTextDocType[] = [];
    const nextDraftEntries: Record<string, string> = {};

    for (const target of targets) {
      if (!target.mediaId) continue;

      const fullText = (getUtteranceTextForLayer(target) || '').trim();
      if (!fullText) continue;
      const segments = fullText
        .split(splitter)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      if (segments.length < 2) continue;

      const totalChars = Math.max(1, segments.reduce((sum, part) => sum + part.length, 0));
      const duration = target.endTime - target.startTime;
      const bounds: Array<{ start: number; end: number }> = [];
      let cursor = target.startTime;
      for (let i = 0; i < segments.length; i++) {
        if (i === segments.length - 1) {
          bounds.push({ start: cursor, end: target.endTime });
          break;
        }
        const ratio = segments[i]!.length / totalChars;
        const segDuration = Math.max(minSpan, Number((duration * ratio).toFixed(3)));
        const next = Number((cursor + segDuration).toFixed(3));
        bounds.push({ start: cursor, end: next });
        cursor = next;
      }

      if (bounds.some((item) => item.end - item.start < minSpan)) {
        continue;
      }

      const first = bounds[0]!;
      const updatedFirst: UtteranceDocType = {
        ...target,
        startTime: Number(first.start.toFixed(3)),
        endTime: Number(first.end.toFixed(3)),
        updatedAt: now,
      } as UtteranceDocType;
      updates.push(updatedFirst);
      nextDraftEntries[target.id] = segments[0]!;

      let prevEndAnchorId = updatedFirst.endAnchorId;
      for (let i = 1; i < bounds.length; i++) {
        const bound = bounds[i]!;
        const id = newId('utt');
        let startAnchorId = prevEndAnchorId;
        let endAnchorId = target.endAnchorId;
        if (i < bounds.length - 1) {
          const splitAnchor = await createAnchor(db, target.mediaId, Number(bound.end.toFixed(3)));
          endAnchorId = splitAnchor.id;
          prevEndAnchorId = splitAnchor.id;
        }
        const nextUtterance: UtteranceDocType = {
          ...target,
          id,
          startTime: Number(bound.start.toFixed(3)),
          endTime: Number(bound.end.toFixed(3)),
          startAnchorId,
          endAnchorId,
          annotationStatus: 'raw',
          createdAt: now,
          updatedAt: now,
        } as UtteranceDocType;
        inserts.push(nextUtterance);
        nextDraftEntries[id] = segments[i]!;

        const origTranslations = translations.filter((t) => t.utteranceId === target.id);
        for (const ot of origTranslations) {
          const copy: UtteranceTextDocType = {
            ...ot,
            id: newId('utr'),
            utteranceId: id,
            createdAt: now,
            updatedAt: now,
          } as UtteranceTextDocType;
          await syncUtteranceTextToSegmentationV2(db, nextUtterance, copy);
          copiedTranslations.push(copy);
        }
      }
    }

    if (updates.length === 0 && inserts.length === 0) {
      reportValidationError({
        message: '没有匹配到可拆分内容（请检查正则和选中文本）。',
        i18nKey: 'transcription.error.validation.regexNoSplitCandidates',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo('正则批量拆分句段');
    try {
      await LinguisticService.saveUtterancesBatch([...updates, ...inserts]);
      const updateMap = new Map(updates.map((u) => [u.id, u]));
      setUtterances((prev) => [
        ...prev.map((u) => updateMap.get(u.id) ?? u),
        ...inserts,
      ]);
      setTranslations((prev) => [...prev, ...copiedTranslations]);
      setUtteranceDrafts((prev) => ({ ...prev, ...nextDraftEntries }));
      if (inserts.length > 0) {
        selectUtterancePrimary(inserts[0]!.id);
      }
      setSaveState({ kind: 'done', message: `已按正则拆分 ${updates.length + inserts.length} 个句段片段。` });
    } catch (error) {
      if (rollbackUndo) {
        try {
          await rollbackUndo();
        } catch (rollbackError) {
          log.warn('Rollback after splitByRegex failure also failed', {
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }
      const message = error instanceof Error ? error.message : '未知错误';
      log.error('splitByRegex failed', {
        targetCount: targets.length,
        pattern: rawPattern,
        flags: normalizedFlags,
        error: message,
      });
      reportActionError({
        actionLabel: '正则批量拆分',
        error,
        i18nKey: 'transcription.error.action.regexSplitBatchFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        fallbackMessage: formatRollbackFailureMessage('正则批量拆分', error),
      });
    }
  }, [createAnchor, getUtteranceTextForLayer, pushUndo, rollbackUndo, selectUtterancePrimary, setSaveState, setTranslations, setUtteranceDrafts, setUtterances, translations, utterancesOnCurrentMediaRef]);

  const mergeSelectedUtterances = useCallback(async (ids: Set<string>) => {
    const sorted = utterancesOnCurrentMediaRef.current
      .filter((u) => ids.has(u.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (sorted.length < 2) {
      reportValidationError({
        message: '至少需要选中 2 个句段才能合并',
        i18nKey: 'transcription.error.validation.mergeSelectionRequireAtLeastTwo',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo('批量合并句段');
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;

      const updated: UtteranceDocType = {
        ...first,
        endTime: last.endTime,
        endAnchorId: last.endAnchorId ?? first.endAnchorId,
        updatedAt: now,
      } as UtteranceDocType;
      await LinguisticService.saveUtterance(updated);

      const toRemove = sorted.slice(1);
      let allNewTranslations: UtteranceTextDocType[] = [];
      let allUpdatedTranslations: UtteranceTextDocType[] = [];
      for (const u of toRemove) {
        const { newTranslations, updatedTranslations } = await reassignTranslations(first.id, u.id, db, now);
        allNewTranslations = [...allNewTranslations, ...newTranslations];
        allUpdatedTranslations = [...allUpdatedTranslations, ...updatedTranslations];
      }

      const removeIds = new Set(toRemove.map((u) => u.id));
      const updatedIds = new Set(allUpdatedTranslations.map((t) => t.id));
      setUtterances((prev) =>
        prev.filter((u) => !removeIds.has(u.id)).map((u) => (u.id === first.id ? updated : u)),
      );
      setTranslations((prev) => [
        ...prev.filter((t) => !removeIds.has(t.utteranceId) && !updatedIds.has(t.id)),
        ...allUpdatedTranslations,
        ...allNewTranslations,
      ]);
      selectUtterancePrimary(first.id);

      await pruneOrphanAnchors(db, removeIds);
      setSaveState({ kind: 'done', message: `已合并 ${sorted.length} 个句段 ${formatTime(updated.startTime)} - ${formatTime(updated.endTime)}` });
    } catch (error) {
      if (rollbackUndo) {
        try {
          await rollbackUndo();
        } catch (rollbackError) {
          log.warn('Rollback after mergeSelectedUtterances failure also failed', {
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }
      const message = error instanceof Error ? error.message : '未知错误';
      log.error('mergeSelectedUtterances failed', {
        targetCount: sorted.length,
        error: message,
      });
      reportActionError({
        actionLabel: '批量合并',
        error,
        i18nKey: 'transcription.error.action.mergeSelectionFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        fallbackMessage: formatRollbackFailureMessage('批量合并', error),
      });
    }
  }, [pruneOrphanAnchors, pushUndo, reassignTranslations, rollbackUndo, selectUtterancePrimary, setSaveState, setTranslations, setUtterances, utterancesOnCurrentMediaRef]);

  return {
    saveVoiceTranslation,
    saveUtteranceText,
    saveUtteranceTiming,
    saveTextTranslationForUtterance,
    createNextUtterance,
    createUtteranceFromSelection,
    deleteUtterance,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    deleteSelectedUtterances,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUtterances,
  };
}
