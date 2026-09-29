export type AnnotationSurfaceSpan = { startOffset: number; endOffset: number };

export type AnnotationMorphemeDraft = {
  form: string;
  gloss: string;
  spans: string;
};

export type AnnotationIgtMorpheme = {
  id: string;
  tokenId: string;
  form: string;
  gloss: string;
  glossLang: string;
  morphemeIndex: number;
  surfaceParts?: AnnotationSurfaceSpan[];
};

export function formatSurfaceSpans(spans: readonly AnnotationSurfaceSpan[] | undefined): string {
  if (spans === undefined || spans.length === 0) return '';
  return spans.map((span) => `${span.startOffset}-${span.endOffset}`).join(',');
}

/** Empty text clears spans. An ill-formed token returns undefined and is not saved. */
export function parseSurfaceSpans(value: string): AnnotationSurfaceSpan[] | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return [];
  const spans: AnnotationSurfaceSpan[] = [];
  for (const piece of trimmed.split(/[,\s]+/)) {
    if (piece.length === 0) continue;
    const match = /^(\d+)-(\d+)$/.exec(piece);
    if (match === null) return undefined;
    const startOffset = Number(match[1]);
    const endOffset = Number(match[2]);
    if (endOffset <= startOffset) return undefined;
    spans.push({ startOffset, endOffset });
  }
  return spans;
}

export function displayedAnnotationMorphemeFields(
  morph: AnnotationIgtMorpheme,
  drafts: Readonly<Record<string, AnnotationMorphemeDraft>>,
): AnnotationMorphemeDraft {
  const draft = drafts[morph.id];
  if (!draft) {
    return { form: morph.form, gloss: morph.gloss, spans: formatSurfaceSpans(morph.surfaceParts) };
  }
  return { form: draft.form, gloss: draft.gloss, spans: draft.spans };
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
    const currentSpans = formatSurfaceSpans(morph.surfaceParts);
    const nextSpans = (draft.spans ?? currentSpans).trim();
    const formChanged = nextForm !== morph.form.trim();
    const glossChanged = nextGloss !== morph.gloss.trim();
    const spansChanged = nextSpans !== currentSpans;
    if (!formChanged && !glossChanged && !spansChanged) continue;
    const parsedSpans = spansChanged ? parseSurfaceSpans(nextSpans) : morph.surfaceParts;
    if (spansChanged && parsedSpans === undefined) continue;
    const next: AnnotationIgtMorpheme = {
      ...morph,
      form: nextForm,
      gloss: nextGloss,
    };
    if (spansChanged) {
      if (parsedSpans !== undefined && parsedSpans.length > 0) next.surfaceParts = parsedSpans;
      else delete next.surfaceParts;
    }
    writes.push(next);
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

/** Drop only drafts that still match the values sent to save. Keystrokes during save stay. */
export function dropCommittedMorphemeDrafts(
  drafts: Readonly<Record<string, AnnotationMorphemeDraft>>,
  committed: Readonly<Record<string, AnnotationMorphemeDraft>>,
): Record<string, AnnotationMorphemeDraft> {
  const next: Record<string, AnnotationMorphemeDraft> = {};
  for (const [id, draft] of Object.entries(drafts)) {
    const saved = committed[id];
    if (
      saved &&
      saved.form === draft.form &&
      saved.gloss === draft.gloss &&
      saved.spans === draft.spans
    ) {
      continue;
    }
    next[id] = draft;
  }
  return next;
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
