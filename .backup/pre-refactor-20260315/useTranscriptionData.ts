import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDb, db as dexieDb } from '../../db';
import type {
  MediaItemDocType,
  TranslationLayerDocType,
  UtteranceDocType,
  UtteranceTranslationDocType,
} from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { syncLayerToTier } from '../../services/TierBridgeService';
import {
  saveRecoverySnapshot,
  getRecoverySnapshot,
  clearRecoverySnapshot,
  type RecoveryData,
} from '../services/SnapshotService';
import { newId, formatTime } from '../utils/transcriptionFormatters';
import { normalizeSelection, shouldPushTimingUndo, type TimingUndoState } from '../utils/selectionUtils';
import { createAsyncMutex } from '../utils/asyncMutex';
import { fireAndForget } from '../utils/fireAndForget';

export type DbState =
  | { phase: 'loading' }
  | {
      phase: 'ready';
      dbName: string;
      utteranceCount: number;
      translationLayerCount: number;
      translationRecordCount: number;
    }
  | { phase: 'error'; message: string };

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

export type LayerCreateInput = {
  languageId: string;
  alias?: string | undefined;
};

export type SnapGuide = {
  visible: boolean;
  left?: number;
  right?: number;
  nearSide?: 'left' | 'right' | 'both';
};

