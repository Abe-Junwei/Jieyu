import type {
  LayerDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
} from '../types/jieyuDbDocTypes';
import type { SaveState } from '../hooks/transcription/transcriptionTypes';
import type { SpeakerActionDialogState } from '../hooks/speakerManagement/types';
import {
  buildSpeakerActionErrorOptions,
  formatSpeakerClearResult,
  formatSpeakerExportContent,
  formatSpeakerExportDone,
  getSpeakerExportFallbackName,
  getSpeakerUndoLabel,
  type SpeakerFormat,
  type SpeakerTranslate,
} from '../hooks/speakerManagement/speakerI18n';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { reportActionError } from '../utils/actionErrorReporter';
import { reportValidationError } from '../utils/validationErrorReporter';

type SegmentUpdater = (segment: LayerUnitDocType) => LayerUnitDocType;

export async function pushSpeakerUndoWithFreshSegmentSnapshot(input: {
  label: string;
  pushUndo: (label: string) => void;
  refreshSegmentUndoSnapshot: () => Promise<void>;
}): Promise<void> {
  await input.refreshSegmentUndoSnapshot();
  input.pushUndo(input.label);
}

export function assertSpeakerAssignmentUpdatedCounts(input: {
  targetSegmentCount: number;
  targetUnitCount: number;
  updatedSegments: number;
  updatedUnits: number;
}): void {
  if (input.targetSegmentCount > 0 && input.updatedSegments === 0) {
    throw new Error('未找到可更新的句段');
  }
  if (input.targetUnitCount > 0 && input.updatedUnits === 0) {
    throw new Error('未找到可更新的语段');
  }
}

export function getSegmentIdsForSpeakerKey(input: {
  activeSpeakerManagementLayer: LayerDocType | null;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]>;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerUnitDocType) => string;
  speakerKey: string;
}): string[] {
  const {
    activeSpeakerManagementLayer,
    segmentsByLayer,
    resolveExplicitSpeakerKeyForSegment,
    speakerKey,
  } = input;
  if (!activeSpeakerManagementLayer) return [];
  return (segmentsByLayer.get(activeSpeakerManagementLayer.id) ?? [])
    .filter((segment) => resolveExplicitSpeakerKeyForSegment(segment) === speakerKey)
    .map((segment) => segment.id);
}

export function buildSegmentSpeakerExportRows(input: {
  activeSpeakerManagementLayer: LayerDocType;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerUnitDocType) => string;
  speakerKey: string;
  formatTime: (seconds: number) => string;
}): string[] {
  const {
    activeSpeakerManagementLayer,
    segmentsByLayer,
    segmentContentByLayer,
    resolveExplicitSpeakerKeyForSegment,
    speakerKey,
    formatTime,
  } = input;
  return (segmentsByLayer.get(activeSpeakerManagementLayer.id) ?? [])
    .filter((segment) => resolveExplicitSpeakerKeyForSegment(segment) === speakerKey)
    .sort((left, right) => left.startTime - right.startTime)
    .map((segment, index) => {
      const text =
        segmentContentByLayer.get(activeSpeakerManagementLayer.id)?.get(segment.id)?.text ?? '';
      return `${index + 1}. [${formatTime(segment.startTime)} - ${formatTime(segment.endTime)}] ${text}`;
    });
}

export function downloadSpeakerSegmentExport(input: {
  speakerName: string;
  rows: string[];
  t: SpeakerTranslate;
  tf: SpeakerFormat;
}): SaveState {
  const content = formatSpeakerExportContent(
    'segments',
    input.speakerName,
    input.rows,
    input.t,
    input.tf,
  );
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `speaker-${input.speakerName.replace(/\s+/g, '-')}-${Date.now()}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return {
    kind: 'done',
    message: formatSpeakerExportDone('segments', input.rows.length, input.t, input.tf),
  };
}

export async function executeSegmentSpeakerClearDialog(input: {
  segmentSpeakerDialogState: Extract<SpeakerActionDialogState, { mode: 'clear' }>;
  getSegmentIdsForSpeakerKey: (speakerKey: string) => string[];
  pushUndo: (label: string) => void;
  undo: () => Promise<void>;
  updateSegmentsLocally: (segmentIds: Iterable<string>, updater: SegmentUpdater) => void;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  refreshSpeakerReferenceStats: () => Promise<void>;
  setActiveSpeakerFilterKey: (key: string) => void;
  setSaveState: (state: SaveState) => void;
  setSegmentSpeakerDialogState: (state: SpeakerActionDialogState | null) => void;
  t: SpeakerTranslate;
  tf: SpeakerFormat;
}): Promise<void> {
  const ids = input.getSegmentIdsForSpeakerKey(input.segmentSpeakerDialogState.speakerKey);
  if (ids.length === 0) {
    reportValidationError({
      message: input.t('transcription.error.validation.clearSpeakerNoTarget'),
      i18nKey: 'transcription.error.validation.clearSpeakerNoTarget',
      setErrorState: ({ message, meta }) =>
        input.setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
    });
    input.setSegmentSpeakerDialogState(null);
    return;
  }

  let undoPushed = false;
  try {
    await pushSpeakerUndoWithFreshSegmentSnapshot({
      label: getSpeakerUndoLabel('clearTag', input.t),
      pushUndo: input.pushUndo,
      refreshSegmentUndoSnapshot: input.refreshSegmentUndoSnapshot,
    });
    undoPushed = true;
    const cleared = await LinguisticService.speakers.assignToSegments(ids, undefined);
    const now = new Date().toISOString();
    input.updateSegmentsLocally(ids, (segment) => {
      const next = { ...segment, updatedAt: now };
      delete next.speakerId;
      return next;
    });
    await input.reloadSegments();
    await input.refreshSegmentUndoSnapshot();
    await input.refreshSpeakerReferenceStats();
    input.setActiveSpeakerFilterKey('all');
    input.setSaveState({
      kind: 'done',
      message: formatSpeakerClearResult('segments', cleared, input.t, input.tf),
    });
    input.setSegmentSpeakerDialogState(null);
  } catch (error) {
    if (undoPushed) await input.undo();
    reportActionError({
      error,
      ...buildSpeakerActionErrorOptions('dialogOperation', error, input.t, input.tf),
      conflictI18nKey: 'transcription.error.conflict.speakerDialogOperation',
      fallbackI18nKey: 'transcription.error.action.speakerDialogOperationFailed',
      setErrorState: ({ message, meta }) =>
        input.setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
    });
  }
}

export function resolveSegmentSpeakerExportName(input: {
  speakerKey: string;
  speakerFilterOptionByKey: ReadonlyMap<string, { name: string }>;
  t: SpeakerTranslate;
}): string {
  return (
    input.speakerFilterOptionByKey.get(input.speakerKey)?.name ??
    getSpeakerExportFallbackName(input.t)
  );
}
