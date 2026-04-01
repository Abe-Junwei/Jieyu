/**
 * Speaker action i18n helpers | 说话人动作本地化辅助
 */

import type {
  SpeakerDisplayLabels,
  SpeakerSelectionSummaryLabels,
} from './speakerUtils';

export type SpeakerTranslate = (key: string) => string;
export type SpeakerFormat = (key: string, params?: Record<string, string | number>) => string;

export const SPEAKER_ACTION_ERROR_LABELS = {
  assign: 'transcription.speakerAction.label.assign',
  create: 'transcription.speakerAction.label.create',
  cleanupUnused: 'transcription.speakerAction.label.cleanupUnused',
  dialogOperation: 'transcription.speakerAction.label.dialogOperation',
} as const;

export type SpeakerActionErrorKind = keyof typeof SPEAKER_ACTION_ERROR_LABELS;
export type SpeakerUndoKey =
  | 'assign'
  | 'reuseAndAssign'
  | 'createAndAssign'
  | 'cleanupUnused'
  | 'clearTag'
  | 'rename'
  | 'merge'
  | 'deleteAndMigrate'
  | 'deleteEntity';
export type SpeakerUnitScope = 'utterances' | 'segments' | 'selection';

const SPEAKER_UNIT_KEYS: Record<SpeakerUnitScope, string> = {
  utterances: 'transcription.speakerAction.unit.utterances',
  segments: 'transcription.speakerAction.unit.segments',
  selection: 'transcription.speakerAction.unit.selection',
};

const SPEAKER_EXPORT_COUNT_LABEL_KEYS: Record<Exclude<SpeakerUnitScope, 'selection'>, string> = {
  utterances: 'transcription.speakerAction.export.countLabelUtterances',
  segments: 'transcription.speakerAction.export.countLabelSegments',
};

const SPEAKER_UNDO_KEYS: Record<SpeakerUndoKey, string> = {
  assign: 'transcription.speakerAction.undo.assign',
  reuseAndAssign: 'transcription.speakerAction.undo.reuseAndAssign',
  createAndAssign: 'transcription.speakerAction.undo.createAndAssign',
  cleanupUnused: 'transcription.speakerAction.undo.cleanupUnused',
  clearTag: 'transcription.speakerAction.undo.clearTag',
  rename: 'transcription.speakerAction.undo.rename',
  merge: 'transcription.speakerAction.undo.merge',
  deleteAndMigrate: 'transcription.speakerAction.undo.deleteAndMigrate',
  deleteEntity: 'transcription.speakerAction.undo.deleteEntity',
};

const SPEAKER_ACTION_ERROR_KEYS: Record<SpeakerActionErrorKind, { fallback: string; conflict: string }> = {
  assign: {
    fallback: 'transcription.error.action.assignSpeakerFailed',
    conflict: 'transcription.error.conflict.assignSpeaker',
  },
  create: {
    fallback: 'transcription.error.action.createSpeakerFailed',
    conflict: 'transcription.error.conflict.createSpeaker',
  },
  cleanupUnused: {
    fallback: 'transcription.error.action.cleanupUnusedSpeakerFailed',
    conflict: 'transcription.error.conflict.cleanupUnusedSpeaker',
  },
  dialogOperation: {
    fallback: 'transcription.error.action.speakerDialogOperationFailed',
    conflict: 'transcription.error.conflict.speakerDialogOperation',
  },
};

type BuildMixedSelectionSpeakerSummaryOptions = {
  assignedKeys: string[];
  totalSelectedCount: number;
  getSpeakerName: (speakerKey: string) => string;
  t: SpeakerTranslate;
  tf: SpeakerFormat;
};

function getErrorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getSpeakerUnitLabel(scope: SpeakerUnitScope, t: SpeakerTranslate): string {
  return t(SPEAKER_UNIT_KEYS[scope]);
}

export function buildSpeakerDisplayLabels(t: SpeakerTranslate): SpeakerDisplayLabels {
  return {
    unnamedSpeaker: t('transcription.speaker.common.unnamed'),
    unassignedSpeaker: t('transcription.speaker.common.unassigned'),
  };
}

export function buildUtteranceSpeakerSummaryLabels(
  t: SpeakerTranslate,
  tf: SpeakerFormat,
): SpeakerSelectionSummaryLabels {
  const displayLabels = buildSpeakerDisplayLabels(t);
  return {
    ...displayLabels,
    noSelectionUtterances: t('transcription.speaker.summary.noSelectionUtterances'),
    noneAssignedUtterances: t('transcription.speaker.summary.noneAssignedUtterances'),
    singleSpeakerSummary: (speakerName) => tf('transcription.speaker.summary.single', { name: speakerName }),
    multipleSpeakersSummary: (count) => tf('transcription.speaker.summary.multiple', { count }),
  };
}

