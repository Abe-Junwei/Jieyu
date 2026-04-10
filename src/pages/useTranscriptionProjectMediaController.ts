import { useCallback, useMemo, useState } from 'react';
import type { LayerDocType, MediaItemDocType, UtteranceDocType, UtteranceTextDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { useMediaImport } from '../hooks/useMediaImport';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import { createLogger } from '../observability/logger';
import { LinguisticService } from '../services/LinguisticService';
import { detectVadSegments, loadAudioBuffer } from '../services/VadService';
import { ensureVadCacheForMedia } from '../services/vad/VadMediaCacheService';
import { reportActionError } from '../utils/actionErrorReporter';
import { fireAndForget } from '../utils/fireAndForget';
import type { SearchableItem } from '../utils/searchReplaceUtils';
const log = createLogger('useTranscriptionProjectMediaController');

export interface UseTranscriptionProjectMediaControllerInput {
  activeTextId: string | null;
  getActiveTextId: () => Promise<string | null>;
  setActiveTextId: (id: string | null) => void;
  setShowAudioImport: (visible: boolean) => void;
  addMediaItem: (item: MediaItemDocType) => void;
  setSaveState: (state: SaveState) => void;
  selectedMediaUrl: string | null;
  selectedTimelineMedia: MediaItemDocType | null;
  utterancesOnCurrentMedia: UtteranceDocType[];
  createUtteranceFromSelectionRouted: (start: number, end: number) => Promise<void>;
  loadSnapshot: () => Promise<void>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  locale: Locale;
  tfB: (key: string, opts?: Record<string, unknown>) => string;
  transcriptionLayers: Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>;
  translationLayers: Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>;
  translationTextByLayer: ReadonlyMap<string, Map<string, UtteranceTextDocType>>;
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
}

interface UseTranscriptionProjectMediaControllerResult {
  mediaFileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  handleDirectMediaImport: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  audioDeleteConfirm: { filename: string } | null;
  projectDeleteConfirm: boolean;
  autoSegmentBusy: boolean;
  handleAutoSegment: () => void;
  handleDeleteCurrentAudio: () => void;
  handleConfirmAudioDelete: () => void;
  handleDeleteCurrentProject: () => void;
  handleConfirmProjectDelete: () => void;
  handleProjectSetupSubmit: (input: { primaryTitle: string; englishFallbackTitle: string; primaryLanguageId: string; primaryOrthographyId?: string }) => Promise<void>;
  handleAudioImport: (file: File, duration: number) => Promise<void>;
  searchableItems: SearchableItem[];
  setAudioDeleteConfirm: React.Dispatch<React.SetStateAction<{ filename: string } | null>>;
  setProjectDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
}

async function resolveAutoSegmentCandidates(mediaId: string | undefined, mediaUrl: string): Promise<Array<{ start: number; end: number }>> {
  const cachedEntry = await ensureVadCacheForMedia({
    ...(mediaId !== undefined ? { mediaId } : {}),
    mediaUrl,
  });
  if (cachedEntry) {
    return cachedEntry.segments;
  }

  const audioBuffer = await loadAudioBuffer(mediaUrl);
  return detectVadSegments(audioBuffer);
}

export function useTranscriptionProjectMediaController(
  input: UseTranscriptionProjectMediaControllerInput,
): UseTranscriptionProjectMediaControllerResult {
  const {
    activeTextId,
    getActiveTextId,
    setActiveTextId,
    setShowAudioImport,
    addMediaItem,
    setSaveState,
    selectedMediaUrl,
    selectedTimelineMedia,
    utterancesOnCurrentMedia,
    createUtteranceFromSelectionRouted,
    loadSnapshot,
    selectTimelineUnit,
    locale,
    tfB,
    transcriptionLayers,
    translationLayers,
    translationTextByLayer,
    getUtteranceTextForLayer,
  } = input;

  const [audioDeleteConfirm, setAudioDeleteConfirm] = useState<{ filename: string } | null>(null);
  const [projectDeleteConfirm, setProjectDeleteConfirm] = useState(false);
  const [autoSegmentBusy, setAutoSegmentBusy] = useState(false);

  const { mediaFileInputRef, handleDirectMediaImport } = useMediaImport({
    activeTextId,
    getActiveTextId,
    addMediaItem,
    setSaveState,
    setActiveTextId: (id) => setActiveTextId(id),
    tf: tfB,
  });

  const handleAutoSegment = useCallback(() => {
    const mediaUrl = selectedMediaUrl;
    if (!mediaUrl || autoSegmentBusy) return;
    setAutoSegmentBusy(true);
    fireAndForget((async () => {
      try {
        const segments = await resolveAutoSegmentCandidates(selectedTimelineMedia?.id, mediaUrl);
        const newSegs = segments.filter((seg) => !utterancesOnCurrentMedia.some(
          (utterance) => utterance.startTime < seg.end - 0.05 && utterance.endTime > seg.start + 0.05,
        ));
        for (const seg of newSegs) {
          await createUtteranceFromSelectionRouted(seg.start, seg.end);
        }
        setSaveState({
          kind: 'done',
          message: tfB('transcription.projectMedia.vadDone', { count: newSegs.length }),
        });
      } catch (error) {
        log.error('VAD auto-segment failed', { error: error instanceof Error ? error.message : String(error) });
        setSaveState({ kind: 'error', message: t(locale, 'transcription.projectMedia.vadFailed') });
      } finally {
        setAutoSegmentBusy(false);
      }
    })());
  }, [autoSegmentBusy, createUtteranceFromSelectionRouted, locale, selectedMediaUrl, selectedTimelineMedia?.id, setSaveState, tfB, utterancesOnCurrentMedia]);

  const handleDeleteCurrentAudio = useCallback(() => {
    if (!selectedTimelineMedia) return;
    setAudioDeleteConfirm({ filename: selectedTimelineMedia.filename });
  }, [selectedTimelineMedia]);

  const handleConfirmAudioDelete = useCallback(() => {
    const media = selectedTimelineMedia;
    if (!media) return;
    setAudioDeleteConfirm(null);
    fireAndForget((async () => {
      try {
        await LinguisticService.deleteAudio(media.id);
        await loadSnapshot();
        selectTimelineUnit(null);
        setSaveState({ kind: 'done', message: t(locale, 'transcription.action.audioDeleted') });
      } catch (error) {
        log.error('Failed to delete current audio', {
          mediaId: media.id,
          error: error instanceof Error ? error.message : String(error),
        });
        reportActionError({
          actionLabel: t(locale, 'transcription.action.confirmDeleteAudio'),
          error,
          fallbackI18nKey: 'transcription.action.audioDeleteFailed',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          fallbackMessage: tfB('transcription.action.audioDeleteFailed', {
            message: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    })());
  }, [loadSnapshot, locale, selectTimelineUnit, selectedTimelineMedia, setSaveState, tfB]);

  const handleDeleteCurrentProject = useCallback(() => {
    if (!input.activeTextId) return;
    setProjectDeleteConfirm(true);
  }, [input.activeTextId]);

  const handleConfirmProjectDelete = useCallback(() => {
    const currentActiveTextId = activeTextId;
    if (!currentActiveTextId) return;
    setProjectDeleteConfirm(false);
    fireAndForget((async () => {
      try {
        await LinguisticService.deleteProject(currentActiveTextId);
        setActiveTextId(null);
        selectTimelineUnit(null);
        await loadSnapshot();
        setSaveState({ kind: 'done', message: t(locale, 'transcription.action.projectDeleted') });
      } catch (error) {
        log.error('Failed to delete current project', {
          textId: currentActiveTextId,
          error: error instanceof Error ? error.message : String(error),
        });
        reportActionError({
          actionLabel: t(locale, 'transcription.action.confirmDeleteProject'),
          error,
          fallbackI18nKey: 'transcription.action.projectDeleteFailed',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          fallbackMessage: tfB('transcription.action.projectDeleteFailed', {
            message: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    })());
  }, [activeTextId, loadSnapshot, locale, selectTimelineUnit, setActiveTextId, setSaveState, tfB]);

  const handleProjectSetupSubmit = useCallback(async (projectInput: { primaryTitle: string; englishFallbackTitle: string; primaryLanguageId: string; primaryOrthographyId?: string }) => {
    const result = await LinguisticService.createProject(projectInput);
    setActiveTextId(result.textId);
    setSaveState({ kind: 'done', message: tfB('transcription.action.projectCreated', { title: projectInput.primaryTitle }) });
    setShowAudioImport(true);
    await loadSnapshot();
  }, [loadSnapshot, setActiveTextId, setSaveState, setShowAudioImport, tfB]);

  const handleAudioImport = useCallback(async (file: File, duration: number) => {
    let textId = activeTextId ?? (await getActiveTextId());
    if (!textId) {
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const result = await LinguisticService.createProject({
        primaryTitle: baseName,
        englishFallbackTitle: baseName,
        primaryLanguageId: 'und',
      });
      textId = result.textId;
      setActiveTextId(textId);
    }
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    const { mediaId } = await LinguisticService.importAudio({
      textId,
      audioBlob: blob,
      filename: file.name,
      duration,
    });
    addMediaItem({
      id: mediaId,
      textId,
      filename: file.name,
      duration,
      details: { audioBlob: blob },
      isOfflineCached: true,
      createdAt: new Date().toISOString(),
    } as MediaItemDocType);
    setSaveState({ kind: 'done', message: tfB('transcription.action.audioImported', { filename: file.name }) });
  }, [activeTextId, addMediaItem, getActiveTextId, setActiveTextId, setSaveState, tfB]);

  const searchableItems = useMemo<SearchableItem[]>(() => {
    const items: SearchableItem[] = [];

    if (transcriptionLayers.length === 0) {
      for (const utterance of utterancesOnCurrentMedia) {
        items.push({ utteranceId: utterance.id, layerKind: 'transcription', text: getUtteranceTextForLayer(utterance) });
      }
    } else {
      for (const layer of transcriptionLayers) {
        for (const utterance of utterancesOnCurrentMedia) {
          const text = getUtteranceTextForLayer(utterance, layer.id);
          if (text) {
            items.push({
              utteranceId: utterance.id,
              layerId: layer.id,
              layerKind: 'transcription',
              ...(layer.languageId ? { languageId: layer.languageId } : {}),
              ...(layer.orthographyId ? { orthographyId: layer.orthographyId } : {}),
              text,
            });
          }
        }
      }
    }

    for (const layer of translationLayers) {
      const layerMap = translationTextByLayer.get(layer.id);
      if (!layerMap) continue;
      for (const utterance of utterancesOnCurrentMedia) {
        const translation = layerMap.get(utterance.id);
        if (translation?.text) {
          items.push({
            utteranceId: utterance.id,
            layerId: layer.id,
            layerKind: 'translation',
            ...(layer.languageId ? { languageId: layer.languageId } : {}),
            ...(layer.orthographyId ? { orthographyId: layer.orthographyId } : {}),
            text: translation.text,
          });
        }
      }
    }
    return items;
  }, [getUtteranceTextForLayer, transcriptionLayers, translationLayers, translationTextByLayer, utterancesOnCurrentMedia]);

  return {
    mediaFileInputRef,
    handleDirectMediaImport,
    audioDeleteConfirm,
    projectDeleteConfirm,
    autoSegmentBusy,
    handleAutoSegment,
    handleDeleteCurrentAudio,
    handleConfirmAudioDelete,
    handleDeleteCurrentProject,
    handleConfirmProjectDelete,
    handleProjectSetupSubmit,
    handleAudioImport,
    searchableItems,
    setAudioDeleteConfirm,
    setProjectDeleteConfirm,
  };
}
