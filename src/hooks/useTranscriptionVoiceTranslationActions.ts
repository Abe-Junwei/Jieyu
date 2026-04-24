import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { getDb } from '../db';
import type { LayerDocType, MediaItemDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import { withResolvedMediaItemTimelineKind } from '../utils/mediaItemTimelineKind';
import { newId } from '../utils/transcriptionFormatters';
import { listUnitTextsByUnit, removeUnitTextFromSegmentationV2, syncUnitTextToSegmentationV2 } from '../services/LayerSegmentationTextService';
import { type UnitTextWithoutLayerId, withUnitTextLayerId } from '../services/LayerIdBridgeService';
import type { SaveState } from './transcriptionTypes';
import { t, tf, useLocale } from '../i18n';
import { createCommercialProvider, type CommercialProviderCreateConfig } from '../services/stt';
import { LocalWhisperSttProvider } from '../services/stt/LocalWhisperSttProvider';
import type { CommercialProviderKind } from '../services/VoiceInputService';
import { getCommercialSttRuntimeSnapshot } from '../services/stt/voiceCommercialSttRuntime';
import { toBcp47 } from '../utils/langMapping';
import { stripSpeakerAssociationFromTranslationText } from './useTranscriptionUnitActions.helpers';
import { fileExtensionForRecordedVoiceBlob, readNonEmptyAudioBlobFromMediaItem } from '../utils/translationRecordingMediaBlob';

/** 与 `useVoiceDock` 一致，避免 action 依赖 UI hook | Mirrors useVoiceDock keys */
const VOICE_COMMERCIAL_STT_STORAGE_KEY = 'jieyu.voiceAgent.commercialStt';
const VOICE_LOCAL_WHISPER_STORAGE_KEY = 'jieyu.voiceAgent.localWhisper';

type CommercialProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  appId?: string;
  accessToken?: string;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeCommercialConfig(config: CommercialProviderConfig | undefined): CommercialProviderConfig {
  if (!config) return {};
  const sanitized: CommercialProviderConfig = {};
  const baseUrl = normalizeOptionalString(config.baseUrl);
  const model = normalizeOptionalString(config.model);
  const appId = normalizeOptionalString(config.appId);
  if (baseUrl) sanitized.baseUrl = baseUrl;
  if (model) sanitized.model = model;
  if (appId) sanitized.appId = appId;
  return sanitized;
}

function mergeCommercialConfig(
  persistedConfig: CommercialProviderConfig,
  runtimeConfig: CommercialProviderCreateConfig | undefined,
): CommercialProviderConfig {
  const runtimeApiKey = normalizeOptionalString(runtimeConfig?.apiKey);
  const runtimeBaseUrl = normalizeOptionalString(runtimeConfig?.baseUrl);
  const runtimeModel = normalizeOptionalString(runtimeConfig?.model);
  const runtimeAppId = normalizeOptionalString(runtimeConfig?.appId);
  const runtimeAccessToken = normalizeOptionalString(runtimeConfig?.accessToken);

  const persistedBaseUrl = normalizeOptionalString(persistedConfig.baseUrl);
  const persistedModel = normalizeOptionalString(persistedConfig.model);
  const persistedAppId = normalizeOptionalString(persistedConfig.appId);

  const merged: CommercialProviderConfig = {};
  const resolvedBaseUrl = runtimeBaseUrl ?? persistedBaseUrl;
  const resolvedModel = runtimeModel ?? persistedModel;
  const resolvedAppId = runtimeAppId ?? persistedAppId;

  if (runtimeApiKey) merged.apiKey = runtimeApiKey;
  if (resolvedBaseUrl) merged.baseUrl = resolvedBaseUrl;
  if (resolvedModel) merged.model = resolvedModel;
  if (resolvedAppId) merged.appId = resolvedAppId;
  if (runtimeAccessToken) merged.accessToken = runtimeAccessToken;
  return merged;
}

function isCommercialProviderKind(value: unknown): value is CommercialProviderKind {
  return value === 'groq'
    || value === 'gemini'
    || value === 'openai-audio'
    || value === 'custom-http'
    || value === 'minimax'
    || value === 'volcengine';
}

function readJsonFromLocalStorage<T>(key: string, parse: (parsed: unknown) => T | null, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    if (raw == null || raw.trim().length === 0) return fallback;
    const parsed: unknown = JSON.parse(raw);
    const out = parse(parsed);
    return out ?? fallback;
  } catch {
    return fallback;
  }
}

