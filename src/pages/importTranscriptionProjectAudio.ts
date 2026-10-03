import type { ITranscriptionAppServiceGateway } from '../app/TranscriptionAppService';
import type { LayerUnitDocType, MediaItemDocType } from '../types/jieyuDbDocTypes';
import type { SaveState } from '../hooks/transcription/transcriptionTypes';
import { t, type Locale } from '../i18n';
import { withResolvedMediaItemTimelineKind } from '../utils/mediaItemTimelineKind';
import { hasEstablishedTimedUnits } from '../utils/timelineLogicalDurationSync';
import { isWaveformMediaTooLong } from '../utils/waveformDecodeGuard';
import type {
  AudioImportDisposition,
  TranscriptionAudioImportOptions,
} from './transcriptionAudioImportTypes';

export async function importTranscriptionProjectAudio(input: {
  transcriptionAppService: ITranscriptionAppServiceGateway;
  activeTextId: string | null;
  getActiveTextId: () => Promise<string | null>;
  setActiveTextId: (id: string | null) => void;
  addMediaItem: (item: MediaItemDocType) => void;
  setSaveState: (state: SaveState) => void;
  audioImportDisposition: AudioImportDisposition;
  unitsOnCurrentMedia: LayerUnitDocType[];
  loadSnapshot: () => Promise<void>;
  clearPendingAudioImportSelection: () => void;
  locale: Locale;
  tfB: (key: string, opts?: Record<string, unknown>) => string;
  file: File;
  duration: number;
  options?: TranscriptionAudioImportOptions;
}): Promise<void> {
  const {
    transcriptionAppService,
    activeTextId,
    getActiveTextId,
    setActiveTextId,
    addMediaItem,
    setSaveState,
    audioImportDisposition,
    unitsOnCurrentMedia,
    loadSnapshot,
    clearPendingAudioImportSelection,
    locale,
    tfB,
    file,
    duration,
    options,
  } = input;
  if (isWaveformMediaTooLong({ byteSize: file.size, durationSec: duration })) {
    setSaveState({
      kind: 'error',
      message: t(locale, 'transcription.action.audioTooLong'),
    });
    return;
  }
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
}
