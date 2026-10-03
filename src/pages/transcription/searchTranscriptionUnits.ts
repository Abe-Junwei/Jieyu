import {
  comparableForm,
  type CharacterVariantGroup,
} from '../annotation/annotationCharacterVariants';
import {
  filterAnnotationUnits,
  type AnnotationSearchMode,
} from '../annotation/annotationRowSearch';

export type TranscriptionSearchRow = {
  id: string;
  surface: string;
  ungrammatical?: boolean;
  startTime: number;
  endTime: number;
};

export type TranscriptionSearchHit = {
  unitId: string;
  sentence: string;
  match: string;
  startTime: number;
  endTime: number;
};

export function searchTranscriptionUnits(
  rows: readonly TranscriptionSearchRow[],
  input: {
    query: string;
    mode: AnnotationSearchMode;
    excludeUngrammatical: boolean;
    wordFormsByUnit: ReadonlyMap<string, readonly string[]>;
    morphemeFormsByUnit: ReadonlyMap<string, readonly string[]>;
    variantGroups?: readonly CharacterVariantGroup[];
  },
): TranscriptionSearchHit[] {
  const groups = input.variantGroups ?? [];
  const query = comparableForm(input.query.trim(), groups);
  if (query.length === 0) return [];
  return filterAnnotationUnits(rows, input).map((row) => {
    const forms =
      input.mode === 'word'
        ? input.wordFormsByUnit.get(row.id)
        : input.mode === 'morpheme'
          ? input.morphemeFormsByUnit.get(row.id)
          : undefined;
    const match = (forms ?? []).find((form) => comparableForm(form, groups).includes(query)) ?? '';
    return {
      unitId: row.id,
      sentence: row.surface,
      match,
      startTime: row.startTime,
      endTime: row.endTime,
    };
  });
}
