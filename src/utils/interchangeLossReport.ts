/**
 * Shared import-loss codes. Done text is formatted here so import handlers
 * only pass counts and names.
 */

export const INTERCHANGE_LOSS_CODES = [
  'missing-media',
  'unrecognized-time-unit',
  'unmatched-ref',
  'skipped-tier-no-media',
  'dropped-translation',
  'unmapped-field',
  'no-stable-id',
  'replaced-by-id',
  'appended-without-id',
  'guessed-tier',
] as const;

export type InterchangeLossCode = (typeof INTERCHANGE_LOSS_CODES)[number];

export type InterchangeLoss = {
  code: InterchangeLossCode;
  count?: number;
  name?: string;
};

export type InterchangeLossTranslate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

const LOSS_MESSAGE_KEYS: Record<InterchangeLossCode, string> = {
  'missing-media': 'transcription.importExport.importDone.mediaFileMissing',
  'unrecognized-time-unit': 'transcription.importExport.importDone.unrecognizedTimeUnit',
  'unmatched-ref': 'transcription.importExport.importDone.unmatchedRef',
  'skipped-tier-no-media':
    'transcription.importExport.importDone.independentSegmentsSkippedNoMedia',
  'dropped-translation': 'transcription.importExport.importDone.translationsDroppedNoMatch',
  'unmapped-field': 'transcription.importExport.importDone.unmappedField',
  'no-stable-id': 'transcription.importExport.importDone.noStableId',
  'replaced-by-id': 'transcription.importExport.importDone.replacedById',
  'appended-without-id': 'transcription.importExport.importDone.appendedWithoutId',
  'guessed-tier': 'transcription.importExport.importDone.guessedTier',
};

const LIFT_DIAGNOSTIC_NAME_KEYS: Record<string, string> = {
  'extra-headword': 'workspace.lexicon.liftUnmapped.extraHeadword',
  'morph-type': 'workspace.lexicon.liftUnmapped.morphType',
  note: 'workspace.lexicon.liftUnmapped.note',
  reversal: 'workspace.lexicon.liftUnmapped.reversal',
  'import-residue': 'workspace.lexicon.liftUnmapped.importResidue',
  'scientific-name': 'workspace.lexicon.liftUnmapped.scientificName',
  'variant-with-sense': 'workspace.lexicon.liftUnmapped.variantWithSense',
};

const LOSSES_BEFORE_CONSTRAINTS: readonly InterchangeLossCode[] = [
  'skipped-tier-no-media',
  'dropped-translation',
];

const LOSSES_AFTER_HOST_RECOVERY: readonly InterchangeLossCode[] = [
  'missing-media',
  'unrecognized-time-unit',
  'unmatched-ref',
  'unmapped-field',
  'no-stable-id',
  'replaced-by-id',
  'appended-without-id',
  'guessed-tier',
];

export function composeAnnotationImportLosses(input: {
  parserLosses?: readonly InterchangeLoss[];
  missingMediaFilename?: string;
  unmatchedRefCount: number;
  skippedIndependentTierSegmentCount: number;
  droppedTranslationSegmentCount: number;
  appendedWithoutId: boolean;
  appendedCount?: number;
}): InterchangeLoss[] {
  const losses: InterchangeLoss[] = [...(input.parserLosses ?? [])];
  const has = (code: InterchangeLossCode) => losses.some((loss) => loss.code === code);
  if (input.skippedIndependentTierSegmentCount > 0 && !has('skipped-tier-no-media')) {
    losses.push({
      code: 'skipped-tier-no-media',
      count: input.skippedIndependentTierSegmentCount,
    });
  }
  if (input.droppedTranslationSegmentCount > 0 && !has('dropped-translation')) {
    losses.push({ code: 'dropped-translation', count: input.droppedTranslationSegmentCount });
  }
  if (
    input.missingMediaFilename !== undefined &&
    input.missingMediaFilename.length > 0 &&
    !has('missing-media')
  ) {
    losses.push({ code: 'missing-media', name: input.missingMediaFilename });
  }
  if (input.unmatchedRefCount > 0 && !has('unmatched-ref')) {
    losses.push({ code: 'unmatched-ref', count: input.unmatchedRefCount });
  }
  if (input.appendedWithoutId && !has('appended-without-id')) {
    losses.push({
      code: 'appended-without-id',
      ...(input.appendedCount !== undefined ? { count: input.appendedCount } : {}),
    });
  }
  return losses;
}