function loadCommercialSttConfigFromStorage(): { kind: CommercialProviderKind; config: CommercialProviderConfig } {
  return readJsonFromLocalStorage(
    VOICE_COMMERCIAL_STT_STORAGE_KEY,
    (parsed) => {
      if (!parsed || typeof parsed !== 'object') return null;
      const p = parsed as Partial<{ kind: CommercialProviderKind; config: CommercialProviderConfig }>;
      return {
        kind: isCommercialProviderKind(p.kind) ? p.kind : 'groq',
        config: sanitizeCommercialConfig(p.config),
      };
    },
    { kind: 'groq', config: {} },
  );
}

function loadLocalWhisperConfigFromStorage(): { baseUrl: string; model: string } {
  return readJsonFromLocalStorage(
    VOICE_LOCAL_WHISPER_STORAGE_KEY,
    (parsed) => {
      if (!parsed || typeof parsed !== 'object') return null;
      const p = parsed as { baseUrl?: string; model?: string };
      return {
        baseUrl: typeof p.baseUrl === 'string' && p.baseUrl.trim() ? p.baseUrl.trim() : 'http://localhost:3040',
        model: typeof p.model === 'string' && p.model.trim() ? p.model.trim() : 'ggml-small-q5_k.bin',
      };
    },
    { baseUrl: 'http://localhost:3040', model: 'ggml-small-q5_k.bin' },
  );
}

