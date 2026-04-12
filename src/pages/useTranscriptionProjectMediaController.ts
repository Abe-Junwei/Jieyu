import { useCallback, useMemo, useState } from 'react';
import type { MediaItemDocType } from '../db';
import {
  legacyCreateProject,
  legacyDeleteAudio,
  legacyDeleteProject,
  legacyImportAudio,
  legacyResolveAutoSegmentCandidates,
} from '../app/index';
import { useMediaImport } from '../hooks/useMediaImport';
import { t } from '../i18n';
import { createLogger } from '../observability/logger';
import { reportActionError } from '../utils/actionErrorReporter';
import { fireAndForget } from '../utils/fireAndForget';
import type { SearchableItem } from '../utils/searchReplaceUtils';
import type {
  UseTranscriptionProjectMediaControllerInput,
  UseTranscriptionProjectMediaControllerResult,
} from '../types/useTranscriptionProjectMediaController.types';
const log = createLogger('useTranscriptionProjectMediaController');

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

  const selectedMediaBlobSize = useMemo(() => {
    const details = selectedTimelineMedia?.details as Record<string, unknown> | undefined;
    const blob = details?.audioBlob;
    return blob instanceof Blob ? blob.size : undefined;
  }, [selectedTimelineMedia]);

  const handleAutoSegment = useCallback(() => {
    const mediaUrl = selectedMediaUrl;
    if (!mediaUrl || autoSegmentBusy) return;
    setAutoSegmentBusy(true);
    fireAndForget((async () => {
      try {
        const segments = await legacyResolveAutoSegmentCandidates({
          ...(selectedTimelineMedia?.id !== undefined ? { mediaId: selectedTimelineMedia.id } : {}),
          mediaUrl,
          ...(selectedMediaBlobSize !== undefined ? { mediaBlobSize: selectedMediaBlobSize } : {}),
        });
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
  }, [autoSegmentBusy, createUtteranceFromSelectionRouted, locale, selectedMediaBlobSize, selectedMediaUrl, selectedTimelineMedia?.id, setSaveState, tfB, utterancesOnCurrentMedia]);

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
        await legacyDeleteAudio(media.id);
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
        await legacyDeleteProject(currentActiveTextId);
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
    const result = await legacyCreateProject(projectInput);
    setActiveTextId(result.textId);
    setSaveState({ kind: 'done', message: tfB('transcription.action.projectCreated', { title: projectInput.primaryTitle }) });
    setShowAudioImport(true);
    await loadSnapshot();
  }, [loadSnapshot, setActiveTextId, setSaveState, setShowAudioImport, tfB]);

  const handleAudioImport = useCallback(async (file: File, duration: number) => {
    let textId = activeTextId ?? (await getActiveTextId());
    if (!textId) {
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const result = await legacyCreateProject({
        primaryTitle: baseName,
        englishFallbackTitle: baseName,
        primaryLanguageId: 'und',
      });
      textId = result.textId;
      setActiveTextId(textId);
    }
    const blob: Blob = file.type ? file : new Blob([file], { type: file.type });
    const { mediaId } = await legacyImportAudio({
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
