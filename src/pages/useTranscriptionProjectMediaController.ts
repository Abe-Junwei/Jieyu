import { useCallback, useMemo, useState } from 'react';
import type { MediaItemDocType } from '../db';
import { getTranscriptionAppService } from '../app/index';
import { useMediaImport } from '../hooks/useMediaImport';
import { t } from '../i18n';
import { createLogger } from '../observability/logger';
import { reportActionError } from '../utils/actionErrorReporter';
import { fireAndForget } from '../utils/fireAndForget';
import { isMediaItemPlaceholderRow, withResolvedMediaItemTimelineKind } from '../utils/mediaItemTimelineKind';
import type { SearchableItem } from '../utils/searchReplaceUtils';
import type { UseTranscriptionProjectMediaControllerInput, UseTranscriptionProjectMediaControllerResult } from '../types/useTranscriptionProjectMediaController.types';
import type { TranscriptionAudioImportOptions } from './transcriptionAudioImportTypes';
const log = createLogger('useTranscriptionProjectMediaController');

export function useTranscriptionProjectMediaController(
  input: UseTranscriptionProjectMediaControllerInput,
): UseTranscriptionProjectMediaControllerResult {
  const transcriptionAppService = getTranscriptionAppService();
  const {
    activeTextId,
    mediaItems,
    getActiveTextId,
    setActiveTextId,
    setShowAudioImport,
    addMediaItem,
    setSaveState,
    selectedMediaUrl,
    selectedTimelineMedia,
    unitsOnCurrentMedia,
    createUnitFromSelectionRouted,
    loadSnapshot,
    selectTimelineUnit,
    locale,
    tfB,
    transcriptionLayers,
    translationLayers,
    translationTextByLayer,
    getUnitTextForLayer,
  } = input;

  const [audioDeleteConfirm, setAudioDeleteConfirm] = useState<{ filename: string } | null>(null);
  const [projectDeleteConfirm, setProjectDeleteConfirm] = useState(false);
  const [autoSegmentBusy, setAutoSegmentBusy] = useState(false);

  const audioImportDisposition = useMemo(() => {
    if (!activeTextId) return { kind: 'simple' as const };
    const projectMedia = mediaItems.filter((m) => m.textId === activeTextId);
    const hasAcoustic = projectMedia.some((m) => !isMediaItemPlaceholderRow(m));
    if (!hasAcoustic) return { kind: 'simple' as const };
    const replaceTarget = (selectedTimelineMedia && projectMedia.some((m) => m.id === selectedTimelineMedia.id)
      ? selectedTimelineMedia
      : projectMedia.find((m) => !isMediaItemPlaceholderRow(m))) ?? null;
    if (!replaceTarget) return { kind: 'simple' as const };
    return {
      kind: 'choose' as const,
      replaceMediaId: replaceTarget.id,
      replaceLabel: replaceTarget.filename,
    };
  }, [activeTextId, mediaItems, selectedTimelineMedia]);

  const { mediaFileInputRef, handleDirectMediaImport } = useMediaImport({
    activeTextId,
    getActiveTextId,
    addMediaItem,
    setSaveState,
    setActiveTextId: (id) => setActiveTextId(id),
    tf: tfB,
  });

  const selectedMediaDetails = selectedTimelineMedia?.details as Record<string, unknown> | undefined;
  const selectedMediaBlob = selectedMediaDetails?.audioBlob;
  const selectedMediaBlobSize = selectedMediaBlob instanceof Blob ? selectedMediaBlob.size : undefined;

  const handleAutoSegment = useCallback(() => {
    const mediaUrl = selectedMediaUrl;
    if (!mediaUrl || autoSegmentBusy) return;
    setAutoSegmentBusy(true);
    fireAndForget((async () => {
      try {
        const segments = await transcriptionAppService.resolveAutoSegmentCandidates({
          ...(selectedTimelineMedia?.id !== undefined ? { mediaId: selectedTimelineMedia.id } : {}),
          mediaUrl,
          ...(selectedMediaBlobSize !== undefined ? { mediaBlobSize: selectedMediaBlobSize } : {}),
        });
        const newSegs = segments.filter((seg) => !unitsOnCurrentMedia.some(
          (unit) => unit.startTime < seg.end - 0.05 && unit.endTime > seg.start + 0.05,
        ));
        for (const seg of newSegs) {
          await createUnitFromSelectionRouted(seg.start, seg.end);
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
  }, [autoSegmentBusy, createUnitFromSelectionRouted, locale, selectedMediaBlobSize, selectedMediaUrl, selectedTimelineMedia?.id, setSaveState, tfB, transcriptionAppService, unitsOnCurrentMedia]);

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
        await transcriptionAppService.deleteAudio(media.id);
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
  }, [loadSnapshot, locale, selectTimelineUnit, selectedTimelineMedia, setSaveState, tfB, transcriptionAppService]);

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
        await transcriptionAppService.deleteProject(currentActiveTextId);
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
  }, [activeTextId, loadSnapshot, locale, selectTimelineUnit, setActiveTextId, setSaveState, tfB, transcriptionAppService]);

  const handleProjectSetupSubmit = useCallback(async (projectInput: { primaryTitle: string; englishFallbackTitle: string; primaryLanguageId: string; primaryOrthographyId?: string }) => {
    const result = await transcriptionAppService.createProject(projectInput);
    const placeholderMedia = await transcriptionAppService.createPlaceholderMedia({
      textId: result.textId,
    });
    addMediaItem(placeholderMedia);
    setActiveTextId(result.textId);
    setSaveState({ kind: 'done', message: tfB('transcription.action.projectCreated', { title: projectInput.primaryTitle }) });
    setShowAudioImport(false);
    await loadSnapshot();
  }, [addMediaItem, loadSnapshot, setActiveTextId, setSaveState, setShowAudioImport, tfB, transcriptionAppService]);

  const handleAudioImport = useCallback(async (file: File, duration: number, options?: TranscriptionAudioImportOptions) => {
    let textId = activeTextId ?? (await getActiveTextId());
    if (!textId) {
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const result = await transcriptionAppService.createProject({
        primaryTitle: baseName,
        englishFallbackTitle: baseName,
        primaryLanguageId: 'und',
      });
      textId = result.textId;
      setActiveTextId(textId);
    }
    const blob: Blob = file.type ? file : new Blob([file], { type: file.type });
    const choose = audioImportDisposition.kind === 'choose' ? audioImportDisposition : null;
    const importPayload = {
      textId,
      audioBlob: blob,
      filename: file.name,
      duration,
      ...(options?.mode === 'replace' && choose
        ? { importMode: 'replace' as const, replaceMediaId: choose.replaceMediaId }
        : options?.mode === 'add' && choose
          ? { importMode: 'add' as const }
          : {}),
    };
    const { mediaId } = await transcriptionAppService.importAudio(importPayload);
    addMediaItem(withResolvedMediaItemTimelineKind({
      id: mediaId,
      textId,
      filename: file.name,
      duration,
      details: { audioBlob: blob },
      isOfflineCached: true,
      createdAt: new Date().toISOString(),
    } as MediaItemDocType));
    setSaveState({ kind: 'done', message: tfB('transcription.action.audioImported', { filename: file.name }) });
  }, [activeTextId, addMediaItem, audioImportDisposition, getActiveTextId, setActiveTextId, setSaveState, tfB, transcriptionAppService]);

  const searchableItems = useMemo<SearchableItem[]>(() => {
    const items: SearchableItem[] = [];

    if (transcriptionLayers.length === 0) {
      for (const unit of unitsOnCurrentMedia) {
        items.push({ unitId: unit.id, layerKind: 'transcription', text: getUnitTextForLayer(unit) });
      }
    } else {
      for (const layer of transcriptionLayers) {
        for (const unit of unitsOnCurrentMedia) {
          const text = getUnitTextForLayer(unit, layer.id);
          if (text) {
            items.push({
              unitId: unit.id,
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
      for (const unit of unitsOnCurrentMedia) {
        const translation = layerMap.get(unit.id);
        if (translation?.text) {
          items.push({
            unitId: unit.id,
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
  }, [getUnitTextForLayer, transcriptionLayers, translationLayers, translationTextByLayer, unitsOnCurrentMedia]);

  return {
    audioImportDisposition,
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
