export type AnnotationMorphemeDraft = {
  form: string;
  gloss: string;
};

export type AnnotationIgtMorpheme = {
  id: string;
  tokenId: string;
  form: string;
  gloss: string;
  glossLang: string;
  morphemeIndex: number;
};

export function displayedAnnotationMorphemeFields(
  morph: AnnotationIgtMorpheme,
  drafts: Readonly<Record<string, AnnotationMorphemeDraft>>,
): AnnotationMorphemeDraft {
  const draft = drafts[morph.id];
  if (!draft) {
    return { form: morph.form, gloss: morph.gloss };
  }
  return draft;
}

export function collectDirtyAnnotationMorphemeWrites(
  morphs: readonly AnnotationIgtMorpheme[],
  drafts: Readonly<Record<string, AnnotationMorphemeDraft>>,
): AnnotationIgtMorpheme[] {
  const writes: AnnotationIgtMorpheme[] = [];
  for (const morph of morphs) {
    const draft = drafts[morph.id];
    if (!draft) continue;
    const nextForm = draft.form.trim();
    const nextGloss = draft.gloss.trim();
    if (nextForm === morph.form.trim() && nextGloss === morph.gloss.trim()) continue;
    writes.push({
      ...morph,
      form: nextForm,
      gloss: nextGloss,
    });
  }
  return writes;
}

export function planMorphemeFormsFromToken(form: string): string[] {
  const parts = form
    .split(/[-=]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length >= 2 ? parts : [];
}

export function dropMorphemeDraftsForIds(
  drafts: Readonly<Record<string, AnnotationMorphemeDraft>>,
  ids: readonly string[],
): Record<string, AnnotationMorphemeDraft> {
  if (ids.length === 0) return { ...drafts };
  const drop = new Set(ids);
  const next: Record<string, AnnotationMorphemeDraft> = {};
  for (const [id, draft] of Object.entries(drafts)) {
    if (!drop.has(id)) next[id] = draft;
  }
  return next;
}
