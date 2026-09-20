/**
 * Assign stable nested ids on lexeme senses/forms (LIFT-style sense identity).
 * Only fills missing/blank ids; existing ids are kept.
 */
import { newId } from '../utils/transcriptionFormatters';
import type { LexemeDocType } from './types';

function nestedIdOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

type NestedRow = Record<string, unknown>;

function assignRowId(row: NestedRow, prefix: string): boolean {
  if (nestedIdOf(row.id).length > 0) return false;
  row.id = newId(prefix);
  return true;
}

export function assignLexemeNestedIdsInPlace(lexeme: {
  senses?: unknown;
  forms?: unknown;
}): boolean {
  let changed = false;
  if (Array.isArray(lexeme.senses)) {
    for (const sense of lexeme.senses) {
      if (sense !== null && typeof sense === 'object') {
        if (assignRowId(sense as NestedRow, 'sense')) changed = true;
      }
    }
  }
  if (Array.isArray(lexeme.forms)) {
    for (const form of lexeme.forms) {
      if (form !== null && typeof form === 'object') {
        if (assignRowId(form as NestedRow, 'form')) changed = true;
      }
    }
  }
  return changed;
}

export function ensureLexemeNestedIds(data: LexemeDocType): LexemeDocType {
  const next: LexemeDocType = {
    ...data,
    senses: data.senses.map((sense) => ({ ...sense })),
    ...(data.forms ? { forms: data.forms.map((form) => ({ ...form })) } : {}),
  };
  assignLexemeNestedIdsInPlace(next);
  return next;
}
