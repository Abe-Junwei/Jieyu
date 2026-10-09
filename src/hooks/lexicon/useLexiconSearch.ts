import { useMemo } from 'react';
import MiniSearch from 'minisearch';
import { foldSearchText } from '../../utils/searchTextNormalization';
import type { LexemeEntryDoc } from '../../db';

type LexiconSearchDocument = {
  id: string;
  lemma: string;
  citation: string;
  gloss: string;
  definition: string;
  language: string;
  lexemeType: string;
  category: string;
  forms: string;
  notes: string;
};

function toSearchDocument(lexeme: LexemeEntryDoc): LexiconSearchDocument {
  const entry = lexeme.entry;
  const senses = entry.senses ?? [];
  return {
    id: lexeme.id,
    lemma: entry.headword,
    citation: entry.homographNumber ?? '',
    gloss: senses
      .flatMap((sense) => sense.headwordTranslations ?? [])
      .map((item) => item.text)
      .join(' '),
    definition: senses
      .flatMap((sense) => [
        ...(sense.definitions ?? []).map((item) => item.text),
        ...(sense.headwordExplanations ?? []).map((item) => item.text),
        ...(sense.examples ?? []).map((item) => item.text),
      ])
      .join(' '),
    language: senses[0]?.headwordTranslations?.[0]?.langCode ?? '',
    lexemeType: (entry.partsOfSpeech ?? []).join(' '),
    category: (entry.labels ?? []).concat(senses.flatMap((sense) => sense.labels ?? [])).join(' '),
    forms: (entry.inflectedForms ?? []).map((form) => form.text).join(' '),
    notes: (lexeme.jieyu?.notes ?? []).map((note) => note.text).join(' '),
  };
}

export function useLexiconSearch(lexemes: LexemeEntryDoc[], query: string): LexemeEntryDoc[] {
  const normalizedQuery = query.trim();

  const index = useMemo(() => {
    const miniSearch = new MiniSearch<LexiconSearchDocument>({
      fields: [
        'lemma',
        'citation',
        'gloss',
        'definition',
        'language',
        'lexemeType',
        'category',
        'forms',
        'notes',
      ],
      storeFields: ['id'],
      // NFC + 小写，NFD / NFC 互相可搜；只影响索引词，不改词条（RADAR-BUG-1）
      // NFC + lower case so NFD / NFC spellings match; index terms only, entries untouched
      processTerm: (term) => foldSearchText(term),
      searchOptions: {
        boost: { lemma: 3, citation: 2, gloss: 1.5 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
    miniSearch.addAll(lexemes.map(toSearchDocument));
    return miniSearch;
  }, [lexemes]);

  return useMemo(() => {
    if (!normalizedQuery) return lexemes;
    const lexemeById = new Map(lexemes.map((lexeme) => [lexeme.id, lexeme]));
    return index
      .search(normalizedQuery)
      .map((result) => lexemeById.get(String(result.id)))
      .filter((lexeme): lexeme is LexemeEntryDoc => Boolean(lexeme));
  }, [index, lexemes, normalizedQuery]);
}
