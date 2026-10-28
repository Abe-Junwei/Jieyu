import { foldSearchText } from '../../utils/searchTextNormalization';

export interface DesktopLexemeListItem {
  id: string;
  headword: string;
  senses: { id: string; label: string }[];
}

export function filterDesktopLexemes<T extends DesktopLexemeListItem>(
  entries: readonly T[],
  query: string,
): T[] {
  const folded = foldSearchText(query.trim());
  if (folded.length === 0) return [...entries];
  return entries.filter(
    (entry) =>
      foldSearchText(entry.headword).includes(folded) ||
      entry.senses.some((sense) => foldSearchText(sense.label).includes(folded)),
  );
}

export function readDesktopLexemeDraft(entry: Record<string, unknown>): {
  headword: string;
  translation: string;
} {
  const headword = typeof entry.headword === 'string' ? entry.headword : '';
  const senses = entry.senses;
  const first = Array.isArray(senses) ? senses[0] : undefined;
  if (typeof first !== 'object' || first === null) return { headword, translation: '' };
  const translations = (first as { headwordTranslations?: unknown }).headwordTranslations;
  const row = Array.isArray(translations) ? translations[0] : undefined;
  const text =
    typeof row === 'object' && row !== null && typeof (row as { text?: unknown }).text === 'string'
      ? (row as { text: string }).text
      : '';
  return { headword, translation: text };
}

export function applyDesktopLexemeDraft(
  entry: Record<string, unknown>,
  headword: string,
  translation: string,
): Record<string, unknown> {
  const nextHeadword = headword.trim();
  const nextTranslation = translation.trim();
  if (nextHeadword.length === 0 || nextTranslation.length === 0) {
    throw new Error('lexeme create is empty');
  }
  const senses = Array.isArray(entry.senses) ? [...entry.senses] : [];
  const first = senses[0];
  const sense =
    typeof first === 'object' && first !== null ? { ...(first as Record<string, unknown>) } : {};
  const existing = sense.headwordTranslations;
  const translations = Array.isArray(existing) ? [...existing] : [];
  const current = translations[0];
  const row =
    typeof current === 'object' && current !== null
      ? { ...(current as Record<string, unknown>), text: nextTranslation }
      : { text: nextTranslation };
  translations[0] = row;
  sense.headwordTranslations = translations;
  const nextSenses = [...senses];
  nextSenses[0] = sense;
  return { ...entry, headword: nextHeadword, senses: nextSenses };
}
