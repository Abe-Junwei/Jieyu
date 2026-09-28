import type {
  LexemeDocType,
  LexemeEntryDoc,
  MultiLangString,
  Transcription,
  UnitTokenDocType,
} from '../db';
import { isLexemeEntry } from '../db/lexemeNestedIds';
import { lexemeGlossProjection, lexemeMatchValues } from '../utils/dmlexEntry';

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
  senseId?: string;
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
  lexeme: LexemeEntryDoc;
  values: string[];
};

type LexemeIndex = {
  exactMap: Map<string, LexemeEntryDoc>;
  entries: LexemeIndexEntry[];
};

type MatchResult = {
  lexeme: LexemeEntryDoc;
  matchType: AutoGlossMatchType;
  confidence: number;
  overlap: number;
};

export function tokenHasGloss(token: Pick<UnitTokenDocType, 'gloss'>): boolean {
  if (!token.gloss) return false;
  return Object.values(token.gloss).some((value) => value.trim().length > 0);
}

export function buildLexemeIndex(lexemes: readonly LexemeDocType[]): LexemeIndex {
  const exactMap = new Map<string, LexemeEntryDoc>();
  const entries: LexemeIndexEntry[] = [];

  for (const lex of lexemes) {
    if (!isLexemeEntry(lex)) continue;
    const values = lexemeMatchValues(lex);
    for (const key of values) {
      if (!exactMap.has(key)) exactMap.set(key, lex);
    }
    entries.push({ lexeme: lex, values });
  }

  return { exactMap, entries };
}

function findExactMatch(
  formValues: string[],
  exactMap: Map<string, LexemeEntryDoc>,
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
    if (!best) continue;
    const gloss = lexemeGlossProjection(best.lexeme);
    if (Object.keys(gloss).length === 0) continue;
    matches.push({
      tokenId: token.id,
      tokenForm: token.form,
      lexemeId: best.lexeme.id,
      ...(best.lexeme.entry.senses?.[0]?.id ? { senseId: best.lexeme.entry.senses[0].id } : {}),
      lexemeLemma: { default: best.lexeme.entry.headword },
      gloss,
      confidence: best.confidence,
      matchType: best.matchType,
    });
  }

  return { matches, skipped, total: tokens.length };
}
