export type AnnotationIgtToken = {
  id: string;
  form: string;
  gloss: string;
  pos: string;
  glossLang: string;
};

export type AnnotationTokenDraft = {
  pos: string;
  gloss: string;
};

export type AnnotationTokenWrite = {
  tokenId: string;
  glossLang: string;
  pos?: string | null;
  gloss?: string | null;
};

import { pickDefaultTranscriptionLangKey } from '../../utils/transcriptionFormatters';

export function resolveAnnotationGlossWriteLang(gloss: Record<string, string> | undefined): string {
  return pickDefaultTranscriptionLangKey(gloss);
}

export function displayedAnnotationTokenFields(
  token: AnnotationIgtToken,
  drafts: Readonly<Record<string, AnnotationTokenDraft>>,
): AnnotationTokenDraft {
  const draft = drafts[token.id];
  if (!draft) {
    return { pos: token.pos, gloss: token.gloss };
  }
  return draft;
}

export function collectDirtyAnnotationTokenWrites(
  tokens: readonly AnnotationIgtToken[],
  drafts: Readonly<Record<string, AnnotationTokenDraft>>,
): AnnotationTokenWrite[] {
  const writes: AnnotationTokenWrite[] = [];
  for (const token of tokens) {
    const draft = drafts[token.id];
    if (!draft) continue;
    const nextPos = draft.pos.trim();
    const nextGloss = draft.gloss.trim();
    const posChanged = nextPos !== token.pos.trim();
    const glossChanged = nextGloss !== token.gloss.trim();
    if (!posChanged && !glossChanged) continue;
    writes.push({
      tokenId: token.id,
      glossLang: token.glossLang,
      ...(posChanged ? { pos: nextPos.length > 0 ? nextPos : null } : {}),
      ...(glossChanged ? { gloss: nextGloss.length > 0 ? nextGloss : null } : {}),
    });
  }
  return writes;
}

export function dropDraftsForTokenIds(
  drafts: Readonly<Record<string, AnnotationTokenDraft>>,
  tokenIds: readonly string[],
): Record<string, AnnotationTokenDraft> {
  if (tokenIds.length === 0) return { ...drafts };
  const drop = new Set(tokenIds);
  const next: Record<string, AnnotationTokenDraft> = {};
  for (const [id, draft] of Object.entries(drafts)) {
    if (!drop.has(id)) next[id] = draft;
  }
  return next;
}
