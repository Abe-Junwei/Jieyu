/**
 * Whole-dictionary DMLex JSON download. The file is one lexicographicResource
 * with entries embedded. Jieyu notes and example refs stay out of the document.
 */
import type { DmlexEntry, DmlexLexicographicResource } from '../db/dmlexTypes';
import type { LexemeEntryDoc, LexemeResourceDoc } from '../db/types';
import { DEFAULT_TRANSLATION_LANG } from './dmlexEntry';

export const DMLEX_JSON_MIME = 'application/json';
export const DMLEX_JSON_FILENAME = 'jieyu-lexicon.dmlex.json';

export type DmlexJsonDocument = DmlexLexicographicResource & {
  entries: DmlexEntry[];
};

export type DmlexJsonExportResult =
  | { ok: true; json: string }
  | { ok: false; reason: 'empty' | 'download-unavailable' };

function addLang(langs: Set<string>, langCode: string | undefined): void {
  const trimmed = langCode?.trim() ?? '';
  if (trimmed.length > 0) langs.add(trimmed);
}

export function serializeLexemesToDmlex(
  lexemes: readonly LexemeEntryDoc[],
  resource: LexemeResourceDoc | null,
): DmlexJsonDocument {
  const stored = resource?.resource;
  const langs = new Set<string>(stored?.translationLanguages ?? []);
  for (const lexeme of lexemes) {
    for (const sense of lexeme.entry.senses ?? []) {
      for (const item of sense.headwordTranslations ?? []) addLang(langs, item.langCode);
      for (const item of sense.headwordExplanations ?? []) addLang(langs, item.langCode);
      for (const example of sense.examples ?? []) {
        for (const item of example.exampleTranslations ?? []) addLang(langs, item.langCode);
      }
    }
  }
  if (langs.size === 0) langs.add(DEFAULT_TRANSLATION_LANG);
  const relations = stored?.relations ?? [];
  const relationTypes = stored?.relationTypes ?? [];
  const title = stored?.title ?? '';
  const langCode = stored?.langCode.trim() ?? '';
  return {
    langCode: langCode.length > 0 ? langCode : 'und',
    translationLanguages: [...langs],
    entries: lexemes.map((lexeme) => lexeme.entry),
    ...(title.length > 0 ? { title } : {}),
    ...(relations.length > 0 ? { relations } : {}),
    ...(relationTypes.length > 0 ? { relationTypes } : {}),
  };
}

export function downloadLexiconDmlex(json: string): DmlexJsonExportResult {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return { ok: false, reason: 'download-unavailable' };
  }
  const blob = new Blob([json], { type: DMLEX_JSON_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = DMLEX_JSON_FILENAME;
  link.click();
  URL.revokeObjectURL(url);
  return { ok: true, json };
}

export function exportLexemesAsDmlex(
  lexemes: readonly LexemeEntryDoc[],
  resource: LexemeResourceDoc | null,
): DmlexJsonExportResult {
  if (lexemes.length === 0) return { ok: false, reason: 'empty' };
  const json = `${JSON.stringify(serializeLexemesToDmlex(lexemes, resource), null, 2)}\n`;
  return downloadLexiconDmlex(json);
}
