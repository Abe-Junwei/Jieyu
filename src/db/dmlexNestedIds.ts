/**
 * Fill blank DMLex entry and sense ids. Existing ids stay.
 * The id shape matches transcriptionFormatters.newId. This file stays free of
 * the language-name tables so the desktop writer can import it.
 */

function nestedId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nestedIdOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function assignLexemeNestedIdsInPlace(lexeme: {
  id?: unknown;
  kind?: unknown;
  entry?: { id?: unknown; senses?: unknown };
}): boolean {
  if (lexeme.kind === 'resource') return false;
  const entry = lexeme.entry;
  if (!entry || typeof entry !== 'object') return false;
  let changed = false;
  if (nestedIdOf(entry.id).length === 0) {
    const rowId = nestedIdOf(lexeme.id);
    entry.id = rowId.length > 0 ? rowId : nestedId('lex');
    changed = true;
  }
  if (Array.isArray(entry.senses)) {
    for (const sense of entry.senses) {
      if (sense === null || typeof sense !== 'object') continue;
      const row = sense as { id?: unknown };
      if (nestedIdOf(row.id).length > 0) continue;
      row.id = nestedId('sense');
      changed = true;
    }
  }
  return changed;
}

function lexemeNeedsNestedIds(lexeme: {
  kind?: unknown;
  entry?: { id?: unknown; senses?: unknown };
}): boolean {
  if (lexeme.kind === 'resource') return false;
  const entry = lexeme.entry;
  if (!entry || typeof entry !== 'object') return false;
  if (nestedIdOf(entry.id).length === 0) return true;
  if (!Array.isArray(entry.senses)) return false;
  return entry.senses.some(
    (sense) =>
      sense !== null &&
      typeof sense === 'object' &&
      nestedIdOf((sense as { id?: unknown }).id).length === 0,
  );
}

/** Returns the same reference when nothing is missing. */
export function withLexemeNestedIds<T>(doc: T): T {
  if (doc === null || typeof doc !== 'object') return doc;
  const lexeme = doc as { kind?: unknown; entry?: { id?: unknown; senses?: unknown } };
  if (!lexemeNeedsNestedIds(lexeme)) return doc;
  const entry = lexeme.entry as { senses?: unknown };
  const senses = Array.isArray(entry.senses)
    ? entry.senses.map((sense: unknown) =>
        sense !== null && typeof sense === 'object' ? { ...(sense as object) } : sense,
      )
    : undefined;
  const next = {
    ...(doc as object),
    entry: { ...entry, ...(senses ? { senses } : {}) },
  } as typeof lexeme;
  assignLexemeNestedIdsInPlace(next);
  return next as T;
}
