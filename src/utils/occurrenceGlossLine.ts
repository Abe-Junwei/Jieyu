import type { UnitTokenDocType } from '../types/jieyuDbDocTypes';
import { pickTranscriptionTextForLanguage } from './transcriptionFormatters';

/** Read-only POS + gloss line for one utterance. Does not write the baseline. */
export function formatOccurrenceGlossLine(
  tokens: readonly UnitTokenDocType[],
  languageId?: string,
): string {
  return [...tokens]
    .sort((a, b) => a.tokenIndex - b.tokenIndex)
    .map((token) => {
      const pos = token.pos?.trim() ?? '';
      const gloss = pickTranscriptionTextForLanguage(token.gloss, languageId);
      return [pos, gloss].filter((part) => part.length > 0).join(' ');
    })
    .filter((part) => part.length > 0)
    .join(' · ');
}

export function occurrenceGlossByUnitId(
  tokens: readonly UnitTokenDocType[],
  languageId?: string,
): Record<string, string> {
  const grouped = new Map<string, UnitTokenDocType[]>();
  for (const token of tokens) {
    const list = grouped.get(token.unitId) ?? [];
    list.push(token);
    grouped.set(token.unitId, list);
  }
  const lines: Record<string, string> = {};
  for (const [unitId, rows] of grouped) {
    const line = formatOccurrenceGlossLine(rows, languageId);
    if (line.length > 0) lines[unitId] = line;
  }
  return lines;
}
