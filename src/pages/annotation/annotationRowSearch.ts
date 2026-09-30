import { comparableForm, type CharacterVariantGroup } from './annotationCharacterVariants';

export type AnnotationSearchMode = 'surface' | 'word' | 'morpheme';

export function foldSearchText(value: string): string {
  return comparableForm(value);
}

export function filterAnnotationUnits<
  T extends { id: string; surface: string; ungrammatical?: boolean },
>(
  rows: readonly T[],
  input: {
    query: string;
    mode: AnnotationSearchMode;
    excludeUngrammatical: boolean;
    wordFormsByUnit: ReadonlyMap<string, readonly string[]>;
    morphemeFormsByUnit: ReadonlyMap<string, readonly string[]>;
    variantGroups?: readonly CharacterVariantGroup[];
  },
): T[] {
  const groups = input.variantGroups ?? [];
  const query = comparableForm(input.query.trim(), groups);
  return rows.filter((row) => {
    if (input.excludeUngrammatical && row.ungrammatical === true) return false;
    if (query.length === 0) return true;
    if (input.mode === 'surface') return comparableForm(row.surface, groups).includes(query);
    const forms =
      input.mode === 'word'
        ? input.wordFormsByUnit.get(row.id)
        : input.morphemeFormsByUnit.get(row.id);
    return (forms ?? []).some((form) => comparableForm(form, groups).includes(query));
  });
}

export function searchVisibleAnnotationRows<
  T extends {
    id: string;
    surface: string;
    ungrammatical?: boolean;
    tokens: readonly { id: string; form: string }[];
  },
>(
  rows: readonly T[],
  input: {
    query: string;
    mode: AnnotationSearchMode;
    excludeUngrammatical: boolean;
    variantGroups?: readonly CharacterVariantGroup[];
    morphsByTokenId: Readonly<Record<string, readonly { form: string }[] | undefined>>;
  },
): T[] {
  const wordFormsByUnit = new Map(
    rows.map((row) => [row.id, row.tokens.map((token) => token.form)] as const),
  );
  const morphemeFormsByUnit = new Map(
    rows.map((row) => [
      row.id,
      row.tokens.flatMap((token) =>
        (input.morphsByTokenId[token.id] ?? []).map((morph) => morph.form),
      ),
    ]),
  );
  return filterAnnotationUnits(rows, {
    query: input.query,
    mode: input.mode,
    excludeUngrammatical: input.excludeUngrammatical,
    wordFormsByUnit,
    morphemeFormsByUnit,
    ...(input.variantGroups ? { variantGroups: input.variantGroups } : {}),
  });
}
