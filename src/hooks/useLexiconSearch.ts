import { useMemo } from 'react';
import MiniSearch from 'minisearch';
import type { LexemeDocType } from '../db';

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

function joinValues(record: Record<string, string> | undefined): string {
  return Object.values(record ?? {})
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ');
}

function toSearchDocument(lexeme: LexemeDocType): LexiconSearchDocument {
  return {
    id: lexeme.id,
    lemma: joinValues(lexeme.lemma),
    citation: lexeme.citationForm ?? '',
    gloss: lexeme.senses.map((sense) => joinValues(sense.gloss)).join(' '),
    definition: lexeme.senses.map((sense) => joinValues(sense.definition)).join(' '),
    language: lexeme.language ?? '',
    lexemeType: lexeme.lexemeType ?? '',
    category: lexeme.senses.map((sense) => sense.category ?? '').join(' '),
    forms: (lexeme.forms ?? []).map((form) => joinValues(form.transcription)).join(' '),
    notes: joinValues(lexeme.notes),
  };
}

export function useLexiconSearch(lexemes: LexemeDocType[], query: string): LexemeDocType[] {
  const normalizedQuery = query.trim();

  const index = useMemo(() => {
    const miniSearch = new MiniSearch<LexiconSearchDocument>({
      fields: ['lemma', 'citation', 'gloss', 'definition', 'language', 'lexemeType', 'category', 'forms', 'notes'],
      storeFields: ['id'],
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
    return index.search(normalizedQuery)
      .map((result) => lexemeById.get(String(result.id)))
      .filter((lexeme): lexeme is LexemeDocType => Boolean(lexeme));
  }, [index, lexemes, normalizedQuery]);
}
