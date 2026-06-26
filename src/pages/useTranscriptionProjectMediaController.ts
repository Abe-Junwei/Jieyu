import { useCallback, useMemo, useState } from 'react';
import type { MediaItemDocType } from '../types/jieyuDbDocTypes';
import { getTranscriptionAppService } from '../app/index';
import { useMediaImport } from '~/hooks/media/useMediaImport';
import { t } from '../i18n';
import { createLogger } from '../observability/logger';
import { reportActionError } from '../utils/actionErrorReporter';
import { fireAndForget } from '../utils/fireAndForget';
import { withResolvedMediaItemTimelineKind } from '../utils/mediaItemTimelineKind';
import {
  buildProjectMediaSearchableItems,
  computeAudioImportDisposition,
} from '../utils/transcriptionProjectMediaDerived';
import type { SearchableItem } from '../utils/searchReplaceUtils';
import type {
  UseTranscriptionProjectMediaControllerInput,
  UseTranscriptionProjectMediaControllerResult,
} from '../types/useTranscriptionProjectMediaController.types';
import type { TranscriptionAudioImportOptions } from './transcriptionAudioImportTypes';
import { readMediaFileFromInput } from '~/hooks/media/readMediaFileFromInput';
import {
  assessTimelineImportMismatch,
  resolveAudioImportWillRemapOnFirstBind,
} from '../utils/timelineImportMismatch';
import { hasEstablishedTimedUnits } from '../utils/timelineLogicalDurationSync';
import type { PendingAudioImportSelection } from '../types/useTranscriptionProjectMediaController.types';
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
    activeTextTimeMapping,
  } = input;

  const [audioDeleteConfirm, setAudioDeleteConfirm] = useState<{ filename: string } | null>(null);
  const [projectDeleteConfirm, setProjectDeleteConfirm] = useState(false);
  const [autoSegmentBusy, setAutoSegmentBusy] = useState(false);
  const [pendingAudioImportSelection, setPendingAudioImportSelection] =
    useState<PendingAudioImportSelection | null>(null);

  const audioImportTimelineMismatch = useMemo(
    () => ({
      unitsOnCurrentMedia,
      ...(typeof activeTextTimeMapping?.logicalDurationSec === 'number'
        ? { logicalDurationSecFromMapping: activeTextTimeMapping.logicalDurationSec }
        : {}),
    }),
    [activeTextTimeMapping?.logicalDurationSec, unitsOnCurrentMedia],
  );

  const clearPendingAudioImportSelection = useCallback(() => {
    setPendingAudioImportSelection(null);
  }, []);

  const audioImportDisposition = useMemo(
    () =>
      computeAudioImportDisposition({
        activeTextId,
        mediaItems,
        selectedTimelineMedia,
      }),
    [activeTextId, mediaItems, selectedTimelineMedia],
  );

  const { mediaFileInputRef } = useMediaImport();

  const selectedMediaDetails = selectedTimelineMedia?.details as
    | Record<string, unknown>
    | undefined;
  const selectedMediaBlob = selectedMediaDetails?.audioBlob;
  const selectedMediaBlobSize =
    selectedMediaBlob instanceof Blob ? selectedMediaBlob.size : undefined;

  const handleAutoSegment = useCallback(() => {
    const mediaUrl = selectedMediaUrl;
    if (!mediaUrl || autoSegmentBusy) return;
    setAutoSegmentBusy(true);
    fireAndForget(
      (async () => {
        try {
          const segments = await transcriptionAppService.resolveAutoSegmentCandidates({
            ...(selectedTimelineMedia?.id !== undefined
              ? { mediaId: selectedTimelineMedia.id }
              : {}),
            mediaUrl,
            ...(selectedMediaBlobSize !== undefined
              ? { mediaBlobSize: selectedMediaBlobSize }
              : {}),
          });
          const newSegs = segments.filter(
            (seg) =>
              !unitsOnCurrentMedia.some(
                (unit) => unit.startTime < seg.end - 0.05 && unit.endTime > seg.start + 0.05,
              ),
          );
          for (const seg of newSegs) {
            await createUnitFromSelectionRouted(seg.start, seg.end);
          }
          setSaveState({
            kind: 'done',
            message: tfB('transcription.projectMedia.vadDone', { count: newSegs.length }),
          });
        } catch (error) {
          log.error('VAD auto-segment failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          setSaveState({
            kind: 'error',
            message: t(locale, 'transcription.projectMedia.vadFailed'),
          });
        } finally {
          setAutoSegmentBusy(false);
        }
      })(),
      {
        context: 'src/pages/useTranscriptionProjectMediaController.ts:L85',
        policy: 'user-visible',
      },
    );
  }, [
    autoSegmentBusy,
    createUnitFromSelectionRouted,
    locale,
    selectedMediaBlobSize,
    selectedMediaUrl,
    selectedTimelineMedia?.id,
    setSaveState,
    tfB,
    transcriptionAppService,
    unitsOnCurrentMedia,
  ]);

  const handleDeleteCurrentAudio = useCallback(() => {
    if (!selectedTimelineMedia) return;
    setAudioDeleteConfirm({ filename: selectedTimelineMedia.filename });
  }, [selectedTimelineMedia]);

  const handleConfirmAudioDelete = useCallback(() => {
    const media = selectedTimelineMedia;
    if (!media) return;
    setAudioDeleteConfirm(null);
    fireAndForget(
      (async () => {
        try {
          await transcriptionAppService.deleteAudio(media.id);
          await loadSnapshot();
          selectTimelineUnit(null);
          clearPendingAudioImportSelection();
          setShowAudioImport(false);
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
            setErrorState: ({ message, meta }) =>
              setSaveState({ kind: 'error', message, errorMeta: meta }),
            fallbackMessage: tfB('transcription.action.audioDeleteFailed', {
              message: error instanceof Error ? error.message : String(error),
            }),
          });
        }
      })(),
      {
        context: 'src/pages/useTranscriptionProjectMediaController.ts:L120',
        policy: 'user-visible',
      },
    );
  }, [
    clearPendingAudioImportSelection,
    loadSnapshot,
    locale,
    selectTimelineUnit,
    selectedTimelineMedia,
    setSaveState,
    setShowAudioImport,
    tfB,
    transcriptionAppService,
  ]);

  const handleDeleteCurrentProject = useCallback(() => {
    if (!input.activeTextId) return;
    setProjectDeleteConfirm(true);
  }, [input.activeTextId]);

  const handleConfirmProjectDelete = useCallback(() => {
    const currentActiveTextId = activeTextId;
    if (!currentActiveTextId) return;
    setProjectDeleteConfirm(false);
    fireAndForget(
      (async () => {
        try {
          await transcriptionAppService.deleteProject(currentActiveTextId);
          setActiveTextId(null);
          selectTimelineUnit(null);
          clearPendingAudioImportSelection();
          setShowAudioImport(false);
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
            setErrorState: ({ message, meta }) =>
              setSaveState({ kind: 'error', message, errorMeta: meta }),
            fallbackMessage: tfB('transcription.action.projectDeleteFailed', {
              message: error instanceof Error ? error.message : String(error),
            }),
          });
        }
      })(),
      {
        context: 'src/pages/useTranscriptionProjectMediaController.ts:L153',
        policy: 'user-visible',
      },
    );
  }, [
    activeTextId,
    clearPendingAudioImportSelection,
    loadSnapshot,
    locale,
    selectTimelineUnit,
    setActiveTextId,
    setSaveState,
    setShowAudioImport,
    tfB,
    transcriptionAppService,
  ]);

  const handleProjectSetupSubmit = useCallback(
    async (projectInput: {
      primaryTitle: string;
      englishFallbackTitle: string;
      primaryLanguageId: string;
      primaryOrthographyId?: string;
    }) => {
      const result = await transcriptionAppService.createProject(projectInput);
      setActiveTextId(result.textId);
      setSaveState({
        kind: 'done',
        message: tfB('transcription.action.projectCreated', { title: projectInput.primaryTitle }),
      });
      setShowAudioImport(false);
      await loadSnapshot();
    },
    [loadSnapshot, setActiveTextId, setSaveState, setShowAudioImport, tfB, transcriptionAppService],
  );

  const handleAudioImport = useCallback(
    async (file: File, duration: number, options?: TranscriptionAudioImportOptions) => {
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
      addMediaItem(
        withResolvedMediaItemTimelineKind({
          id: mediaId,
          textId,
          filename: file.name,
          duration,
          details: { audioBlob: blob },
          isOfflineCached: true,
          createdAt: new Date().toISOString(),
        } as MediaItemDocType),
      );
      if (options?.mismatchAcknowledged) {
        const expandTarget = Math.max(
          duration,
          typeof options.postImportExpandLogicalToSec === 'number' &&
            Number.isFinite(options.postImportExpandLogicalToSec)
            ? options.postImportExpandLogicalToSec
            : 0,
        );
        if (expandTarget > 0) {
          await transcriptionAppService.expandTextLogicalDurationToAtLeast({
            textId,
            minLogicalDurationSec: expandTarget,
          });
        }
      } else if (!hasEstablishedTimedUnits(unitsOnCurrentMedia) && duration > 0) {
        await transcriptionAppService.setTextLogicalDurationSec({
          textId,
          logicalDurationSec: duration,
        });
      }
      await loadSnapshot();
      clearPendingAudioImportSelection();
      setSaveState({
        kind: 'done',
        message: tfB('transcription.action.audioImported', { filename: file.name }),
      });
    },
    [
      activeTextId,
      addMediaItem,
      audioImportDisposition,
      clearPendingAudioImportSelection,
      getActiveTextId,
      loadSnapshot,
      setActiveTextId,
      setSaveState,
      tfB,
      transcriptionAppService,
      unitsOnCurrentMedia,
    ],
  );

  const handleDirectMediaImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selection = await readMediaFileFromInput(event);
      if (!selection) return;

      const notices = assessTimelineImportMismatch({
        importAcousticSec: selection.duration,
        unitsOnCurrentMedia: audioImportTimelineMismatch.unitsOnCurrentMedia,
        willRemapOnFirstAcousticBind: resolveAudioImportWillRemapOnFirstBind({
          disposition: audioImportDisposition,
        }),
        ...(typeof audioImportTimelineMismatch.logicalDurationSecFromMapping === 'number'
          ? {
              logicalDurationSecFromMapping:
                audioImportTimelineMismatch.logicalDurationSecFromMapping,
            }
          : {}),
      });

      if (notices.length > 0) {
        setPendingAudioImportSelection(selection);
        setShowAudioImport(true);
        return;
      }

      try {
        await handleAudioImport(selection.file, selection.duration);
      } catch (error) {
        reportActionError({
          actionLabel: tfB('transcription.toolbar.importAudio'),
          error,
          conflictNames: ['TranscriptionPersistenceConflictError', 'RecoveryApplyConflictError'],
          conflictI18nKey: 'transcription.importExport.conflict',
          fallbackI18nKey: 'transcription.action.audioImportFailed',
          conflictMessage: tfB('transcription.importExport.conflict'),
          fallbackMessage: tfB('transcription.action.audioImportFailed', {
            message: error instanceof Error ? error.message : String(error),
          }),
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
      }
    },
    [
      audioImportDisposition,
      audioImportTimelineMismatch,
      handleAudioImport,
      setSaveState,
      setShowAudioImport,
      tfB,
    ],
  );

  const searchableItems = useMemo<SearchableItem[]>(
    () =>
      buildProjectMediaSearchableItems({
        transcriptionLayers,
        translationLayers,
        unitsOnCurrentMedia,
        getUnitTextForLayer,
        translationTextByLayer,
      }),
    [
      getUnitTextForLayer,
      transcriptionLayers,
      translationLayers,
      translationTextByLayer,
      unitsOnCurrentMedia,
    ],
  );

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
    audioImportTimelineMismatch,
    pendingAudioImportSelection,
    clearPendingAudioImportSelection,
    searchableItems,
    setAudioDeleteConfirm,
    setProjectDeleteConfirm,
  };
}
