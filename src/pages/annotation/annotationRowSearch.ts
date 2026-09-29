export type AnnotationSearchMode = 'surface' | 'word' | 'morpheme';

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
  },
): T[] {
  const query = input.query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (input.excludeUngrammatical && row.ungrammatical) return false;
    if (!query) return true;
    if (input.mode === 'surface') return row.surface.toLocaleLowerCase().includes(query);
    const forms =
      input.mode === 'word'
        ? input.wordFormsByUnit.get(row.id)
        : input.morphemeFormsByUnit.get(row.id);
    return (forms ?? []).some((form) => form.toLocaleLowerCase().includes(query));
  });
}
