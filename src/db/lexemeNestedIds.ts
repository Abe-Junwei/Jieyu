/**
 * Assign stable ids on a DMLex entry and its senses.
 * Only fills missing or blank ids. Existing ids are kept.
 */
import { assignLexemeNestedIdsInPlace } from './dmlexNestedIds';
import { DMLEX_RESOURCE_ID_PREFIX } from './dmlexTypes';
import type { LexemeDocType, LexemeEntryDoc, LexemeResourceDoc } from './types';

export { assignLexemeNestedIdsInPlace, withLexemeNestedIds } from './dmlexNestedIds';

export function isLexemeResource(doc: LexemeDocType): doc is LexemeResourceDoc {
  return doc.kind === 'resource';
}

export function isLexemeEntry(doc: LexemeDocType): doc is LexemeEntryDoc {
  if (doc.kind === 'resource') return false;
  const headword = (doc as { entry?: { headword?: unknown } }).entry?.headword;
  return typeof headword === 'string' && headword.length > 0;
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