export function formatInterchangeLossMessage(
  loss: InterchangeLoss,
  translate: InterchangeLossTranslate,
): string {
  const key = LOSS_MESSAGE_KEYS[loss.code];
  if (loss.code === 'missing-media') {
    return translate(key, { filename: loss.name ?? '' });
  }
  if (loss.code === 'unrecognized-time-unit') return translate(key);
  if (loss.code === 'unmapped-field' || loss.code === 'guessed-tier') {
    return translate(key, { name: loss.name ?? '' });
  }
  return translate(key, { count: loss.count ?? 0 });
}

function lossSentences(
  losses: readonly InterchangeLoss[],
  codes: readonly InterchangeLossCode[],
  translate: InterchangeLossTranslate,
): string[] {
  const sentences: string[] = [];
  for (const code of codes) {
    const loss = losses.find((row) => row.code === code);
    if (!loss) continue;
    sentences.push(formatInterchangeLossMessage(loss, translate));
  }
  return sentences;
}

export function formatAnnotationImportDone(input: {
  segmentCount: number;
  tierCount: number;
  losses: readonly InterchangeLoss[];
  constraintRepairCount: number;
  constraintWarningCount: number;
  hostRecoveryWarningCount: number;
  translate: InterchangeLossTranslate;
}): string {
  const translate = input.translate;
  const doneKey =
    input.tierCount > 0
      ? 'transcription.importExport.importDone.segmentsWithLayers'
      : 'transcription.importExport.importDone.segments';
  const doneParams =
    input.tierCount > 0
      ? { count: input.segmentCount, layers: input.tierCount }
      : { count: input.segmentCount };
  return [
    translate(doneKey, doneParams),
    ...lossSentences(input.losses, LOSSES_BEFORE_CONSTRAINTS, translate),
    ...(input.constraintRepairCount > 0
      ? [
          translate('transcription.importExport.importDone.constraintRepaired', {
            count: input.constraintRepairCount,
          }),
        ]
      : []),
    ...(input.constraintWarningCount > 0
      ? [
          translate('transcription.importExport.importDone.constraintWarning', {
            count: input.constraintWarningCount,
          }),
        ]
      : []),
    ...(input.hostRecoveryWarningCount > 0
      ? [
          translate('transcription.importExport.importDone.hostRecoveryWarning', {
            count: input.hostRecoveryWarningCount,
          }),
        ]
      : []),
    ...lossSentences(input.losses, LOSSES_AFTER_HOST_RECOVERY, translate),
  ].join(' ');
}

export function formatLexiconImportNotice(
  diagnostics: readonly { code: string }[],
  losses: readonly InterchangeLoss[],
  translate: InterchangeLossTranslate,
): string {
  const parts: string[] = [];
  if (diagnostics.length > 0) {
    const names = [...new Set(diagnostics.map((row) => row.code))]
      .map((code) => {
        const key = LIFT_DIAGNOSTIC_NAME_KEYS[code];
        return key !== undefined ? translate(key) : code;
      })
      .join(', ');
    parts.push(
      translate('workspace.lexicon.importLiftDiagnostics', {
        count: diagnostics.length,
        names,
      }),
    );
  }
  for (const loss of losses) {
    if (
      loss.code !== 'no-stable-id' &&
      loss.code !== 'replaced-by-id' &&
      loss.code !== 'unmapped-field'
    ) {
      continue;
    }
    parts.push(formatInterchangeLossMessage(loss, translate));
  }
  return parts.join(' ');
}
