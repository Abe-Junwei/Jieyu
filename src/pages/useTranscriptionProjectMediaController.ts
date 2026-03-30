import { useCallback, useMemo, useState } from 'react';
import type { MediaItemDocType, UtteranceDocType, UtteranceTextDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { useMediaImport } from '../hooks/useMediaImport';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import { createLogger } from '../observability/logger';
import { LinguisticService } from '../services/LinguisticService';
import { detectVadSegments, loadAudioBuffer } from '../services/VadService';
import { reportActionError } from '../utils/actionErrorReporter';
import { fireAndForget } from '../utils/fireAndForget';

const log = createLogger('useTranscriptionProjectMediaController');

interface UseTranscriptionProjectMediaControllerInput {
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
  transcriptionLayers: Array<{ id: string }>;
  translationLayers: Array<{ id: string }>;
  translationTextByLayer: ReadonlyMap<string, Map<string, UtteranceTextDocType>>;
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
}

interface SearchableItem {
  utteranceId: string;
  layerId?: string;
  layerKind?: 'transcription' | 'translation' | 'gloss';
  text: string;
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
  handleProjectSetupSubmit: (input: { titleZh: string; titleEn: string; primaryLanguageId: string }) => Promise<void>;
  handleAudioImport: (file: File, duration: number) => Promise<void>;
  searchableItems: SearchableItem[];
  setAudioDeleteConfirm: React.Dispatch<React.SetStateAction<{ filename: string } | null>>;
  setProjectDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useTranscriptionProjectMediaController(
  input: UseTranscriptionProjectMediaControllerInput,
): UseTranscriptionProjectMediaControllerResult {
  const [audioDeleteConfirm, setAudioDeleteConfirm] = useState<{ filename: string } | null>(null);
  const [projectDeleteConfirm, setProjectDeleteConfirm] = useState(false);
  const [autoSegmentBusy, setAutoSegmentBusy] = useState(false);

  const { mediaFileInputRef, handleDirectMediaImport } = useMediaImport({
    activeTextId: input.activeTextId,
    getActiveTextId: input.getActiveTextId,
    addMediaItem: input.addMediaItem,
    setSaveState: input.setSaveState,
    setActiveTextId: (id) => input.setActiveTextId(id),
    tf: input.tfB,
  });

  const handleAutoSegment = useCallback(() => {
    const mediaUrl = input.selectedMediaUrl;
    if (!mediaUrl || autoSegmentBusy) return;
    setAutoSegmentBusy(true);
    fireAndForget((async () => {
      try {
        const audioBuf = await loadAudioBuffer(mediaUrl);
        const segments = detectVadSegments(audioBuf);
        const newSegs = segments.filter((seg) => !input.utterancesOnCurrentMedia.some(
          (utterance) => utterance.startTime < seg.end - 0.05 && utterance.endTime > seg.start + 0.05,
        ));
        for (const seg of newSegs) {
          await input.createUtteranceFromSelectionRouted(seg.start, seg.end);
        }
        input.setSaveState({ kind: 'done', message: `VAD 完成，新建 ${newSegs.length} 个句段 | VAD complete: ${newSegs.length} new segments` });
      } catch (error) {
        log.error('VAD auto-segment failed', { error: error instanceof Error ? error.message : String(error) });
        input.setSaveState({ kind: 'error', message: 'VAD 分段失败 | VAD segmentation failed' });
      } finally {
        setAutoSegmentBusy(false);
      }
    })());
  }, [autoSegmentBusy, input]);

  const handleDeleteCurrentAudio = useCallback(() => {
    if (!input.selectedTimelineMedia) return;
    setAudioDeleteConfirm({ filename: input.selectedTimelineMedia.filename });
  }, [input.selectedTimelineMedia]);

  const handleConfirmAudioDelete = useCallback(() => {
    const media = input.selectedTimelineMedia;
    if (!media) return;
    setAudioDeleteConfirm(null);
    fireAndForget((async () => {
      try {
        await LinguisticService.deleteAudio(media.id);
        await input.loadSnapshot();
        input.selectTimelineUnit(null);
        input.setSaveState({ kind: 'done', message: t(input.locale, 'transcription.action.audioDeleted') });
      } catch (error) {
        log.error('Failed to delete current audio', {
          mediaId: media.id,
          error: error instanceof Error ? error.message : String(error),
        });
        reportActionError({
          actionLabel: t(input.locale, 'transcription.action.confirmDeleteAudio'),
          error,
          fallbackI18nKey: 'transcription.action.audioDeleteFailed',
          setErrorState: ({ message, meta }) => input.setSaveState({ kind: 'error', message, errorMeta: meta }),
          fallbackMessage: input.tfB('transcription.action.audioDeleteFailed', {
            message: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    })());
  }, [input]);

  const handleDeleteCurrentProject = useCallback(() => {
    if (!input.activeTextId) return;
    setProjectDeleteConfirm(true);
  }, [input.activeTextId]);

  const handleConfirmProjectDelete = useCallback(() => {
    const activeTextId = input.activeTextId;
    if (!activeTextId) return;
    setProjectDeleteConfirm(false);
    fireAndForget((async () => {
      try {
        await LinguisticService.deleteProject(activeTextId);
        input.setActiveTextId(null);
        input.selectTimelineUnit(null);
        await input.loadSnapshot();
        input.setSaveState({ kind: 'done', message: t(input.locale, 'transcription.action.projectDeleted') });
      } catch (error) {
        log.error('Failed to delete current project', {
          textId: activeTextId,
          error: error instanceof Error ? error.message : String(error),
        });
        reportActionError({
          actionLabel: t(input.locale, 'transcription.action.confirmDeleteProject'),
          error,
          fallbackI18nKey: 'transcription.action.projectDeleteFailed',
          setErrorState: ({ message, meta }) => input.setSaveState({ kind: 'error', message, errorMeta: meta }),
          fallbackMessage: input.tfB('transcription.action.projectDeleteFailed', {
            message: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    })());
  }, [input]);

  const handleProjectSetupSubmit = useCallback(async (projectInput: { titleZh: string; titleEn: string; primaryLanguageId: string }) => {
    const result = await LinguisticService.createProject(projectInput);
    input.setActiveTextId(result.textId);
    input.setSaveState({ kind: 'done', message: input.tfB('transcription.action.projectCreated', { title: projectInput.titleZh }) });
    input.setShowAudioImport(true);
    await input.loadSnapshot();
  }, [input]);

  const handleAudioImport = useCallback(async (file: File, duration: number) => {
    let textId = input.activeTextId ?? (await input.getActiveTextId());
    if (!textId) {
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const result = await LinguisticService.createProject({
        titleZh: baseName,
        titleEn: baseName,
        primaryLanguageId: 'und',
      });
      textId = result.textId;
      input.setActiveTextId(textId);
    }
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    const { mediaId } = await LinguisticService.importAudio({
      textId,
      audioBlob: blob,
      filename: file.name,
      duration,
    });
    input.addMediaItem({
      id: mediaId,
      textId,
      filename: file.name,
      duration,
      details: { audioBlob: blob },
      isOfflineCached: true,
      createdAt: new Date().toISOString(),
    } as MediaItemDocType);
    input.setSaveState({ kind: 'done', message: input.tfB('transcription.action.audioImported', { filename: file.name }) });
  }, [input]);

  const searchableItems = useMemo<SearchableItem[]>(() => {
    const items: SearchableItem[] = [];

    if (input.transcriptionLayers.length === 0) {
      for (const utterance of input.utterancesOnCurrentMedia) {
        items.push({ utteranceId: utterance.id, layerKind: 'transcription', text: input.getUtteranceTextForLayer(utterance) });
      }
    } else {
      for (const layer of input.transcriptionLayers) {
        for (const utterance of input.utterancesOnCurrentMedia) {
          const text = input.getUtteranceTextForLayer(utterance, layer.id);
          if (text) items.push({ utteranceId: utterance.id, layerId: layer.id, layerKind: 'transcription', text });
        }
      }
    }

    for (const layer of input.translationLayers) {
      const layerMap = input.translationTextByLayer.get(layer.id);
      if (!layerMap) continue;
      for (const utterance of input.utterancesOnCurrentMedia) {
        const translation = layerMap.get(utterance.id);
        if (translation?.text) items.push({ utteranceId: utterance.id, layerId: layer.id, layerKind: 'translation', text: translation.text });
      }
    }
    return items;
  }, [input]);

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