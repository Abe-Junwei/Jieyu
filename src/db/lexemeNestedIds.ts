/**
 * Assign stable ids on a DMLex entry and its senses.
 * Only fills missing or blank ids. Existing ids are kept.
 */
import { DMLEX_RESOURCE_ID_PREFIX } from './dmlexTypes';
import type { LexemeDocType, LexemeEntryDoc, LexemeResourceDoc } from './types';
import { newId } from '../utils/transcriptionFormatters';

function nestedIdOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isLexemeResource(doc: LexemeDocType): doc is LexemeResourceDoc {
  return doc.kind === 'resource';
}

export function isLexemeEntry(doc: LexemeDocType): doc is LexemeEntryDoc {
  if (doc.kind === 'resource') return false;
  const headword = (doc as { entry?: { headword?: unknown } }).entry?.headword;
  return typeof headword === 'string' && headword.length > 0;
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
    entry.id = rowId.length > 0 ? rowId : newId('lex');
    changed = true;
  }
  if (Array.isArray(entry.senses)) {
    for (const sense of entry.senses) {
      if (sense === null || typeof sense !== 'object') continue;
      const row = sense as { id?: unknown };
      if (nestedIdOf(row.id).length > 0) continue;
      row.id = newId('sense');
      changed = true;
    }
  }
  return changed;
}

export function ensureLexemeNestedIds(data: LexemeEntryDoc): LexemeEntryDoc {
  const senses = data.entry.senses?.map((sense) => ({ ...sense }));
  const next: LexemeEntryDoc = {
    ...data,
    entry: {
      ...data.entry,
      ...(senses ? { senses } : {}),
    },
  };
  assignLexemeNestedIdsInPlace(next);
  return next;
}

export function isDmlexResourceId(id: string): boolean {
  return id.startsWith(DMLEX_RESOURCE_ID_PREFIX);
}