export function useTranscriptionData() {
  const [state, setState] = useState<DbState>({ phase: 'loading' });
  const [utterances, setUtterances] = useState<UtteranceDocType[]>([]);
  const [layers, setLayers] = useState<TranslationLayerDocType[]>([]);
  const [translations, setTranslations] = useState<UtteranceTranslationDocType[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItemDocType[]>([]);
  const [selectedUtteranceId, setSelectedUtteranceId] = useState<string>('');
  const [selectedUtteranceIds, setSelectedUtteranceIds] = useState<Set<string>>(new Set());
  const [selectedMediaId, setSelectedMediaId] = useState<string>('');
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');

  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [layerCreateMessage, setLayerCreateMessage] = useState('');
  const [utteranceDrafts, setUtteranceDrafts] = useState<Record<string, string>>({});
  const [translationDrafts, setTranslationDrafts] = useState<Record<string, string>>({});
  const [snapGuide, setSnapGuide] = useState<SnapGuide>({ visible: false });
  const [layerToDeleteId, setLayerToDeleteId] = useState('');
  const [showLayerManager, setShowLayerManager] = useState(false);

  const autoSaveTimersRef = useRef<Record<string, number>>({});
  const focusedTranslationDraftKeyRef = useRef<string | null>(null);
  const utterancesRef = useRef(utterances);
  utterancesRef.current = utterances;
  const translationsRef = useRef(translations);
  translationsRef.current = translations;
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const selectedUtteranceIdRef = useRef(selectedUtteranceId);
  selectedUtteranceIdRef.current = selectedUtteranceId;
  const selectedUtteranceIdsRef = useRef(selectedUtteranceIds);
  selectedUtteranceIdsRef.current = selectedUtteranceIds;
  const timingUndoRef = useRef<TimingUndoState | null>(null);
  const timingGestureRef = useRef<{ active: boolean; utteranceId: string | null }>({ active: false, utteranceId: null });
  const dirtyRef = useRef(false);

  // Async mutex: serializes syncToDb / undo / redo to prevent interleaving
  const dbMutexRef = useRef(createAsyncMutex());

  // ---- Undo / Redo infrastructure ----
  const MAX_UNDO = 50;
  type UndoEntry = {
    label: string;
    utterances: UtteranceDocType[];
    translations: UtteranceTranslationDocType[];
  };
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const [undoRedoVersion, setUndoRedoVersion] = useState(0);

  const recoveryTimerRef = useRef<number | undefined>(undefined);
  const dbNameRef = useRef<string | undefined>(undefined);

  const scheduleRecoverySave = useCallback(() => {
    if (!dirtyRef.current) return;
    if (recoveryTimerRef.current !== undefined) window.clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = window.setTimeout(() => {
      recoveryTimerRef.current = undefined;
      const name = dbNameRef.current;
      if (!name) return;
      fireAndForget(saveRecoverySnapshot(name, {
        utterances: utterancesRef.current,
        translations: translationsRef.current,
        layers: layersRef.current,
      }));
    }, 3000);
  }, []);

  const pushUndo = useCallback((label: string) => {
    dirtyRef.current = true;
    undoStackRef.current.push({
      label,
      utterances: [...utterancesRef.current],
      translations: [...translationsRef.current],
    });
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = [];
    setUndoRedoVersion((v) => v + 1);
    scheduleRecoverySave();
  }, [scheduleRecoverySave]);

  const beginTimingGesture = useCallback((utteranceId: string) => {
    const current = timingGestureRef.current;
    if (current.active && current.utteranceId === utteranceId) return;
    timingGestureRef.current = { active: true, utteranceId };
    pushUndo('调整时间区间');
  }, [pushUndo]);

  const endTimingGesture = useCallback((utteranceId?: string) => {
    const current = timingGestureRef.current;
    if (!current.active) return;
    if (utteranceId && current.utteranceId && utteranceId !== current.utteranceId) return;
    timingGestureRef.current = { active: false, utteranceId: null };
  }, []);

  /** Sync a snapshot of utterances + translations back to IndexedDB. */
  const syncToDb = useCallback(async (
    targetUtterances: UtteranceDocType[],
    targetTranslations: UtteranceTranslationDocType[],
  ) => {
    await dbMutexRef.current.run(async () => {
      const db = await getDb();
      const currentUttIds = new Set(utterancesRef.current.map((u) => u.id));
      const targetUttIds = new Set(targetUtterances.map((u) => u.id));
      // Remove deleted utterances
      for (const id of currentUttIds) {
        if (!targetUttIds.has(id)) await db.collections.utterances.remove(id);
      }
      // Upsert target utterances
      for (const u of targetUtterances) await db.collections.utterances.insert(u);

      const currentTrIds = new Set(translationsRef.current.map((t) => t.id));
      const targetTrIds = new Set(targetTranslations.map((t) => t.id));
      // Remove deleted translations
      for (const id of currentTrIds) {
        if (!targetTrIds.has(id)) await db.collections.utterance_translations.remove(id);
      }
      // Upsert target translations
      for (const t of targetTranslations) await db.collections.utterance_translations.insert(t);
    });
  }, []);

  const undo = useCallback(async () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    redoStackRef.current.push({
      label: entry.label,
      utterances: [...utterancesRef.current],
      translations: [...translationsRef.current],
    });
    await syncToDb(entry.utterances, entry.translations);
    setUtterances(entry.utterances);
    setTranslations(entry.translations);
    setUndoRedoVersion((v) => v + 1);
    setSaveState({ kind: 'done', message: `已撤销: ${entry.label}` });
  }, [syncToDb]);

  const undoToHistoryIndex = useCallback(async (historyIndex: number) => {
    const stack = undoStackRef.current;
    if (historyIndex < 0 || historyIndex >= stack.length) return;

    const targetStackIndex = stack.length - 1 - historyIndex;
    const targetEntry = stack[targetStackIndex];
    if (!targetEntry) return;

    const redoAdds: UndoEntry[] = [];
    for (let j = stack.length - 1; j >= targetStackIndex; j -= 1) {
      const entry = stack[j];
      if (!entry) continue;
      if (j === stack.length - 1) {
        redoAdds.push({
          label: entry.label,
          utterances: [...utterancesRef.current],
          translations: [...translationsRef.current],
        });
      } else {
        const newerEntry = stack[j + 1];
        if (!newerEntry) continue;
        redoAdds.push({
          label: entry.label,
          utterances: [...newerEntry.utterances],
          translations: [...newerEntry.translations],
        });
      }
    }

    redoStackRef.current = [...redoStackRef.current, ...redoAdds];
    undoStackRef.current = stack.slice(0, targetStackIndex);

    await syncToDb(targetEntry.utterances, targetEntry.translations);
    setUtterances(targetEntry.utterances);
    setTranslations(targetEntry.translations);
    setUndoRedoVersion((v) => v + 1);

    const steps = stack.length - targetStackIndex;
    setSaveState({ kind: 'done', message: `已撤销 ${steps} 步: ${targetEntry.label}` });
  }, [syncToDb]);

  const redo = useCallback(async () => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    undoStackRef.current.push({
      label: entry.label,
      utterances: [...utterancesRef.current],
      translations: [...translationsRef.current],
    });
    await syncToDb(entry.utterances, entry.translations);
    setUtterances(entry.utterances);
    setTranslations(entry.translations);
    setUndoRedoVersion((v) => v + 1);
    setSaveState({ kind: 'done', message: `已重做: ${entry.label}` });
  }, [syncToDb]);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;
  const undoLabel = undoStackRef.current[undoStackRef.current.length - 1]?.label ?? '';
  const undoHistory = undoStackRef.current.slice(-15).map((item) => item.label).reverse();

  // Derived data ---------------------------------------------------------

  const translationLayers = useMemo(
    () => layers.filter((item) => item.layerType === 'translation'),
    [layers],
  );

  const transcriptionLayers = useMemo(
    () => layers.filter((item) => item.layerType === 'transcription'),
    [layers],
  );

  const layerRailRows = useMemo(
    () => [...transcriptionLayers, ...translationLayers],
    [transcriptionLayers, translationLayers],
  );

  const deletableLayers = useMemo(
    () => [...layers],
    [layers],
  );

  const layerPendingDelete = useMemo(
    () => layers.find((item) => item.id === layerToDeleteId),
    [layerToDeleteId, layers],
  );

  const selectedUtterance = useMemo(
    () => utterances.find((item) => item.id === selectedUtteranceId),
    [selectedUtteranceId, utterances],
  );

  const selectedUtteranceMedia = useMemo(() => {
    const targetId = selectedUtterance?.mediaId ?? selectedMediaId;
    if (targetId) {
      return mediaItems.find((item) => item.id === targetId);
    }
    return mediaItems[0];
  }, [mediaItems, selectedMediaId, selectedUtterance?.mediaId]);

  useEffect(() => {
    // 1. If selected utterance has a media id, prefer that.
    if (selectedUtterance?.mediaId) {
      if (selectedUtterance.mediaId !== selectedMediaId) {
        setSelectedMediaId(selectedUtterance.mediaId);
      }
      return;
    }

    // 2. No media items → clear.
    if (mediaItems.length === 0) {
      if (selectedMediaId) setSelectedMediaId('');
      return;
    }

    // 3. No current selection → pick first.
    if (!selectedMediaId) {
      const firstMedia = mediaItems[0];
      if (firstMedia) setSelectedMediaId(firstMedia.id);
      return;
    }

    // 4. Current selection no longer valid → pick first.
    const exists = mediaItems.some((item) => item.id === selectedMediaId);
    if (!exists) {
      const firstMedia = mediaItems[0];
      if (firstMedia) setSelectedMediaId(firstMedia.id);
    }
  }, [mediaItems, selectedMediaId, selectedUtterance?.mediaId]);

  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | undefined>();
  const objectUrlRef = useRef<string | undefined>(undefined);
  const blobMediaIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const media = selectedUtteranceMedia;
    const mediaId = media?.id;

    if (mediaId && mediaId === blobMediaIdRef.current) return;
    blobMediaIdRef.current = mediaId;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = undefined;
    }

    if (!media) {
      setSelectedMediaUrl(undefined);
      return;
    }

    const details = media.details as Record<string, unknown> | undefined;
    const blob = details?.audioBlob;
    if (blob instanceof Blob) {
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setSelectedMediaUrl(url);
      return;
    }

    setSelectedMediaUrl(media.url);
  }, [selectedUtteranceMedia]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const utterancesSorted = useMemo(() => {
    return [...utterances].sort((a, b) => a.startTime - b.startTime);
  }, [utterances]);

  const utterancesOnCurrentMedia = useMemo(() => {
    if (!selectedUtteranceMedia?.id) return [];
    return utterancesSorted.filter((item) => item.mediaId === selectedUtteranceMedia.id);
  }, [selectedUtteranceMedia?.id, utterancesSorted]);

  const utterancesOnCurrentMediaRef = useRef(utterancesOnCurrentMedia);
  utterancesOnCurrentMediaRef.current = utterancesOnCurrentMedia;

  const visibleUtterances = useMemo(() => {
    return utterancesOnCurrentMedia;
  }, [utterancesOnCurrentMedia]);

  const aiConfidenceAvg = useMemo(() => {
    const values: number[] = [];
    utterances.forEach((item) => {
      if (typeof item.ai_metadata?.confidence === 'number') {
        values.push(item.ai_metadata.confidence);
      }
    });
    translations.forEach((item) => {
      if (item.sourceType === 'ai' && typeof item.ai_metadata?.confidence === 'number') {
        values.push(item.ai_metadata.confidence);
      }
    });

    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [translations, utterances]);

  const translationTextByLayer = useMemo(() => {
    const outer = new Map<string, Map<string, UtteranceTranslationDocType>>();

    translations
      .filter(
        (item) =>
          (item.modality === 'text' || item.modality === 'mixed') &&
          Boolean(item.text),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .forEach((item) => {
        if (!outer.has(item.translationLayerId)) {
          outer.set(item.translationLayerId, new Map());
        }
        const inner = outer.get(item.translationLayerId)!;
        if (!inner.has(item.utteranceId)) {
          inner.set(item.utteranceId, item);
        }
      });

    return outer;
  }, [translations]);

  const layerById = useMemo(() => {
    const map = new Map<string, TranslationLayerDocType>();
    layers.forEach((layer) => {
      map.set(layer.id, layer);
    });
    return map;
  }, [layers]);

  const defaultTranscriptionLayerId = useMemo(() => {
    const explicitDefault = transcriptionLayers.find((layer) => layer.isDefault);
    if (explicitDefault) return explicitDefault.id;
    return transcriptionLayers[0]?.id;
  }, [transcriptionLayers]);

  const getUtteranceTextForLayer = useCallback((utterance: UtteranceDocType, layerId?: string) => {
    if (!layerId) return utterance.transcription?.default ?? '';
    const layer = layerById.get(layerId);
    if (!layer) return utterance.transcription?.default ?? '';

    if (layer.layerType === 'transcription') {
      const isDefaultLayer = layer.isDefault === true || layer.id === defaultTranscriptionLayerId;
      if (isDefaultLayer) return utterance.transcription?.default ?? '';
    }

    return translationTextByLayer.get(layer.id)?.get(utterance.id)?.text ?? '';
  }, [defaultTranscriptionLayerId, layerById, translationTextByLayer]);

  const selectedRowMeta = useMemo(() => {
    if (!selectedUtteranceId) return null;
    const index = utterancesOnCurrentMedia.findIndex((item) => item.id === selectedUtteranceId);
    if (index < 0) return null;
    const row = utterancesOnCurrentMedia[index];
    if (!row) return null;
    return {
      rowNumber: index + 1,
      start: row.startTime,
      end: row.endTime,
    };
  }, [selectedUtteranceId, utterancesOnCurrentMedia]);

  // Auto-save helpers ----------------------------------------------------

  const clearAutoSaveTimer = useCallback((key: string) => {
    const timer = autoSaveTimersRef.current[key];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete autoSaveTimersRef.current[key];
    }
  }, []);

  const scheduleAutoSave = useCallback((key: string, task: () => Promise<void>) => {
    clearAutoSaveTimer(key);
    autoSaveTimersRef.current[key] = window.setTimeout(() => {
      fireAndForget(task().finally(() => {
        delete autoSaveTimersRef.current[key];
      }));
    }, 550);
  }, [clearAutoSaveTimer]);

  // Snapshot loader (used ONLY for initial bootstrap) --------------------

  const loadSnapshot = useCallback(async () => {
    const db = await getDb();
    const [utteranceDocs, layerDocs, translationDocs, mediaDocs] = await Promise.all([
      db.collections.utterances.find().exec(),
      db.collections.translation_layers.find().exec(),
      db.collections.utterance_translations.find().exec(),
      db.collections.media_items.find().exec(),
    ]);

    const utteranceRows = utteranceDocs.map((doc) => doc.toJSON() as unknown as UtteranceDocType);
    const layerRows = layerDocs.map((doc) => doc.toJSON() as unknown as TranslationLayerDocType);
    const translationRows = translationDocs.map(
      (doc) => doc.toJSON() as unknown as UtteranceTranslationDocType,
    );
    const mediaRows = mediaDocs.map((doc) => doc.toJSON() as unknown as MediaItemDocType);

    setUtterances(utteranceRows);
    setLayers(layerRows);
    setTranslations(translationRows);
    setMediaItems(mediaRows);
    setUtteranceDrafts(() => {
      const next: Record<string, string> = {};
      utteranceRows.forEach((row) => {
        next[row.id] = row.transcription.default ?? '';
      });
      return next;
    });

    setSelectedUtteranceId((prev) => {
      if (!prev && utteranceRows[0]) return utteranceRows[0].id;
      return prev;
    });
    setSelectedLayerId((prev) => {
      if (!prev) {
        const first = layerRows.find((item) => item.layerType === 'translation');
        if (first) return first.id;
      }
      return prev;
    });

    dbNameRef.current = db.name;
    setState({
      phase: 'ready',
      dbName: db.name,
      utteranceCount: utteranceRows.length,
      translationLayerCount: layerRows.length,
      translationRecordCount: translationRows.length,
    });
  }, []);

  /** Check if a recovery snapshot exists and is newer than DB data. */
  const checkRecovery = useCallback(async (): Promise<RecoveryData | null> => {
    const name = dbNameRef.current;
    if (!name) return null;
    const snap = await getRecoverySnapshot(name);
    if (!snap || snap.utterances.length === 0) return null;
    // Compare recovery timestamp against the latest updatedAt in current data
    const latestUpdatedAt = utterancesRef.current.reduce((max, u) => {
      const t = new Date(u.updatedAt).getTime();
      return t > max ? t : max;
    }, 0);
    // Recovery is meaningful if its timestamp is at least 2s newer
    if (snap.timestamp > latestUpdatedAt + 2000) return snap;
    // Otherwise clear stale recovery
    fireAndForget(clearRecoverySnapshot(name));
    return null;
  }, []);

  /** Apply a recovery snapshot, writing it to DB and refreshing state. */
  const applyRecovery = useCallback(async (data: RecoveryData) => {
    const db = await getDb();
    // Write recovery data to DB
    for (const u of data.utterances) await db.collections.utterances.insert(u);
    for (const t of data.translations) await db.collections.utterance_translations.insert(t);
    for (const l of data.layers) await db.collections.translation_layers.insert(l);
    await loadSnapshot();
    const name = dbNameRef.current;
    if (name) fireAndForget(clearRecoverySnapshot(name));
    setSaveState({ kind: 'done', message: '已从崩溃恢复数据中还原' });
  }, [loadSnapshot, setSaveState]);

  /** Dismiss recovery without applying. */
  const dismissRecovery = useCallback(async () => {
    const name = dbNameRef.current;
    if (name) await clearRecoverySnapshot(name);
  }, []);

  // Demo data ------------------------------------------------------------

  const ensureDemoData = useCallback(async () => {
    const db = await getDb();
    const now = new Date().toISOString();

    const textDocs = await db.collections.texts.find().exec();
    let textId = textDocs[0]?.primary;
    if (!textId) {
      textId = newId('text');
      await db.collections.texts.insert({
        id: textId,
        title: { zho: '示例语料项目', eng: 'Sample Corpus Project' },
        createdAt: now,
        updatedAt: now,
      });
    }

    const mediaDocs = await db.collections.media_items.find().exec();
    let mediaId = mediaDocs[0]?.primary;
    if (!mediaId) {
      mediaId = newId('media');
      await db.collections.media_items.insert({
        id: mediaId,
        textId,
        filename: 'demo-empty-audio.webm',
        isOfflineCached: true,
        createdAt: now,
      });
    }

    const utteranceDocs = await db.collections.utterances.find().exec();
    if (!utteranceDocs[0]) {
      await db.collections.utterances.insert({
        id: newId('utt'),
        textId,
        mediaId,
        transcription: { default: '示例句子：请按 Enter 创建下一个时间段。' },
        startTime: 0,
        endTime: 3,
        isVerified: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    const layerDocs = await db.collections.translation_layers.find().exec();
    if (!layerDocs[0]) {
      const layerId = newId('layer');
      await db.collections.translation_layers.insert({
        id: layerId,
        key: 'zh_text',
        name: { zho: '中文翻译层', eng: 'Chinese Translation Layer' },
        layerType: 'translation',
        languageId: 'cmn',
        modality: 'text',
        acceptsAudio: false,
        isDefault: true,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      });

      await db.collections.layer_links.insert({
        id: newId('link'),
        transcriptionLayerKey: 'default',
        translationLayerId: layerId,
        linkType: 'free',
        isPreferred: true,
        createdAt: now,
      });
    }

    await loadSnapshot();
  }, [loadSnapshot]);

  // Save methods ---------------------------------------------------------

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
    const newTranslation: UtteranceTranslationDocType = {
      id: translationId,
      utteranceId: targetUtterance.id,
      translationLayerId: targetLayer.id,
      modality: 'audio',
      translationAudioMediaId: mediaId,
      sourceType: 'human',
      createdAt: now,
      updatedAt: now,
    } as UtteranceTranslationDocType;
    await db.collections.utterance_translations.insert(newTranslation);

    setMediaItems((prev) => [...prev, newMedia]);
    setTranslations((prev) => [...prev, newTranslation]);
    setSaveState({ kind: 'done', message: `录音翻译已保存 (${translationId})` });
  }, []);

  const saveUtteranceText = useCallback(async (utteranceId: string, value: string, layerId?: string) => {
    const targetLayer = layerId ? layerById.get(layerId) : undefined;
    const isNonDefaultTranscriptionLayer = Boolean(
      targetLayer
      && targetLayer.layerType === 'transcription'
      && !(targetLayer.isDefault === true || targetLayer.id === defaultTranscriptionLayerId),
    );

    // Non-default transcription layers are persisted in utterance_translations
    if (isNonDefaultTranscriptionLayer && targetLayer) {
      pushUndo('编辑转写文本');

      const db = await getDb();
      const now = new Date().toISOString();
      const normalizedValue = value.trim();
      const translationDocs = await db.collections.utterance_translations.find().exec();
      const existing = translationDocs
        .map((doc) => doc.toJSON() as unknown as UtteranceTranslationDocType)
        .filter(
          (item) =>
            item.utteranceId === utteranceId
            && item.translationLayerId === targetLayer.id
            && (item.modality === 'text' || item.modality === 'mixed'),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

      if (!normalizedValue) {
        if (existing) {
          await db.collections.utterance_translations.remove(existing.id);
          setTranslations((prev) => prev.filter((item) => item.id !== existing.id));
        }
        setSaveState({ kind: 'done', message: '已清空转写文本' });
        return;
      }

      if (existing) {
        const updatedTranslation: UtteranceTranslationDocType = {
          ...existing,
          text: normalizedValue,
          updatedAt: now,
        } as UtteranceTranslationDocType;
        await db.collections.utterance_translations.insert(updatedTranslation);
        setTranslations((prev) => prev.map((item) => (item.id === existing.id ? updatedTranslation : item)));
      } else {
        const newTranslation: UtteranceTranslationDocType = {
          id: newId('utr'),
          utteranceId,
          translationLayerId: targetLayer.id,
          modality: 'text',
          text: normalizedValue,
          sourceType: 'human',
          createdAt: now,
          updatedAt: now,
        } as UtteranceTranslationDocType;
        await db.collections.utterance_translations.insert(newTranslation);
        setTranslations((prev) => [...prev, newTranslation]);
      }

      setSaveState({ kind: 'done', message: '已更新转写文本' });
      return;
    }

    // Default transcription layer remains in utterance.transcription.default
    pushUndo('编辑转写文本');
    const db = await getDb();
    const target = await db.collections.utterances.findOne({ selector: { id: utteranceId } }).exec();
    if (!target) {
      setSaveState({ kind: 'error', message: '未找到目标句子' });
      return;
    }

    const current = target.toJSON() as unknown as UtteranceDocType;
    const updated: UtteranceDocType = {
      ...current,
      transcription: { ...current.transcription, default: value },
      updatedAt: new Date().toISOString(),
    };
    await db.collections.utterances.insert(updated);

    setUtterances((prev) => prev.map((item) => (item.id === utteranceId ? updated : item)));
    setUtteranceDrafts((prev) => ({ ...prev, [utteranceId]: value }));
    setSaveState({ kind: 'done', message: '已更新转写文本' });
  }, [defaultTranscriptionLayerId, layerById, pushUndo]);

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

    await db.collections.utterances.insert(updated);

    setUtterances((prev) => prev.map((item) => (item.id === utteranceId ? updated : item)));
    setSaveState({
      kind: 'done',
      message: `已更新时间区间 ${formatTime(updated.startTime)} - ${formatTime(updated.endTime)}`,
    });
  }, [pushUndo]);

  const saveTextTranslationForUtterance = useCallback(async (utteranceId: string, value: string, layerId: string) => {
    if (!layerId) {
      setSaveState({ kind: 'error', message: '请先选择翻译层' });
      return;
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const trimmed = value.trim();

    if (!trimmed) {
      // Empty value: delete existing translation record if any
      const translationDocs = await db.collections.utterance_translations.find().exec();
      const existing = translationDocs
        .map((doc) => doc.toJSON() as unknown as UtteranceTranslationDocType)
        .filter(
          (item) =>
            item.utteranceId === utteranceId &&
            item.translationLayerId === layerId &&
            (item.modality === 'text' || item.modality === 'mixed'),
        )[0];
      if (existing) {
        pushUndo('清空翻译文本');
        await db.collections.utterance_translations.remove(existing.id);
        setTranslations((prev) => prev.filter((item) => item.id !== existing.id));
        setSaveState({ kind: 'done', message: '已清空翻译文本' });
      }
      return;
    }

    pushUndo('编辑翻译文本');
    const translationDocs = await db.collections.utterance_translations.find().exec();
    const existing = translationDocs
      .map((doc) => doc.toJSON() as unknown as UtteranceTranslationDocType)
      .filter(
        (item) =>
          item.utteranceId === utteranceId &&
          item.translationLayerId === layerId &&
          (item.modality === 'text' || item.modality === 'mixed'),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    if (existing) {
      const updatedTranslation: UtteranceTranslationDocType = {
        ...existing,
        text: trimmed,
        modality: existing.modality,
        updatedAt: now,
      } as UtteranceTranslationDocType;
      await db.collections.utterance_translations.insert(updatedTranslation);
      setTranslations((prev) => prev.map((item) => (item.id === existing.id ? updatedTranslation : item)));
    } else {
      const newTranslation: UtteranceTranslationDocType = {
        id: newId('utr'),
        utteranceId,
        translationLayerId: layerId,
        modality: 'text',
        text: trimmed,
        sourceType: 'human',
        createdAt: now,
        updatedAt: now,
      } as UtteranceTranslationDocType;
      await db.collections.utterance_translations.insert(newTranslation);
      setTranslations((prev) => [...prev, newTranslation]);
    }

    setSaveState({ kind: 'done', message: '已更新翻译文本' });
  }, [pushUndo]);

  // Utterance creation ---------------------------------------------------

  const createNextUtterance = useCallback(async (base: UtteranceDocType, playerDuration: number) => {
    pushUndo('创建句段');
    const db = await getDb();
    const now = new Date().toISOString();

    const start = base.endTime;
    const fallbackEnd = start + 2;
    const end = playerDuration > 0 ? Math.min(playerDuration, fallbackEnd) : fallbackEnd;
    const finalEnd = end <= start ? start + 0.8 : end;

    const createdId = newId('utt');
    const newUtterance: UtteranceDocType = {
      id: createdId,
      textId: base.textId,
      ...(base.mediaId ? { mediaId: base.mediaId } : {}),
      transcription: { default: '' },
      startTime: start,
      endTime: finalEnd,
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    } as UtteranceDocType;
    await db.collections.utterances.insert(newUtterance);

    setUtterances((prev) => [...prev, newUtterance]);
    setUtteranceDrafts((prev) => ({ ...prev, [createdId]: '' }));
    setSelectedUtteranceId(createdId);
    setSaveState({ kind: 'done', message: `已创建新区间 ${formatTime(start)} - ${formatTime(finalEnd)}` });
  }, [pushUndo]);

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
    const createdId = newId('utt');
    const newUtterance: UtteranceDocType = {
      id: createdId,
      textId: media.textId,
      mediaId: media.id,
      transcription: { default: '' },
      startTime: Number(boundedStart.toFixed(3)),
      endTime: Number(boundedEnd.toFixed(3)),
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    } as UtteranceDocType;
    await db.collections.utterances.insert(newUtterance);

    setUtterances((prev) => [...prev, newUtterance]);
    setUtteranceDrafts((prev) => ({ ...prev, [createdId]: '' }));
    setSelectedUtteranceId(createdId);
    setSaveState({ kind: 'done', message: `已新建句段 ${formatTime(boundedStart)} - ${formatTime(boundedEnd)}` });
  }, [selectedUtteranceMedia, pushUndo]);

  // Utterance delete / merge / split ------------------------------------

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
    setSaveState({ kind: 'done', message: '已删除句段' });
  }, [selectedUtteranceId, pushUndo]);

  /** Merge translations from `removedId` into `survivorId`, concatenating text per layer. */
  const reassignTranslations = useCallback(async (
    survivorId: string,
    removedId: string,
    db: Awaited<ReturnType<typeof getDb>>,
    now: string,
  ) => {
    const removedTranslations = translations.filter((t) => t.utteranceId === removedId);
    const survivorTranslations = translations.filter((t) => t.utteranceId === survivorId);
    const newTranslations: UtteranceTranslationDocType[] = [];
    const updatedTranslations: UtteranceTranslationDocType[] = [];

    for (const rt of removedTranslations) {
      const match = survivorTranslations.find(
        (st) => st.translationLayerId === rt.translationLayerId && st.modality === rt.modality,
      );
      if (match && rt.text) {
        // Merge text into existing survivor translation
        const merged: UtteranceTranslationDocType = {
          ...match,
          text: (match.text ?? '') + rt.text,
          updatedAt: now,
        } as UtteranceTranslationDocType;
        await db.collections.utterance_translations.insert(merged);
        updatedTranslations.push(merged);
      } else if (!match) {
        // No match on survivor — reassign this translation
        const reassigned: UtteranceTranslationDocType = {
          ...rt,
          utteranceId: survivorId,
          updatedAt: now,
        } as UtteranceTranslationDocType;
        await db.collections.utterance_translations.insert(reassigned);
        newTranslations.push(reassigned);
      }
    }

    // Remove the old utterance (utterance row + corpus_lexicon_links only; translations already handled)
    await db.collections.utterance_translations.removeBySelector({ utteranceId: removedId } as never);
    await db.collections.corpus_lexicon_links.removeBySelector({ utteranceId: removedId } as never);
    await db.collections.utterances.remove(removedId);

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
    const allKeys = new Set([...Object.keys(prev.transcription ?? {}), ...Object.keys(curr.transcription ?? {})]);
    const mergedTranscription: Record<string, string> = {};
    for (const k of allKeys) {
      mergedTranscription[k] = (prev.transcription?.[k] ?? '') + (curr.transcription?.[k] ?? '');
    }
    const updated: UtteranceDocType = {
      ...prev,
      endTime: curr.endTime,
      transcription: mergedTranscription,
      updatedAt: now,
    } as UtteranceDocType;
    await db.collections.utterances.insert(updated);

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
    setSaveState({ kind: 'done', message: `已向前合并 ${formatTime(updated.startTime)} - ${formatTime(updated.endTime)}` });
  }, [reassignTranslations, pushUndo]);

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
    const allKeys = new Set([...Object.keys(curr.transcription ?? {}), ...Object.keys(next.transcription ?? {})]);
    const mergedTranscription: Record<string, string> = {};
    for (const k of allKeys) {
      mergedTranscription[k] = (curr.transcription?.[k] ?? '') + (next.transcription?.[k] ?? '');
    }
    const updated: UtteranceDocType = {
      ...curr,
      endTime: next.endTime,
      transcription: mergedTranscription,
      updatedAt: now,
    } as UtteranceDocType;
    await db.collections.utterances.insert(updated);

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
    setSaveState({ kind: 'done', message: `已向后合并 ${formatTime(updated.startTime)} - ${formatTime(updated.endTime)}` });
  }, [reassignTranslations, pushUndo]);

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
    const text = target.transcription?.default ?? '';

    // Update original: shrink to [start, splitTime]
    const updatedFirst: UtteranceDocType = {
      ...target,
      endTime: Number(splitTime.toFixed(3)),
      updatedAt: now,
    };
    await db.collections.utterances.insert(updatedFirst);

    // Create new second half: [splitTime, end], copy transcription
    const secondId = newId('utt');
    const secondHalf: UtteranceDocType = {
      ...target,
      id: secondId,
      transcription: { ...target.transcription },
      startTime: Number(splitTime.toFixed(3)),
      endTime: target.endTime,
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    } as UtteranceDocType;
    await db.collections.utterances.insert(secondHalf);

    // Copy all translations from original to the new second half
    const origTranslations = translations.filter((t) => t.utteranceId === utteranceId);
    const copiedTranslations: UtteranceTranslationDocType[] = [];
    for (const ot of origTranslations) {
      const copy: UtteranceTranslationDocType = {
        ...ot,
        id: newId('utr'),
        utteranceId: secondId,
        createdAt: now,
        updatedAt: now,
      } as UtteranceTranslationDocType;
      await db.collections.utterance_translations.insert(copy);
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
  }, [translations, pushUndo]);

  // Batch delete / merge ------------------------------------------------

  const deleteSelectedUtterances = useCallback(async (ids: Set<string>) => {
    const targets = utterancesRef.current.filter((u) => ids.has(u.id));
    if (targets.length === 0) return;

    pushUndo('批量删除句段');
    const idsToDelete = targets.map((u) => u.id);
    await dexieDb.transaction(
      'rw',
      dexieDb.utterances,
      dexieDb.utterance_translations,
      dexieDb.corpus_lexicon_links,
      async () => {
        for (const id of idsToDelete) {
          await dexieDb.utterance_translations.where('utteranceId').equals(id).delete();
          await dexieDb.corpus_lexicon_links.where('utteranceId').equals(id).delete();
        }
        await dexieDb.utterances.bulkDelete(idsToDelete);
      },
    );

    const idsToDeleteSet = new Set(idsToDelete);
    setUtterances((prev) => prev.filter((u) => !idsToDeleteSet.has(u.id)));
    setTranslations((prev) => prev.filter((t) => !idsToDeleteSet.has(t.utteranceId)));
    setSelectedUtteranceId('');
    setSelectedUtteranceIds(new Set());
    setSaveState({ kind: 'done', message: `已删除 ${targets.length} 个句段` });
  }, [pushUndo]);

  const mergeSelectedUtterances = useCallback(async (ids: Set<string>) => {
    const sorted = utterancesOnCurrentMediaRef.current.filter((u) => ids.has(u.id));
    if (sorted.length < 2) {
      setSaveState({ kind: 'error', message: '至少需要选中 2 个句段才能合并' });
      return;
    }

    // Verify continuity: all selected must be consecutive in the sorted list
    const all = utterancesOnCurrentMediaRef.current;
    const indices = sorted.map((u) => all.findIndex((a) => a.id === u.id));
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] !== indices[i - 1]! + 1) {
        setSaveState({ kind: 'error', message: '只能合并连续的句段，请确保选中的句段之间没有间隔。' });
        return;
      }
    }

    pushUndo('批量合并句段');
    const db = await getDb();
    const now = new Date().toISOString();
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;

    // Merge all transcription keys across all selected utterances
    const allKeys = new Set(sorted.flatMap((u) => Object.keys(u.transcription ?? {})));
    const mergedTranscription: Record<string, string> = {};
    for (const k of allKeys) {
      mergedTranscription[k] = sorted.map((u) => u.transcription?.[k] ?? '').join('');
    }

    const updated: UtteranceDocType = {
      ...first,
      endTime: last.endTime,
      transcription: mergedTranscription,
      updatedAt: now,
    } as UtteranceDocType;
    await db.collections.utterances.insert(updated);

    // Reassign translations from removed utterances into the first
    const toRemove = sorted.slice(1);
    let allNewTranslations: UtteranceTranslationDocType[] = [];
    let allUpdatedTranslations: UtteranceTranslationDocType[] = [];
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
    setSaveState({ kind: 'done', message: `已合并 ${sorted.length} 个句段 ${formatTime(updated.startTime)} - ${formatTime(updated.endTime)}` });
  }, [reassignTranslations, pushUndo]);

  // Layer CRUD -----------------------------------------------------------

  const createLayer = useCallback(async (
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ): Promise<boolean> => {
    const languageId = input.languageId.trim();
    const alias = (input.alias ?? '').trim();

    if (!languageId) {
      setLayerCreateMessage('请选择语言。');
      return false;
    }

    // Check for duplicate languageId + layerType (allow if alias differentiates)
    const existing = layers.find(
      (l) => l.languageId === languageId && l.layerType === layerType,
    );
    if (existing && !alias) {
      const existingLabel = existing.name.zho ?? existing.name.eng ?? existing.key;
      setLayerCreateMessage(
        `该语言已存在同类型层「${existingLabel}」（${existing.key}）。请提供别名以区分。`,
      );
      return false;
    }

    const suffix = Math.random().toString(36).slice(2, 7);
    const key = `${layerType === 'transcription' ? 'trc' : 'trl'}_${languageId}_${suffix}`;
    const effectiveModality = layerType === 'transcription' ? 'text' : (modality ?? 'text');
    const typeLabel = layerType === 'transcription' ? '转写' : '翻译';
    const autoName = alias ? `${typeLabel} · ${alias}` : typeLabel;

    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const id = newId('layer');
      const newLayer: TranslationLayerDocType = {
        id,
        key,
        name: {
          zho: autoName,
        },
        layerType,
        languageId,
        modality: effectiveModality,
        acceptsAudio: effectiveModality !== 'text',
        createdAt: now,
        updatedAt: now,
      } as TranslationLayerDocType;
      await db.collections.translation_layers.insert(newLayer);

      if (layerType === 'translation') {
        const firstTrc = transcriptionLayers[0];
        if (firstTrc) {
          await db.collections.layer_links.insert({
            id: newId('link'),
            transcriptionLayerKey: firstTrc.key,
            translationLayerId: id,
            linkType: 'free',
            isPreferred: false,
            createdAt: now,
          });
        }
        setSelectedLayerId(id);
      }

      if (layerType === 'transcription') {
        const [translationLayerDocs, linkDocs] = await Promise.all([
          db.collections.translation_layers.find().exec(),
          db.collections.layer_links.find().exec(),
        ]);
        const linkedTranslationIds = new Set(
          linkDocs.map((doc) => (doc.toJSON() as unknown as { translationLayerId: string }).translationLayerId),
        );

        const unlinkedTranslationLayers = translationLayerDocs
          .map((doc) => doc.toJSON() as unknown as TranslationLayerDocType)
          .filter((layer) => layer.layerType === 'translation' && !linkedTranslationIds.has(layer.id));

        for (const unlinkedLayer of unlinkedTranslationLayers) {
          await db.collections.layer_links.insert({
            id: newId('link'),
            transcriptionLayerKey: key,
            translationLayerId: unlinkedLayer.id,
            linkType: 'free',
            isPreferred: false,
            createdAt: now,
          });
        }
      }

      setLayers((prev) => [...prev, newLayer]);

      // Sync to TierDefinition (best-effort, non-blocking)
      const textId = utterancesRef.current[0]?.textId;
      if (textId) {
        fireAndForget(syncLayerToTier(newLayer, textId));
      }

      setLayerCreateMessage(`已创建${typeLabel}层：${autoName}（${languageId}）`);
      return true;
    } catch (error) {
      setLayerCreateMessage(error instanceof Error ? error.message : '创建层失败');
      return false;
    }
  }, [transcriptionLayers]);

  const deleteLayer = useCallback(async (targetLayerId?: string) => {
    const effectiveLayerId = targetLayerId ?? layerToDeleteId;
    if (!effectiveLayerId) {
      setLayerCreateMessage('请先选择要删除的层。');
      return;
    }

    const targetLayer = layers.find((item) => item.id === effectiveLayerId);
    if (!targetLayer) {
      setLayerCreateMessage('未找到要删除的层。');
      return;
    }

    const layerLabel = targetLayer.name.zh ?? targetLayer.name.en ?? targetLayer.key;
    const layerTypeLabel = targetLayer.layerType === 'translation' ? '翻译层' : '转写层';

    // Count dependencies to show in confirmation
    const db = await getDb();
    const [translationDocs, linkDocs] = await Promise.all([
      db.collections.utterance_translations.find().exec(),
      db.collections.layer_links.find().exec(),
    ]);
    const translationCount = translationDocs.filter(
      (d) => (d.toJSON() as unknown as { translationLayerId: string }).translationLayerId === effectiveLayerId,
    ).length;
    const linkCount = linkDocs.filter(
      (d) => (d.toJSON() as unknown as { translationLayerId: string }).translationLayerId === effectiveLayerId,
    ).length;

    const depLines = [
      translationCount > 0 ? `翻译记录：${translationCount} 条` : '',
      linkCount > 0 ? `关联链接：${linkCount} 条` : '',
    ].filter(Boolean);
    const depInfo = depLines.length > 0 ? `\n\n关联数据：\n${depLines.join('\n')}` : '';

    const confirmed = window.confirm(
      `确认删除层"${layerLabel}"吗？\n\n类型：${layerTypeLabel}\n键名：${targetLayer.key}${depInfo}\n\n将同时删除该层下全部文本/录音记录以及关联链接，此操作不可撤销。`,
    );
    if (!confirmed) return;

    try {
      await db.collections.utterance_translations.removeBySelector({
        translationLayerId: effectiveLayerId,
      });
      await db.collections.layer_links.removeBySelector({
        translationLayerId: effectiveLayerId,
      });
      await db.collections.translation_layers.remove(effectiveLayerId);

      // Clean up bridge tier (best-effort, non-blocking)
      const bridgeKey = `bridge_${targetLayer.key}`;
      const textId = utterancesRef.current[0]?.textId;
      if (textId) {
        fireAndForget((async () => {
          const tierDocs = await db.collections.tier_definitions.find().exec();
          const bridgeTier = tierDocs.find(
            (d) => d.toJSON().textId === textId && d.toJSON().key === bridgeKey,
          );
          if (bridgeTier) await db.collections.tier_definitions.remove(bridgeTier.primary);
        })());
      }

      if (selectedLayerId === effectiveLayerId) {
        setSelectedLayerId('');
      }

      setLayers((prev) => prev.filter((item) => item.id !== effectiveLayerId));
      setTranslations((prev) => prev.filter((item) => item.translationLayerId !== effectiveLayerId));
      setLayerToDeleteId('');
      setShowLayerManager(false);
      setLayerCreateMessage(`已删除层：${layerLabel}`);
    } catch (error) {
      setLayerCreateMessage(error instanceof Error ? error.message : '删除层失败');
    }
  }, [layerToDeleteId, layers, selectedLayerId]);

  // Media item incremental add (used by import flow) ---------------------

  const addMediaItem = useCallback((item: MediaItemDocType) => {
    setMediaItems((prev) => [...prev, item]);
    setSelectedMediaId(item.id);
    setSelectedUtteranceId('');
  }, []);

  // Snap guide helpers (used by waveform region callbacks) ----------------

  const getNeighborBounds = useCallback((utteranceId: string, mediaId: string | undefined, probeStart: number) => {
    const siblings = utterancesRef.current
      .filter((item) => item.id !== utteranceId && item.mediaId === mediaId)
      .sort((a, b) => a.startTime - b.startTime);

    const timeline = [...siblings, { id: utteranceId, startTime: probeStart, endTime: probeStart + 0.1 }].sort(
      (a, b) => a.startTime - b.startTime,
    );
    const currentIndex = timeline.findIndex((item) => item.id === utteranceId);
    const prev = currentIndex > 0 ? timeline[currentIndex - 1] : undefined;
    const next = currentIndex >= 0 && currentIndex < timeline.length - 1 ? timeline[currentIndex + 1] : undefined;
    return {
      left: prev ? prev.endTime + 0.02 : 0,
      right: next ? next.startTime - 0.02 : undefined,
    };
  }, []);

  const makeSnapGuide = useCallback((
    bounds: { left: number; right: number | undefined },
    start: number,
    end: number,
  ): SnapGuide => {
    const threshold = 0.045;
    const nearLeft = Math.abs(start - bounds.left) <= threshold;
    const nearRight = typeof bounds.right === 'number' ? Math.abs(end - bounds.right) <= threshold : false;
    const nearSide = nearLeft && nearRight ? 'both' : nearLeft ? 'left' : nearRight ? 'right' : undefined;
    return {
      visible: true,
      left: bounds.left,
      ...(typeof bounds.right === 'number' ? { right: bounds.right } : {}),
      ...(nearSide ? { nearSide } : {}),
    };
  }, []);

  // Layer constraint effects ---------------------------------------------

  useEffect(() => {
    if (!selectedLayerId) return;
    const exists = translationLayers.some((item) => item.id === selectedLayerId);
    if (!exists) {
      setSelectedLayerId(translationLayers[0]?.id ?? '');
    }
  }, [selectedLayerId, translationLayers]);

  useEffect(() => {
    if (!layerToDeleteId) {
      setLayerToDeleteId(deletableLayers[0]?.id ?? '');
      return;
    }
    const exists = deletableLayers.some((item) => item.id === layerToDeleteId);
    if (!exists) {
      setLayerToDeleteId(deletableLayers[0]?.id ?? '');
    }
  }, [deletableLayers, layerToDeleteId]);

  // Multi-select sync: when selectedUtteranceId changes via legacy code paths,
  // reset the set to contain just the primary.
  useEffect(() => {
    if (!selectedUtteranceId) {
      setSelectedUtteranceIds(new Set());
      return;
    }
    if (!selectedUtteranceIdsRef.current.has(selectedUtteranceId)) {
      setSelectedUtteranceIds(new Set([selectedUtteranceId]));
    }
  }, [selectedUtteranceId]);

  // Multi-select helpers -------------------------------------------------

  const setUtteranceSelection = useCallback((primaryId: string, ids: Iterable<string>) => {
    const next = normalizeSelection(primaryId, ids);
    setSelectedUtteranceId(next.primaryId);
    setSelectedUtteranceIds(next.ids);
  }, []);

  const selectUtterance = useCallback((id: string) => {
    setUtteranceSelection(id, id ? [id] : []);
  }, [setUtteranceSelection]);

  const toggleUtteranceSelection = useCallback((id: string) => {
    const next = new Set(selectedUtteranceIdsRef.current);
    if (next.has(id)) {
      next.delete(id);
      const primary = selectedUtteranceIdRef.current === id
        ? (next.values().next().value as string | undefined) ?? ''
        : selectedUtteranceIdRef.current;
      setUtteranceSelection(primary, next);
      return;
    } else {
      next.add(id);
      setUtteranceSelection(id, next);
      return;
    }
  }, [setUtteranceSelection]);

  const selectUtteranceRange = useCallback((anchorId: string, targetId: string) => {
    const sorted = utterancesOnCurrentMediaRef.current;
    const anchorIdx = sorted.findIndex((u) => u.id === anchorId);
    const targetIdx = sorted.findIndex((u) => u.id === targetId);
    if (anchorIdx < 0 || targetIdx < 0) return;
    const lo = Math.min(anchorIdx, targetIdx);
    const hi = Math.max(anchorIdx, targetIdx);
    const ids = new Set(sorted.slice(lo, hi + 1).map((u) => u.id));
    setUtteranceSelection(targetId, ids);
  }, [setUtteranceSelection]);

  const selectAllBefore = useCallback((id: string) => {
    const sorted = utterancesOnCurrentMediaRef.current;
    const idx = sorted.findIndex((u) => u.id === id);
    if (idx < 0) return;
    const ids = new Set(sorted.slice(0, idx + 1).map((u) => u.id));
    setUtteranceSelection(id, ids);
  }, [setUtteranceSelection]);

  const selectAllAfter = useCallback((id: string) => {
    const sorted = utterancesOnCurrentMediaRef.current;
    const idx = sorted.findIndex((u) => u.id === id);
    if (idx < 0) return;
    const ids = new Set(sorted.slice(idx).map((u) => u.id));
    setUtteranceSelection(id, ids);
  }, [setUtteranceSelection]);

  const selectAllUtterances = useCallback(() => {
    const sorted = utterancesOnCurrentMediaRef.current;
    if (sorted.length === 0) return;
    const ids = new Set(sorted.map((u) => u.id));
    setUtteranceSelection(selectedUtteranceIdRef.current, ids);
  }, [setUtteranceSelection]);

  const clearUtteranceSelection = useCallback(() => {
    setUtteranceSelection('', []);
  }, [setUtteranceSelection]);

  // Translation drafts sync ----------------------------------------------

  useEffect(() => {
    const next: Record<string, string> = {};
    translationLayers.forEach((layer) => {
      utterancesOnCurrentMedia.forEach((item) => {
        next[`${layer.id}-${item.id}`] = translationTextByLayer.get(layer.id)?.get(item.id)?.text ?? '';
      });
    });
    setTranslationDrafts((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      // Fast path: nothing changed
      if (prevKeys.length === nextKeys.length && nextKeys.every((k) => prev[k] === next[k])) {
        return prev;
      }
      // Preserve user's in-progress edit (the currently focused input)
      const focusedKey = focusedTranslationDraftKeyRef.current;
      if (focusedKey && focusedKey in prev) {
        next[focusedKey] = prev[focusedKey]!;
      }
      return next;
    });
  }, [translationLayers, translationTextByLayer, utterancesOnCurrentMedia]);

  // Bootstrap & cleanup --------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        await loadSnapshot();
      } catch (error) {
        if (cancelled) return;
        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : '未知错误',
        });
      }
    };

    fireAndForget(load());

    // Save recovery snapshot on page unload
    const onBeforeUnload = () => {
      const name = dbNameRef.current;
      if (name && dirtyRef.current && utterancesRef.current.length > 0) {
        // Use synchronous-ish approach: navigator.sendBeacon is not suitable for IDB.
        // Instead, start the async save — the browser usually allows short IDB writes.
        fireAndForget(saveRecoverySnapshot(name, {
          utterances: utterancesRef.current,
          translations: translationsRef.current,
          layers: layersRef.current,
        }));
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (recoveryTimerRef.current !== undefined) window.clearTimeout(recoveryTimerRef.current);
      Object.values(autoSaveTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      autoSaveTimersRef.current = {};
    };
  }, [loadSnapshot]);

  useEffect(() => {
    if (saveState.kind !== 'done') return;
    dirtyRef.current = false;
    const name = dbNameRef.current;
    if (name) {
      fireAndForget(clearRecoverySnapshot(name));
    }
  }, [saveState.kind]);

  return {
    // State
    state,
    utterances,
    layers,
    translations,
    mediaItems,
    selectedUtteranceId,
    setSelectedUtteranceId,
    selectedUtteranceIds,
    setSelectedUtteranceIds,
    setSelectedMediaId,
    selectedLayerId,
    setSelectedLayerId,
    saveState,
    setSaveState,
    layerCreateMessage,
    setLayerCreateMessage,
    utteranceDrafts,
    setUtteranceDrafts,
    translationDrafts,
    setTranslationDrafts,
    focusedTranslationDraftKeyRef,
    snapGuide,
    setSnapGuide,
    layerToDeleteId,
    setLayerToDeleteId,
    showLayerManager,
    setShowLayerManager,

    // Derived
    translationLayers,
    transcriptionLayers,
    defaultTranscriptionLayerId,
    layerRailRows,
    deletableLayers,
    layerPendingDelete,
    selectedUtterance,
    selectedUtteranceMedia,
    selectedMediaUrl,
    utterancesOnCurrentMedia,
    visibleUtterances,
    aiConfidenceAvg,
    translationTextByLayer,
    getUtteranceTextForLayer,
    selectedRowMeta,

    // Actions
    loadSnapshot,
    ensureDemoData,
    addMediaItem,
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
    selectUtterance,
    setUtteranceSelection,
    toggleUtteranceSelection,
    selectUtteranceRange,
    selectAllBefore,
    selectAllAfter,
    selectAllUtterances,
    clearUtteranceSelection,
    deleteSelectedUtterances,
    mergeSelectedUtterances,
    createLayer,
    deleteLayer,
    getNeighborBounds,
    makeSnapGuide,
    clearAutoSaveTimer,
    scheduleAutoSave,
    beginTimingGesture,
    endTimingGesture,

    // Undo / Redo
    undo,
    undoToHistoryIndex,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    undoHistory,

    // Recovery
    checkRecovery,
    applyRecovery,
    dismissRecovery,
  };
}
