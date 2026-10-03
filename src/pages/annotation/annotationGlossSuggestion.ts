import { foldCharacterVariants, type CharacterVariantGroup } from './annotationCharacterVariants';

export type GlossSuggestionToken = {
  id: string;
  form: string;
  gloss: string;
  reviewStatus?: string;
  senseGloss?: string;
  linkReviewStatus?: string;
};

export type SameFormGlossToken = GlossSuggestionToken & {
  unitId: string;
  pos: string;
  glossLang: string;
  hasLink: boolean;
  morphForms: readonly string[];
};

function formKey(form: string, groups: readonly CharacterVariantGroup[]): string {
  return foldCharacterVariants(form.trim(), groups);
}

/** Unique highest count, and more than half of the non-empty values. Ties return null. */
export function majorityGloss(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  let total = 0;
  for (const value of values) {
    const gloss = value.trim();
    if (!gloss) continue;
    total += 1;
    counts.set(gloss, (counts.get(gloss) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  let tied = false;
  for (const [gloss, count] of counts) {
    if (count > bestCount) {
      best = gloss;
      bestCount = count;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }
  if (!best || tied || bestCount * 2 <= total) return null;
  return best;
}

function sameFormOthers(
  tokens: readonly GlossSuggestionToken[],
  tokenId: string,
  groups: readonly CharacterVariantGroup[],
): GlossSuggestionToken[] {
  const token = tokens.find((item) => item.id === tokenId);
  if (!token || token.gloss.trim().length > 0) return [];
  const key = formKey(token.form, groups);
  if (!key) return [];
  return tokens.filter((item) => item.id !== tokenId && formKey(item.form, groups) === key);
}

function countable(token: GlossSuggestionToken): boolean {
  return token.reviewStatus !== 'suggested' && token.linkReviewStatus !== 'suggested';
}

/** Confirmed sense gloss, then human gloss majority, then a unanimous unconfirmed sense. */
export function glossSuggestionForToken(
  tokens: readonly GlossSuggestionToken[],
  tokenId: string,
  groups: readonly CharacterVariantGroup[] = [],
): string | null {
  const others = sameFormOthers(tokens, tokenId, groups).filter(countable);
  const confirmed = others
    .filter((item) => item.linkReviewStatus === 'confirmed')
    .map((item) => item.senseGloss ?? '');
  if (confirmed.some((value) => value.trim().length > 0)) return majorityGloss(confirmed);
  const human = majorityGloss(
    others.filter((item) => item.gloss.trim().length > 0).map((item) => item.gloss),
  );
  if (human) return human;
  return majorityGloss(
    others
      .filter((item) => item.linkReviewStatus !== 'confirmed')
      .map((item) => item.senseGloss ?? ''),
  );
}

export function isBlankSameFormToken(
  token: SameFormGlossToken,
  groups: readonly CharacterVariantGroup[] = [],
): boolean {
  if (token.gloss.trim().length > 0 || token.pos.trim().length > 0 || token.hasLink) return false;
  if (token.morphForms.length > 1) return false;
  const only = token.morphForms[0];
  if (only === undefined) return true;
  return formKey(only, groups) === formKey(token.form, groups);
}

/** Explicit “apply this gloss” touches blank same-form words only. It does not copy links. */
export function collectBlankSameFormGlossWrites(input: {
  tokens: readonly SameFormGlossToken[];
  sourceTokenId: string;
  gloss: string;
  groups?: readonly CharacterVariantGroup[];
  dirtyTokenIds?: ReadonlySet<string>;
}): Array<{ unitId: string; tokenId: string; gloss: string; glossLang: string }> {
  const gloss = input.gloss.trim();
  const source = input.tokens.find((token) => token.id === input.sourceTokenId);
  if (!source || gloss.length === 0) return [];
  const groups = input.groups ?? [];
  const key = formKey(source.form, groups);
  if (!key) return [];
  return input.tokens
    .filter(
      (token) =>
        token.id !== source.id &&
        formKey(token.form, groups) === key &&
        !input.dirtyTokenIds?.has(token.id) &&
        isBlankSameFormToken(token, groups),
    )
    .map((token) => ({
      unitId: token.unitId,
      tokenId: token.id,
      gloss,
      glossLang: token.glossLang,
    }));
}

export function buildAnnotationGlossSuggestions(
  rows: readonly {
    tokens: readonly {
      id: string;
      form: string;
      gloss: string;
      reviewStatus?: string;
    }[];
  }[],
  linksByTokenId: Readonly<
    Record<string, { senseGloss?: string; linkReviewStatus?: string } | undefined>
  >,
  groups: readonly CharacterVariantGroup[],
): Record<string, string> {
  const tokens = rows.flatMap((row) =>
    row.tokens.map((token) => {
      const link = linksByTokenId[token.id];
      return {
        id: token.id,
        form: token.form,
        gloss: token.gloss,
        ...(token.reviewStatus ? { reviewStatus: token.reviewStatus } : {}),
        ...(link?.senseGloss ? { senseGloss: link.senseGloss } : {}),
        ...(link?.linkReviewStatus ? { linkReviewStatus: link.linkReviewStatus } : {}),
      };
    }),
  );
  const suggestions: Record<string, string> = {};
  for (const token of tokens) {
    const suggestion = glossSuggestionForToken(tokens, token.id, groups);
    if (suggestion) suggestions[token.id] = suggestion;
  }
  return suggestions;
}
