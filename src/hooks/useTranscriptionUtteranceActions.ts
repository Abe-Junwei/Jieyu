import { useCallback } from 'react';
import { getDb } from '../../db';
import type {
  AnchorDocType,
  MediaItemDocType,
  TranslationLayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { newId, formatTime } from '../utils/transcriptionFormatters';
import { shouldPushTimingUndo, type TimingUndoState } from '../utils/selectionUtils';
import { normalizeUtteranceTextDocForStorage } from '../utils/camDataUtils';
import type { SaveState, SnapGuide } from './transcriptionTypes';

export type TranscriptionUtteranceActionsParams = {
  defaultTranscriptionLayerId: string | undefined;
  layerById: Map<string, TranslationLayerDocType>;
  selectedUtteranceMedia: MediaItemDocType | undefined;
  selectedUtteranceId: string;
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
  setSelectedUtteranceId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedUtteranceIds: React.Dispatch<React.SetStateAction<Set<string>>>;
};

export function useTranscriptionUtteranceActions({
  defaultTranscriptionLayerId,
  layerById,
  selectedUtteranceMedia,
  selectedUtteranceId,
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
  setSelectedUtteranceId,
  setSelectedUtteranceIds,
}: TranscriptionUtteranceActionsParams) {
  const saveVoiceTranslation = useCallback(async (
    blob: Blob,
    targetUtterance: UtteranceDocType,
    targetLayer: TranslationLayerDocType,
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
      id: translationId,
      utteranceId: targetUtterance.id,
      tierId: targetLayer.id,
      modality: 'audio',
      translationAudioMediaId: mediaId,
      sourceType: 'human',
      createdAt: now,
      updatedAt: now,
    } as UtteranceTextDocType;
    await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(newTranslation));

    setMediaItems((prev) => [...prev, newMedia]);
    setTranslations((prev) => [...prev, newTranslation]);
    setSaveState({ kind: 'done', message: `录音翻译已保存 (${translationId})` });
  }, [setMediaItems, setSaveState, setTranslations]);

  const saveUtteranceText = useCallback(async (utteranceId: string, value: string, layerId?: string) => {
    const resolvedLayerId = layerId ?? defaultTranscriptionLayerId;
    const targetLayer = resolvedLayerId ? layerById.get(resolvedLayerId) : undefined;

    pushUndo('编辑转写文本');
    const db = await getDb();
    const now = new Date().toISOString();
    const normalizedValue = value.trim();

    if (targetLayer) {
      const matchingDocs = await db.collections.utterance_texts.findByIndex('utteranceId', utteranceId);
      const existing = matchingDocs
        .map((doc) => doc.toJSON() as unknown as UtteranceTextDocType)
        .filter(
          (item) =>
            item.tierId === targetLayer.id
            && (item.modality === 'text' || item.modality === 'mixed'),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

      if (!normalizedValue) {
        if (existing) {
          await db.collections.utterance_texts.remove(existing.id);
          setTranslations((prev) => prev.filter((item) => item.id !== existing.id));
        }
      } else if (existing) {
        const updatedTranslation: UtteranceTextDocType = {
          ...existing,
          text: normalizedValue,
          updatedAt: now,
        } as UtteranceTextDocType;
        await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(updatedTranslation));
        setTranslations((prev) => prev.map((item) => (item.id === existing.id ? updatedTranslation : item)));
      } else {
        const newTranslation: UtteranceTextDocType = {
          id: newId('utr'),
          utteranceId,
          tierId: targetLayer.id,
          modality: 'text',
          text: normalizedValue,
          sourceType: 'human',
          createdAt: now,
          updatedAt: now,
        } as UtteranceTextDocType;
        await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(newTranslation));
        setTranslations((prev) => [...prev, newTranslation]);
      }
    }

    const isDefaultLayer = !targetLayer
      || (targetLayer.layerType === 'transcription'
        && (targetLayer.isDefault === true || targetLayer.id === defaultTranscriptionLayerId));
    if (isDefaultLayer) {
      setUtteranceDrafts((prev) => ({ ...prev, [utteranceId]: value }));
    }

    setSaveState({ kind: 'done', message: '已更新转写文本' });
  }, [defaultTranscriptionLayerId, layerById, pushUndo, setSaveState, setTranslations, setUtteranceDrafts]);

  const saveUtteranceTiming = useCallback(async (utteranceId: string, startTime: number, endTime: number) => {
    const db = await getDb();
    const target = await db.collections.utterances.findOne({ selector: { id: utteranceId } }).exec();
    if (!target) {
      setSaveState({ kind: 'error', message: '未找到目标句子，无法更新时间戳' });
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
    const lowerBound = prev ? prev.endTime + gap : 0;
    const upperBound = next ? next.startTime - gap : Number.POSITIVE_INFINITY;

    setSnapGuide({ visible: false });

    if (Number.isFinite(upperBound) && upperBound - lowerBound < minSpan) {
      setSaveState({ kind: 'error', message: '相邻区间过近，无法调整到有效长度。' });
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
  }, [pushUndo, setSaveState, setSnapGuide, setUtterances, timingGestureRef, timingUndoRef, updateAnchorTime]);

  const saveTextTranslationForUtterance = useCallback(async (utteranceId: string, value: string, layerId: string) => {
    if (!layerId) {
      setSaveState({ kind: 'error', message: '请先选择翻译层' });
      return;
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const trimmed = value.trim();

    // 按 utteranceId 索引查询，避免全表扫描 | Query by utteranceId index to avoid full table scan
    const utteranceDocs = await db.collections.utterance_texts.findByIndex('utteranceId', utteranceId);
    const candidates = utteranceDocs
      .map((doc) => doc.toJSON() as unknown as UtteranceTextDocType)
      .filter(
        (item) =>
          item.tierId === layerId &&
          (item.modality === 'text' || item.modality === 'mixed'),
      );

    if (!trimmed) {
      const existing = candidates[0];
      if (existing) {
        pushUndo('清空翻译文本');
        await db.collections.utterance_texts.remove(existing.id);
        setTranslations((prev) => prev.filter((item) => item.id !== existing.id));
        setSaveState({ kind: 'done', message: '已清空翻译文本' });
      }
      return;
    }

    pushUndo('编辑翻译文本');
    const existing = [...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    if (existing) {
      const updatedTranslation: UtteranceTextDocType = {
        ...existing,
        text: trimmed,
        modality: existing.modality,
        updatedAt: now,
      } as UtteranceTextDocType;
      await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(updatedTranslation));
      setTranslations((prev) => prev.map((item) => (item.id === existing.id ? updatedTranslation : item)));
    } else {
      const newTranslation: UtteranceTextDocType = {
        id: newId('utr'),
        utteranceId,
        tierId: layerId,
        modality: 'text',
        text: trimmed,
        sourceType: 'human',
        createdAt: now,
        updatedAt: now,
      } as UtteranceTextDocType;
      await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(newTranslation));
      setTranslations((prev) => [...prev, newTranslation]);
    }

    setSaveState({ kind: 'done', message: '已更新翻译文本' });
  }, [pushUndo, setSaveState, setTranslations]);

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
    setSelectedUtteranceId(createdId);
    setSaveState({ kind: 'done', message: `已创建新区间 ${formatTime(start)} - ${formatTime(finalEnd)}` });
  }, [createAnchor, pushUndo, setSaveState, setSelectedUtteranceId, setUtteranceDrafts, setUtterances]);

  const createUtteranceFromSelection = useCallback(async (start: number, end: number) => {
    const media = selectedUtteranceMedia;
    if (!media) {
      setSaveState({ kind: 'error', message: '请先导入并选择音频。' });
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

    const lowerBound = Math.max(0, prev ? prev.endTime + gap : 0);
    const mediaDuration = typeof media.duration === 'number' ? media.duration : Number.POSITIVE_INFINITY;
    const upperFromNext = next ? next.startTime - gap : Number.POSITIVE_INFINITY;
    const upperBound = Math.min(mediaDuration, upperFromNext);

    const boundedStart = Math.max(lowerBound, rawStart);
    const normalizedEnd = Math.max(boundedStart + minSpan, rawEnd);
    const boundedEnd = Math.min(upperBound, normalizedEnd);

    if (!Number.isFinite(boundedEnd) || boundedEnd - boundedStart < minSpan) {
      setSaveState({ kind: 'error', message: '选区与现有句段重叠，无法创建。请在空白区重新拖拽。' });
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
    } as UtteranceDocType;
    await LinguisticService.saveUtterance(newUtterance);

    setUtterances((prev) => [...prev, newUtterance]);
    setUtteranceDrafts((prev) => ({ ...prev, [createdId]: '' }));
    setSelectedUtteranceId(createdId);
    setSaveState({ kind: 'done', message: `已新建句段 ${formatTime(finalStart)} - ${formatTime(finalEnd)}` });
  }, [createAnchor, pushUndo, selectedUtteranceMedia, setSaveState, setSelectedUtteranceId, setUtteranceDrafts, setUtterances, utterancesRef]);

  const deleteUtterance = useCallback(async (utteranceId: string) => {
    const target = utterancesRef.current.find((u) => u.id === utteranceId);
    if (!target) {
      setSaveState({ kind: 'error', message: '未找到目标句段' });
      return;
    }

    pushUndo('删除句段');
    await LinguisticService.removeUtterance(utteranceId);

    setUtterances((prev) => prev.filter((u) => u.id !== utteranceId));
    setTranslations((prev) => prev.filter((t) => t.utteranceId !== utteranceId));
    if (selectedUtteranceId === utteranceId) setSelectedUtteranceId('');

    const db = await getDb();
    await pruneOrphanAnchors(db, new Set([utteranceId]));

    setSaveState({ kind: 'done', message: '已删除句段' });
  }, [pruneOrphanAnchors, pushUndo, selectedUtteranceId, setSaveState, setSelectedUtteranceId, setTranslations, setUtterances, utterancesRef]);

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

    for (const rt of removedTranslations) {
      const match = survivorTranslations.find(
        (st) => st.tierId === rt.tierId && st.modality === rt.modality,
      );
      if (match && rt.text) {
        const merged: UtteranceTextDocType = {
          ...match,
          text: (match.text ?? '') + rt.text,
          updatedAt: now,
        } as UtteranceTextDocType;
        await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(merged));
        updatedTranslations.push(merged);
      } else if (!match) {
        const reassigned: UtteranceTextDocType = {
          ...rt,
          utteranceId: survivorId,
          updatedAt: now,
        } as UtteranceTextDocType;
        await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(reassigned));
        newTranslations.push(reassigned);
      }
    }

    await LinguisticService.removeUtterance(removedId);
    return { newTranslations, updatedTranslations };
  }, [translations]);

  const mergeWithPrevious = useCallback(async (utteranceId: string) => {
    const sorted = utterancesRef.current
      .filter((u) => u.mediaId === utterancesRef.current.find((t) => t.id === utteranceId)?.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((u) => u.id === utteranceId);
    if (idx <= 0) {
      setSaveState({ kind: 'error', message: '没有前一句段可合并' });
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
    setSelectedUtteranceId(prev.id);
    await pruneOrphanAnchors(db, new Set([curr.id]));
    setSaveState({ kind: 'done', message: `已向前合并 ${formatTime(updated.startTime)} - ${formatTime(updated.endTime)}` });
  }, [pruneOrphanAnchors, pushUndo, reassignTranslations, setSaveState, setSelectedUtteranceId, setTranslations, setUtterances, utterancesRef]);

  const mergeWithNext = useCallback(async (utteranceId: string) => {
    const sorted = utterancesRef.current
      .filter((u) => u.mediaId === utterancesRef.current.find((t) => t.id === utteranceId)?.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((u) => u.id === utteranceId);
    if (idx < 0 || idx >= sorted.length - 1) {
      setSaveState({ kind: 'error', message: '没有后一句段可合并' });
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
    setSelectedUtteranceId(curr.id);
    await pruneOrphanAnchors(db, new Set([next.id]));
    setSaveState({ kind: 'done', message: `已向后合并 ${formatTime(updated.startTime)} - ${formatTime(updated.endTime)}` });
  }, [pruneOrphanAnchors, pushUndo, reassignTranslations, setSaveState, setSelectedUtteranceId, setTranslations, setUtterances, utterancesRef]);

  const splitUtterance = useCallback(async (utteranceId: string, splitTime: number) => {
    const target = utterancesRef.current.find((u) => u.id === utteranceId);
    if (!target) {
      setSaveState({ kind: 'error', message: '未找到目标句段' });
      return;
    }
    const minSpan = 0.05;
    if (splitTime - target.startTime < minSpan || target.endTime - splitTime < minSpan) {
      setSaveState({ kind: 'error', message: '拆分点过于接近句段边界' });
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
      await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(copy));
      copiedTranslations.push(copy);
    }

    setUtterances((prev) => [
      ...prev.map((u) => (u.id === utteranceId ? updatedFirst : u)),
      secondHalf,
    ]);
    setTranslations((prev) => [...prev, ...copiedTranslations]);
    setUtteranceDrafts((prev) => ({ ...prev, [utteranceId]: text, [secondId]: text }));
    setSelectedUtteranceId(secondId);
    setSaveState({ kind: 'done', message: `已拆分为 ${formatTime(updatedFirst.startTime)}-${formatTime(updatedFirst.endTime)} 和 ${formatTime(secondHalf.startTime)}-${formatTime(secondHalf.endTime)}` });
  }, [createAnchor, getUtteranceTextForLayer, pushUndo, setSaveState, setSelectedUtteranceId, setTranslations, setUtteranceDrafts, setUtterances, translations, utterancesRef]);

  const deleteSelectedUtterances = useCallback(async (ids: Set<string>) => {
    const targets = utterancesRef.current.filter((u) => ids.has(u.id));
    if (targets.length === 0) return;

    pushUndo('批量删除句段');
    const idsToDelete = targets.map((u) => u.id);
    await LinguisticService.removeUtterancesBatch(idsToDelete);

    const idsToDeleteSet = new Set(idsToDelete);
    setUtterances((prev) => prev.filter((u) => !idsToDeleteSet.has(u.id)));
    setTranslations((prev) => prev.filter((t) => !idsToDeleteSet.has(t.utteranceId)));
    setSelectedUtteranceId('');
    setSelectedUtteranceIds(new Set());

    const dbInst = await getDb();
    await pruneOrphanAnchors(dbInst, idsToDeleteSet);
    setSaveState({ kind: 'done', message: `已删除 ${targets.length} 个句段` });
  }, [pruneOrphanAnchors, pushUndo, setSaveState, setSelectedUtteranceId, setSelectedUtteranceIds, setTranslations, setUtterances, utterancesRef]);

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
        setSaveState({ kind: 'error', message: '时间偏移后出现负时间或句段过短，操作已取消。' });
        return;
      }
      transformed.set(u.id, { startTime, endTime });
    }

    const timeline = utterancesOnCurrentMediaRef.current
      .map((u) => {
        const next = transformed.get(u.id);
        return next ? { ...u, ...next } : u;
      })
      .sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < timeline.length; i++) {
      if (timeline[i]!.startTime < timeline[i - 1]!.endTime + gap) {
        setSaveState({ kind: 'error', message: '时间偏移会造成句段重叠，操作已取消。' });
        return;
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
        } catch {
          // Ignore rollback failure and still surface the original operation error.
        }
      }
      const message = error instanceof Error ? error.message : '未知错误';
      setSaveState({ kind: 'error', message: `批量时间偏移失败，已回滚：${message}` });
    }
  }, [pushUndo, rollbackUndo, setSaveState, setUtterances, updateAnchorTime, utterancesOnCurrentMediaRef]);

  const scaleSelectedTimes = useCallback(async (ids: Set<string>, factor: number, anchorTime?: number) => {
    const targets = utterancesOnCurrentMediaRef.current
      .filter((u) => ids.has(u.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (targets.length === 0) return;
    if (!Number.isFinite(factor) || factor <= 0) {
      setSaveState({ kind: 'error', message: '缩放系数必须大于 0。' });
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
        setSaveState({ kind: 'error', message: '缩放后出现负时间或句段过短，操作已取消。' });
        return;
      }
      transformed.set(u.id, { startTime, endTime });
    }

    const timeline = utterancesOnCurrentMediaRef.current
      .map((u) => {
        const next = transformed.get(u.id);
        return next ? { ...u, ...next } : u;
      })
      .sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < timeline.length; i++) {
      if (timeline[i]!.startTime < timeline[i - 1]!.endTime + gap) {
        setSaveState({ kind: 'error', message: '时间缩放会造成句段重叠，操作已取消。' });
        return;
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
        } catch {
          // Ignore rollback failure and still surface the original operation error.
        }
      }
      const message = error instanceof Error ? error.message : '未知错误';
      setSaveState({ kind: 'error', message: `批量时间缩放失败，已回滚：${message}` });
    }
  }, [pushUndo, rollbackUndo, setSaveState, setUtterances, updateAnchorTime, utterancesOnCurrentMediaRef]);

  const splitByRegex = useCallback(async (ids: Set<string>, pattern: string, flags = '') => {
    const rawPattern = pattern.trim();
    if (!rawPattern) {
      setSaveState({ kind: 'error', message: '正则表达式不能为空。' });
      return;
    }

    const normalizedFlags = [...new Set(`${flags}g`.split(''))].join('');
    let splitter: RegExp;
    try {
      splitter = new RegExp(rawPattern, normalizedFlags);
    } catch {
      setSaveState({ kind: 'error', message: '正则表达式无效。' });
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
          await db.collections.utterance_texts.insert(normalizeUtteranceTextDocForStorage(copy));
          copiedTranslations.push(copy);
        }
      }
    }

    if (updates.length === 0 && inserts.length === 0) {
      setSaveState({ kind: 'error', message: '没有匹配到可拆分内容（请检查正则和选中文本）。' });
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
        setSelectedUtteranceId(inserts[0]!.id);
        setSelectedUtteranceIds(new Set([inserts[0]!.id]));
      }
      setSaveState({ kind: 'done', message: `已按正则拆分 ${updates.length + inserts.length} 个句段片段。` });
    } catch (error) {
      if (rollbackUndo) {
        try {
          await rollbackUndo();
        } catch {
          // Ignore rollback failure and still surface the original operation error.
        }
      }
      const message = error instanceof Error ? error.message : '未知错误';
      setSaveState({ kind: 'error', message: `正则批量拆分失败，已回滚：${message}` });
    }
  }, [createAnchor, getUtteranceTextForLayer, pushUndo, rollbackUndo, setSaveState, setSelectedUtteranceId, setSelectedUtteranceIds, setTranslations, setUtteranceDrafts, setUtterances, translations, utterancesOnCurrentMediaRef]);

  const mergeSelectedUtterances = useCallback(async (ids: Set<string>) => {
    const sorted = utterancesOnCurrentMediaRef.current
      .filter((u) => ids.has(u.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (sorted.length < 2) {
      setSaveState({ kind: 'error', message: '至少需要选中 2 个句段才能合并' });
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
      setSelectedUtteranceId(first.id);
      setSelectedUtteranceIds(new Set([first.id]));

      await pruneOrphanAnchors(db, removeIds);
      setSaveState({ kind: 'done', message: `已合并 ${sorted.length} 个句段 ${formatTime(updated.startTime)} - ${formatTime(updated.endTime)}` });
    } catch (error) {
      if (rollbackUndo) {
        try {
          await rollbackUndo();
        } catch {
          // Ignore rollback failure and still surface the original operation error.
        }
      }
      const message = error instanceof Error ? error.message : '未知错误';
      setSaveState({ kind: 'error', message: `批量合并失败，已回滚：${message}` });
    }
  }, [pruneOrphanAnchors, pushUndo, reassignTranslations, rollbackUndo, setSaveState, setSelectedUtteranceId, setSelectedUtteranceIds, setTranslations, setUtterances, utterancesOnCurrentMediaRef]);

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
