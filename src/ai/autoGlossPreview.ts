import type { LexemeDocType, MultiLangString, Transcription, UnitTokenDocType } from '../db';

const MIN_PREFIX_LEN = 2;
const MIN_SUBSTRING_LEN = 3;

export type AutoGlossMatchType = 'exact' | 'stem' | 'gloss_candidate';

const MATCH_CONFIDENCE: Record<AutoGlossMatchType, number> = {
  exact: 1.0,
  stem: 0.75,
  gloss_candidate: 0.5,
};

export type AutoGlossPreviewMatch = {
  tokenId: string;
  tokenForm: Transcription;
  lexemeId: string;
  lexemeLemma: Transcription;
  gloss: MultiLangString;
  confidence: number;
  matchType: AutoGlossMatchType;
};

export type AutoGlossPreviewResult = {
  matches: AutoGlossPreviewMatch[];
  skipped: number;
  total: number;
};

type LexemeIndexEntry = {
  lexeme: LexemeDocType;
  values: string[];
};

type LexemeIndex = {
  exactMap: Map<string, LexemeDocType>;
  entries: LexemeIndexEntry[];
};

type MatchResult = {
  lexeme: LexemeDocType;
  matchType: AutoGlossMatchType;
  confidence: number;
  overlap: number;
};

export function tokenHasGloss(token: Pick<UnitTokenDocType, 'gloss'>): boolean {
  if (!token.gloss) return false;
  return Object.values(token.gloss).some((value) => value.trim().length > 0);
}

export function buildLexemeIndex(lexemes: readonly LexemeDocType[]): LexemeIndex {
  const exactMap = new Map<string, LexemeDocType>();
  const entries: LexemeIndexEntry[] = [];

  for (const lex of lexemes) {
    const values: string[] = [];
    for (const val of Object.values(lex.lemma)) {
      const key = val.toLowerCase();
      values.push(key);
      if (!exactMap.has(key)) exactMap.set(key, lex);
    }
    if (lex.forms) {
      for (const form of lex.forms) {
        for (const val of Object.values(form.transcription)) {
          const key = val.toLowerCase();
          values.push(key);
          if (!exactMap.has(key)) exactMap.set(key, lex);
        }
      }
    }
    entries.push({ lexeme: lex, values });
  }

  return { exactMap, entries };
}

function findExactMatch(
  formValues: string[],
  exactMap: Map<string, LexemeDocType>,
): MatchResult | undefined {
  for (const fv of formValues) {
    const lex = exactMap.get(fv);
    if (lex) {
      return {
        lexeme: lex,
        matchType: 'exact',
        confidence: MATCH_CONFIDENCE.exact,
        overlap: fv.length,
      };
    }
  }
  return undefined;
}

function findPrefixMatch(
  formValues: string[],
  entries: LexemeIndexEntry[],
): MatchResult | undefined {
  let best: MatchResult | undefined;
  for (const entry of entries) {
    for (const fv of formValues) {
      for (const lv of entry.values) {
        if (lv.length < MIN_PREFIX_LEN || fv.length <= lv.length) continue;
        if (fv.startsWith(lv) && (!best || lv.length > best.overlap)) {
          best = {
            lexeme: entry.lexeme,
            matchType: 'stem',
            confidence: MATCH_CONFIDENCE.stem,
            overlap: lv.length,
          };
        }
      }
    }
  }
  return best;
}

function findSubstringMatch(
  formValues: string[],
  entries: LexemeIndexEntry[],
): MatchResult | undefined {
  let best: MatchResult | undefined;
  for (const entry of entries) {
    for (const fv of formValues) {
      for (const lv of entry.values) {
        const shorter = fv.length <= lv.length ? fv : lv;
        const longer = fv.length <= lv.length ? lv : fv;
        if (shorter.length < MIN_SUBSTRING_LEN) continue;
        if (shorter.length === longer.length) continue;
        if (longer.startsWith(shorter)) continue;
        if (longer.includes(shorter) && (!best || shorter.length > best.overlap)) {
          best = {
            lexeme: entry.lexeme,
            matchType: 'gloss_candidate',
            confidence: MATCH_CONFIDENCE.gloss_candidate,
            overlap: shorter.length,
          };
        }
      }
    }
  }
  return best;
}

export function previewAutoGlossMatches(
  tokens: readonly UnitTokenDocType[],
  lexemes: readonly LexemeDocType[],
  skipTokenIds?: ReadonlySet<string>,
): AutoGlossPreviewResult {
  const { exactMap, entries } = buildLexemeIndex(lexemes);
  const matches: AutoGlossPreviewMatch[] = [];
  let skipped = 0;

  for (const token of tokens) {
    if (skipTokenIds?.has(token.id) || tokenHasGloss(token)) {
      skipped += 1;
      continue;
    }
    const formValues = Object.values(token.form).map((value) => value.toLowerCase());
    const best =
      findExactMatch(formValues, exactMap) ??
      findPrefixMatch(formValues, entries) ??
      findSubstringMatch(formValues, entries);
    if (!best || best.lexeme.senses.length === 0) continue;
    const gloss = best.lexeme.senses[0]!.gloss;
    if (Object.keys(gloss).length === 0) continue;
    matches.push({
      tokenId: token.id,
      tokenForm: token.form,
      lexemeId: best.lexeme.id,
      lexemeLemma: best.lexeme.lemma,
      gloss,
      confidence: best.confidence,
      matchType: best.matchType,
    });
  }

  return { matches, skipped, total: tokens.length };
}