export function buildMixedSelectionSpeakerSummary({
  assignedKeys,
  totalSelectedCount,
  getSpeakerName,
  t,
  tf,
}: BuildMixedSelectionSpeakerSummaryOptions): string {
  if (assignedKeys.length === 0) {
    return t('transcription.speaker.summary.noneAssignedSelection');
  }

  const uniqueKeys = new Set(assignedKeys);
  if (assignedKeys.length < totalSelectedCount) {
    if (uniqueKeys.size === 1) {
      const firstKey = assignedKeys[0];
      if (firstKey) {
        return tf('transcription.speaker.summary.partialSingle', { name: getSpeakerName(firstKey) });
      }
    }
    return tf('transcription.speaker.summary.partialMultiple', { count: uniqueKeys.size });
  }

  if (uniqueKeys.size === 1) {
    const firstKey = assignedKeys[0];
    if (firstKey) {
      return tf('transcription.speaker.summary.single', { name: getSpeakerName(firstKey) });
    }
  }

  return tf('transcription.speaker.summary.multiple', { count: uniqueKeys.size });
}

export function getSpeakerUndoLabel(kind: SpeakerUndoKey, t: SpeakerTranslate): string {
  return t(SPEAKER_UNDO_KEYS[kind]);
}

export function formatSpeakerAssignmentResult(
  scope: SpeakerUnitScope,
  updated: number,
  t: SpeakerTranslate,
  tf: SpeakerFormat,
): string {
  const unit = getSpeakerUnitLabel(scope, t);
  return updated > 0
    ? tf('transcription.speakerAction.done.assign', { count: updated, unit })
    : tf('transcription.speakerAction.done.assignEmpty', { unit });
}

export function formatSpeakerCreateAndAssignResult(
  scope: SpeakerUnitScope,
  speakerName: string,
  updated: number,
  existing: boolean,
  t: SpeakerTranslate,
  tf: SpeakerFormat,
): string {
  const unit = getSpeakerUnitLabel(scope, t);
  return existing
    ? tf('transcription.speakerAction.done.reuseAndAssign', { name: speakerName, count: updated, unit })
    : tf('transcription.speakerAction.done.createAndAssign', { name: speakerName, count: updated, unit });
}

export function formatSpeakerCreateOnlyResult(
  speakerName: string,
  existing: boolean,
  tf: SpeakerFormat,
): string {
  return existing
    ? tf('transcription.speakerAction.done.reuseSpeakerOnly', { name: speakerName })
    : tf('transcription.speakerAction.done.createSpeakerOnly', { name: speakerName });
}

export function formatSpeakerCleanupResult(count: number, tf: SpeakerFormat): string {
  return tf('transcription.speakerAction.done.cleanupUnused', { count });
}

export function formatSpeakerClearResult(
  scope: Exclude<SpeakerUnitScope, 'selection'>,
  cleared: number,
  t: SpeakerTranslate,
  tf: SpeakerFormat,
): string {
  return tf('transcription.speakerAction.done.clear', {
    count: cleared,
    unit: getSpeakerUnitLabel(scope, t),
  });
}

export function formatSpeakerRenameResult(speakerName: string, tf: SpeakerFormat): string {
  return tf('transcription.speakerAction.done.rename', { name: speakerName });
}

export function formatSpeakerMergeResult(
  moved: number,
  targetSpeakerName: string,
  tf: SpeakerFormat,
): string {
  return tf('transcription.speakerAction.done.merge', { count: moved, name: targetSpeakerName });
}

export function formatSpeakerDeleteAndMigrateResult(
  moved: number,
  targetSpeakerName: string,
  tf: SpeakerFormat,
): string {
  return tf('transcription.speakerAction.done.deleteAndMigrate', { count: moved, name: targetSpeakerName });
}

export function formatSpeakerDeleteAndClearResult(cleared: number, tf: SpeakerFormat): string {
  return tf('transcription.speakerAction.done.deleteAndClear', { count: cleared });
}

export function getSpeakerExportFallbackName(t: SpeakerTranslate): string {
  return t('transcription.speakerAction.export.filenameFallbackSpeaker');
}

export function formatSpeakerExportContent(
  scope: Exclude<SpeakerUnitScope, 'selection'>,
  speakerName: string,
  rows: string[],
  t: SpeakerTranslate,
  tf: SpeakerFormat,
): string {
  const countLabel = t(SPEAKER_EXPORT_COUNT_LABEL_KEYS[scope]);
  return [
    tf('transcription.speakerAction.export.headerSpeaker', { name: speakerName }),
    tf('transcription.speakerAction.export.headerCount', { label: countLabel, count: rows.length }),
    '',
    ...rows,
  ].join('\n');
}

export function formatSpeakerExportDone(
  scope: Exclude<SpeakerUnitScope, 'selection'>,
  count: number,
  t: SpeakerTranslate,
  tf: SpeakerFormat,
): string {
  return tf('transcription.speakerAction.done.export', {
    count,
    unit: getSpeakerUnitLabel(scope, t),
  });
}

export function buildSpeakerActionErrorOptions(
  action: SpeakerActionErrorKind,
  error: unknown,
  t: SpeakerTranslate,
  tf: SpeakerFormat,
) {
  const keys = SPEAKER_ACTION_ERROR_KEYS[action];
  return {
    actionLabel: t(SPEAKER_ACTION_ERROR_LABELS[action]),
    i18nKey: keys.fallback,
    conflictI18nKey: keys.conflict,
    fallbackMessage: tf(keys.fallback, { message: getErrorDetail(error) }),
    conflictMessage: t(keys.conflict),
  };
}