function isLikelyAbortError(e: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  if (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') return true;
  return e instanceof Error && e.name === 'AbortError';
}

type UseTranscriptionVoiceTranslationActionsParams = {
  resolveUnitById: (db: Awaited<ReturnType<typeof getDb>>, unitId: string) => Promise<LayerUnitDocType | null>;
  setMediaItems: Dispatch<SetStateAction<MediaItemDocType[]>>;
  setSaveState: (s: SaveState) => void;
  setTranslations: Dispatch<SetStateAction<LayerUnitContentDocType[]>>;
  setTranslationDrafts?: Dispatch<SetStateAction<Record<string, string>>>;
};

export function useTranscriptionVoiceTranslationActions({
  resolveUnitById,
  setMediaItems,
  setSaveState,
  setTranslations,
  setTranslationDrafts,
}: UseTranscriptionVoiceTranslationActionsParams) {
  const locale = useLocale();

  const isStandaloneSegmentTarget = useCallback((unit: LayerUnitDocType): boolean => {
    if (unit.unitType !== 'segment') return false;
    return (unit.parentUnitId?.trim() ?? '').length === 0;
  }, []);

  const listSegmentTranslations = useCallback(async (
    db: Awaited<ReturnType<typeof getDb>>,
    segmentId: string,
    layerId: string,
  ): Promise<LayerUnitContentDocType[]> => {
    const rows = await db.dexie.layer_unit_contents.where('unitId').equals(segmentId).toArray();
    return rows
      .filter((item) => item.layerId === layerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, []);

  const resolveVoiceTranslationTargets = useCallback(async (
    db: Awaited<ReturnType<typeof getDb>>,
    targetUnit: LayerUnitDocType,
    targetLayer: LayerDocType,
  ): Promise<{
    standaloneSegmentTarget: boolean;
    existingAudioTranslation: LayerUnitContentDocType | undefined;
    /** 仅独立语段宿主：同层按 updatedAt 排序后的首条（可无录音），用于 save 时回落新建/升级 */
    newestSegmentRowForLayer: LayerUnitContentDocType | undefined;
  }> => {
    const standaloneSegmentTarget = isStandaloneSegmentTarget(targetUnit);
    if (standaloneSegmentTarget) {
      const rows = await listSegmentTranslations(db, targetUnit.id, targetLayer.id);
      return {
        standaloneSegmentTarget,
        existingAudioTranslation: rows.find((item) => Boolean(item.translationAudioMediaId)),
        newestSegmentRowForLayer: rows[0],
      };
    }
    const unitRows = await listUnitTextsByUnit(db, targetUnit.id);
    const withAudio = unitRows
      .filter((item) => item.layerId === targetLayer.id && Boolean(item.translationAudioMediaId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      standaloneSegmentTarget,
      existingAudioTranslation: withAudio[0],
      newestSegmentRowForLayer: undefined,
    };
  }, [isStandaloneSegmentTarget, listSegmentTranslations]);

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
    const {
      standaloneSegmentTarget,
      existingAudioTranslation,
      newestSegmentRowForLayer,
    } = await resolveVoiceTranslationTargets(db, targetUnit, targetLayer);
    const existingTranslation = existingAudioTranslation ?? newestSegmentRowForLayer;

    const mediaId = newId('media');
    const recordingSource = targetLayer.layerType === 'transcription' ? 'transcription-recording' : 'translation-recording';
    const ext = fileExtensionForRecordedVoiceBlob(blob);
    const fallbackMime = ext === 'm4a' ? 'audio/mp4' : 'audio/webm';
    const newMedia = withResolvedMediaItemTimelineKind({
      id: mediaId,
      textId: targetUnit.textId,
      filename: `${targetLayer.key}-${mediaId}.${ext}`,
      isOfflineCached: true,
      details: { source: recordingSource, mimeType: blob.type || fallbackMime, audioBlob: blob },
      createdAt: now,
    } as MediaItemDocType);
    await db.collections.media_items.insert(newMedia);

    const translationId = existingTranslation?.id ?? (standaloneSegmentTarget ? `segc_${targetLayer.id}_${targetUnit.id}` : newId('utr'));
    const newTranslation: LayerUnitContentDocType = existingTranslation
      ? {
        ...existingTranslation,
        modality: existingTranslation.modality === 'mixed' || Boolean(existingTranslation.text) ? 'mixed' : 'audio',
        translationAudioMediaId: mediaId,
        mediaRefId: mediaId,
        sourceType: 'human',
        updatedAt: now,
      }
      : {
        ...(standaloneSegmentTarget
          ? {
            id: translationId,
            textId: targetUnit.textId,
            unitId: targetUnit.id,
            layerId: targetLayer.id,
            contentRole: 'primary_text',
            modality: 'audio',
            translationAudioMediaId: mediaId,
            mediaRefId: mediaId,
            sourceType: 'human',
            createdAt: now,
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
          }),
      } as LayerUnitContentDocType;

    if (standaloneSegmentTarget) {
      await db.dexie.layer_unit_contents.put(newTranslation);
    } else {
      await syncUnitTextToSegmentationV2(db, targetUnit, newTranslation);
    }

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
      if (!existingTranslation) {
        return [...prev, newTranslation];
      }
      let replaced = false;
      const next = prev.map((item) => {
        if (item.id !== existingTranslation.id) return item;
        replaced = true;
        return newTranslation;
      });
      return replaced ? next : [...next, newTranslation];
    });
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.voiceTranslation.done.saved', { id: translationId }),
    });
  }, [locale, resolveVoiceTranslationTargets, setMediaItems, setSaveState, setTranslations]);

  const deleteVoiceTranslation = useCallback(async (
    targetUnit: LayerUnitDocType,
    targetLayer: LayerDocType,
  ) => {
    if (!targetUnit || !targetLayer) {
      throw new Error(t(locale, 'transcription.error.validation.voiceTranslationTargetRequired'));
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const { standaloneSegmentTarget, existingAudioTranslation } = await resolveVoiceTranslationTargets(
      db,
      targetUnit,
      targetLayer,
    );

    const mediaId = existingAudioTranslation?.translationAudioMediaId;
    if (!existingAudioTranslation || !mediaId) {
      setSaveState({ kind: 'done', message: t(locale, 'transcription.voiceTranslation.done.noAudioToDelete') });
      return;
    }

    const normalizedText = (existingAudioTranslation.text ?? '').trim();

    if (normalizedText) {
      const {
        translationAudioMediaId: _removedAudioId,
        mediaRefId: _removedMediaRefId,
        ...translationWithoutAudio
      } = existingAudioTranslation;
      const updatedTranslation: LayerUnitContentDocType = {
        ...translationWithoutAudio,
        modality: 'text',
        updatedAt: now,
      } as LayerUnitContentDocType;
      if (standaloneSegmentTarget) {
        await db.dexie.layer_unit_contents.put(updatedTranslation);
      } else {
        const unit = await resolveUnitById(db, targetUnit.id);
        if (unit) {
          await syncUnitTextToSegmentationV2(db, unit, updatedTranslation);
        }
      }
      setTranslations((prev) => prev.map((item) => (item.id === existingAudioTranslation.id ? updatedTranslation : item)));
    } else {
      if (standaloneSegmentTarget) {
        await db.dexie.layer_unit_contents.delete(existingAudioTranslation.id);
      } else {
        await removeUnitTextFromSegmentationV2(db, existingAudioTranslation);
      }
      setTranslations((prev) => prev.filter((item) => item.id !== existingAudioTranslation.id));
    }

    await db.dexie.media_items.delete(mediaId);
    setMediaItems((prev) => prev.filter((item) => item.id !== mediaId));
    setSaveState({ kind: 'done', message: t(locale, 'transcription.voiceTranslation.done.deleted') });
  }, [locale, resolveUnitById, resolveVoiceTranslationTargets, setMediaItems, setSaveState, setTranslations]);

  /**
   * 混合层译文录音 → STT 回填（策略 A）：原地升级含 `translationAudioMediaId` 的译文行，禁止走 `saveUnitLayerText`
   * 以免 audio-only 行被旁路新建纯 text 行。
   */
  const transcribeVoiceTranslation = useCallback(async (
    targetUnit: LayerUnitDocType,
    targetLayer: LayerDocType,
    options?: { signal?: AbortSignal; audioBlob?: Blob },
  ) => {
    if (!targetUnit || !targetLayer) {
      throw new Error(t(locale, 'transcription.error.validation.voiceTranslationTargetRequired'));
    }
    if (targetLayer.layerType !== 'translation' || (targetLayer.modality !== 'mixed' && targetLayer.modality !== 'audio')) {
      setSaveState({
        kind: 'error',
        message: t(locale, 'transcription.voiceTranslation.error.transcribeMixedLayerOnly'),
      });
      return;
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const { standaloneSegmentTarget, existingAudioTranslation } = await resolveVoiceTranslationTargets(
      db,
      targetUnit,
      targetLayer,
    );

    const mediaId = existingAudioTranslation?.translationAudioMediaId;
    if (!existingAudioTranslation || !mediaId) {
      setSaveState({ kind: 'done', message: t(locale, 'transcription.voiceTranslation.done.noAudioToTranscribe') });
      return;
    }

    // 优先使用 UI 侧传入的内存 Blob（时间轴 `mediaItems` 常带 blob；持久化层可能无法 round-trip Blob）
    let blob: Blob | null = options?.audioBlob && options.audioBlob.size > 0 ? options.audioBlob : null;
    if (!blob) {
      const mediaRow = await db.dexie.media_items.get(mediaId) as MediaItemDocType | undefined;
      blob = readNonEmptyAudioBlobFromMediaItem(mediaRow) ?? null;
    }
    if (!blob || blob.size === 0) {
      setSaveState({
        kind: 'error',
        message: t(locale, 'transcription.voiceTranslation.error.noAudioBlob'),
      });
      return;
    }

    const langSource = targetLayer.languageId?.trim() || 'und';
    const sttLang = toBcp47(langSource) ?? langSource;

    const whisperCfg = loadLocalWhisperConfigFromStorage();
    const whisper = new LocalWhisperSttProvider({
      baseUrl: whisperCfg.baseUrl,
      model: whisperCfg.model,
    });

    const sttSignal = options?.signal;
    const transcribeOpts = sttSignal ? { signal: sttSignal } : {};

    let transcript = '';
    let usedWhisper = false;
    try {
      const w = await whisper.transcribe(blob, sttLang, transcribeOpts);
      transcript = (w.text ?? '').trim();
      usedWhisper = true;
    } catch (e) {
      if (isLikelyAbortError(e, sttSignal)) {
        setSaveState({ kind: 'done', message: t(locale, 'transcription.voiceTranslation.done.transcribeAborted') });
        return;
      }
      if (import.meta.env.DEV) {
        console.debug('[Jieyu] transcribeVoiceTranslation: local whisper failed', e);
      }
      transcript = '';
    }

    if (!transcript) {
      const persisted = loadCommercialSttConfigFromStorage();
      const runtime = getCommercialSttRuntimeSnapshot();
      const kind = runtime?.kind ?? persisted.kind;
      const config = mergeCommercialConfig(persisted.config, runtime?.config);
      try {
        const commercialCreate: CommercialProviderCreateConfig = {};
        const apiKey = normalizeOptionalString(config.apiKey);
        const baseUrl = normalizeOptionalString(config.baseUrl);
        const model = normalizeOptionalString(config.model);
        const appId = normalizeOptionalString(config.appId);
        const accessToken = normalizeOptionalString(config.accessToken);
        if (apiKey) commercialCreate.apiKey = apiKey;
        if (baseUrl) commercialCreate.baseUrl = baseUrl;
        if (model) commercialCreate.model = model;
        if (appId) commercialCreate.appId = appId;
        if (accessToken) commercialCreate.accessToken = accessToken;
        const commercial = createCommercialProvider(kind, commercialCreate);
        const available = await commercial.isAvailable();
        if (!available) {
          throw new Error(t(locale, 'transcription.voiceTranslation.error.commercialUnavailable'));
        }
        const c = await commercial.transcribe(blob, sttLang, transcribeOpts);
        transcript = (c.text ?? '').trim();
      } catch (err) {
        if (isLikelyAbortError(err, sttSignal)) {
          setSaveState({ kind: 'done', message: t(locale, 'transcription.voiceTranslation.done.transcribeAborted') });
          return;
        }
        const detail = err instanceof Error ? err.message : String(err);
        setSaveState({
          kind: 'error',
          message: usedWhisper
            ? tf(locale, 'transcription.voiceTranslation.error.transcribeWhisperThenCommercialFailed', { detail })
            : tf(locale, 'transcription.voiceTranslation.error.transcribeFailed', { detail }),
        });
        return;
      }
    }

    if (!transcript) {
      setSaveState({
        kind: 'error',
        message: t(locale, 'transcription.voiceTranslation.error.transcribeEmpty'),
      });
      return;
    }

    const baseRow = stripSpeakerAssociationFromTranslationText(existingAudioTranslation);
    const updatedTranslation: LayerUnitContentDocType = {
      ...baseRow,
      text: transcript,
      modality: 'mixed',
      updatedAt: now,
    } as LayerUnitContentDocType;

    if (standaloneSegmentTarget) {
      await db.dexie.layer_unit_contents.put(updatedTranslation);
    } else {
      const unit = await resolveUnitById(db, targetUnit.id);
      if (unit) {
        await syncUnitTextToSegmentationV2(db, unit, updatedTranslation);
      }
    }

    setTranslations((prev) => prev.map((item) => (item.id === existingAudioTranslation.id ? updatedTranslation : item)));
    const draftKey = `${targetLayer.id}-${targetUnit.id}`;
    setTranslationDrafts?.((prev) => ({ ...prev, [draftKey]: transcript }));
    setSaveState({ kind: 'done', message: t(locale, 'transcription.voiceTranslation.done.transcribed') });
  }, [
    locale,
    resolveUnitById,
    resolveVoiceTranslationTargets,
    setSaveState,
    setTranslationDrafts,
    setTranslations,
  ]);

  return {
    saveVoiceTranslation,
    deleteVoiceTranslation,
    transcribeVoiceTranslation,
  };
}