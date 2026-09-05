import { db } from '../db';

export const CITATION_BROKEN_CODE = {
  unitNotFound: 'CITATION_UNIT_NOT_FOUND',
  noteNotFound: 'CITATION_NOTE_NOT_FOUND',
  schemaNotFound: 'CITATION_SCHEMA_NOT_FOUND',
  pdfNotFound: 'CITATION_PDF_NOT_FOUND',
  lexemeNotFound: 'CITATION_LEXEME_NOT_FOUND',
} as const;

export type CitationBrokenCode = (typeof CITATION_BROKEN_CODE)[keyof typeof CITATION_BROKEN_CODE];

export type UnitCitationResolveResult =
  | { kind: 'ok'; type: 'unit'; unitId: string }
  | { kind: 'broken'; type: 'unit'; code: typeof CITATION_BROKEN_CODE.unitNotFound };

export const CITATION_BROKEN_MESSAGE_KEY = {
  [CITATION_BROKEN_CODE.unitNotFound]: 'transcription.citation.unitNotFound',
  [CITATION_BROKEN_CODE.noteNotFound]: 'transcription.citation.noteNotFound',
  [CITATION_BROKEN_CODE.schemaNotFound]: 'transcription.citation.schemaNotFound',
  [CITATION_BROKEN_CODE.pdfNotFound]: 'transcription.citation.pdfTargetNotFound',
  [CITATION_BROKEN_CODE.lexemeNotFound]: 'workspace.annotation.lexemeBroken',
} as const;

/**
 * Live unit citations must hit canonical `layer_units`. Leftover segment rows
 * (best-effort segment_meta delay) must not revive a deleted unit id.
 */
export async function resolveUnitCitation(unitId: string): Promise<UnitCitationResolveResult> {
  const id = unitId.trim();
  if (!id) {
    return { kind: 'broken', type: 'unit', code: CITATION_BROKEN_CODE.unitNotFound };
  }
  const row = await db.layer_units.get(id);
  if (!row || row.unitType === 'segment') {
    return { kind: 'broken', type: 'unit', code: CITATION_BROKEN_CODE.unitNotFound };
  }
  return { kind: 'ok', type: 'unit', unitId: row.id };
}

export function presentTokenLexemeLink(input: {
  linkId: string;
  lexemeId: string;
  lemma?: string | undefined;
}): {
  linkId: string;
  lexemeId: string;
  lemma: string;
  brokenCode?: typeof CITATION_BROKEN_CODE.lexemeNotFound;
} {
  const lemma = input.lemma?.trim() ?? '';
  if (!lemma) {
    return {
      linkId: input.linkId,
      lexemeId: input.lexemeId,
      lemma: '',
      brokenCode: CITATION_BROKEN_CODE.lexemeNotFound,
    };
  }
  return { linkId: input.linkId, lexemeId: input.lexemeId, lemma };
}
