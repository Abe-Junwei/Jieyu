import { foldCharacterVariants, type CharacterVariantGroup } from './annotationCharacterVariants';

export type GlossSuggestionToken = {
  id: string;
  form: string;
  gloss: string;
  reviewStatus?: string;
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

export function glossSuggestionForToken(
  tokens: readonly GlossSuggestionToken[],
  tokenId: string,
  groups: readonly CharacterVariantGroup[] = [],
): string | null {
  const token = tokens.find((item) => item.id === tokenId);
  if (!token || token.gloss.trim().length > 0) return null;
  const key = formKey(token.form, groups);
  if (!key) return null;
  const precedents = tokens.filter(
    (item) =>
      item.id !== tokenId &&
      formKey(item.form, groups) === key &&
      item.gloss.trim().length > 0 &&
      item.reviewStatus !== 'suggested',
  );
  return majorityGloss(precedents.map((item) => item.gloss));
}
