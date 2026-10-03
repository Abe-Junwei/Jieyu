import type { CharacterVariantGroup } from './annotationCharacterVariants';
import {
  collectBlankSameFormGlossWrites,
  type SameFormGlossToken,
} from './annotationGlossSuggestion';

export function collectAnnotationGlossByFormWrites(
  source: {
    rows: readonly {
      id: string;
      tokens: readonly {
        id: string;
        form: string;
        gloss: string;
        pos: string;
        glossLang: string;
        reviewStatus?: string;
      }[];
    }[];
    drafts: Readonly<Record<string, { gloss: string; pos: string } | undefined>>;
    linksByTokenId: Readonly<Record<string, unknown>>;
    morphsByTokenId: Readonly<Record<string, readonly { form: string }[] | undefined>>;
    groups: readonly CharacterVariantGroup[];
  },
  sourceTokenId: string,
  gloss: string,
): ReturnType<typeof collectBlankSameFormGlossWrites> {
  const tokens: SameFormGlossToken[] = source.rows.flatMap((row) =>
    row.tokens.map((token) => ({
      id: token.id,
      unitId: row.id,
      form: token.form,
      gloss: token.gloss,
      pos: token.pos,
      glossLang: token.glossLang,
      hasLink: source.linksByTokenId[token.id] !== undefined,
      morphForms: (source.morphsByTokenId[token.id] ?? []).map((morph) => morph.form),
      ...(token.reviewStatus ? { reviewStatus: token.reviewStatus } : {}),
    })),
  );
  const dirtyTokenIds = new Set(
    tokens
      .filter((token) => {
        const draft = source.drafts[token.id];
        if (!draft) return false;
        return draft.gloss.trim() !== token.gloss.trim() || draft.pos.trim() !== token.pos.trim();
      })
      .map((token) => token.id),
  );
  return collectBlankSameFormGlossWrites({
    tokens,
    sourceTokenId,
    gloss,
    groups: source.groups,
    dirtyTokenIds,
  });
}
