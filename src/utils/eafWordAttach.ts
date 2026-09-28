import { glossLanguageKey } from './eafImportAlign';
import {
  isEafMorphTier,
  linkAnnotationsToUnits,
  morphDescendantSlot,
  retargetAnnotationsToChildIds,
  type EafPickAnnotation,
  type EafPickedUnit,
} from './eafTierPick';

type WordToken = {
  form: Record<string, string>;
  gloss?: Record<string, string>;
  pos?: string;
  lexemeId?: string;
  morphemes?: Array<{
    form: Record<string, string>;
    gloss?: Record<string, string>;
    pos?: string;
    lexemeId?: string;
  }>;
};

type WordHost = EafPickedUnit & { tokens?: WordToken[] };

type WordChild = {
  tierId: string;
  eafConstraint?: string;
  field?: 'gloss' | 'pos' | 'morph-form';
  anns: EafPickAnnotation[];
};

type MorphDraft = {
  form: string;
  gloss?: string;
  glossLang?: string;
  pos?: string;
  lexemeId?: string;
};

function filled(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function glossRecord(lang: string, text: string): Record<string, string> {
  return { [glossLanguageKey(lang)]: text };
}

function orderByPreviousAnnotation<T extends EafPickAnnotation>(rows: readonly T[]): T[] {
  if (!rows.some((row) => filled(row.previousAnnotationId))) return [...rows];
  const byPrevious = new Map<string, T>();
  for (const row of rows) {
    if (filled(row.previousAnnotationId)) byPrevious.set(row.previousAnnotationId, row);
  }
  const heads = rows.filter(
    (row) =>
      !filled(row.previousAnnotationId) ||
      !rows.some((other) => other.annotationId === row.previousAnnotationId),
  );
  const ordered: T[] = [];
  const seen = new Set<T>();
  for (const head of heads) {
    let current: T | undefined = head;
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      ordered.push(current);
      const id: string | undefined = current.annotationId;
      current = filled(id) ? byPrevious.get(id) : undefined;
    }
  }
  for (const row of rows) {
    if (!seen.has(row)) ordered.push(row);
  }
  return ordered;
}

const TIME_SLOP_SEC = 0.05;

function hostAnnotationId(
  ann: EafPickAnnotation,
  hosts: readonly EafPickAnnotation[],
): string | undefined {
  if (filled(ann.annotationRef)) return ann.annotationRef;
  let bestId: string | undefined;
  let bestSpan = Number.POSITIVE_INFINITY;
  for (const host of hosts) {
    if (!filled(host.annotationId)) continue;
    if (ann.startTime < host.startTime - TIME_SLOP_SEC) continue;
    if (ann.endTime > host.endTime + TIME_SLOP_SEC) continue;
    const span = host.endTime - host.startTime;
    if (span < bestSpan) {
      bestId = host.annotationId;
      bestSpan = span;
    }
  }
  return bestId;
}

function applyWordTokens(
  units: WordHost[],
  wordTierAnns: EafPickAnnotation[],
  glossByWordAnnId: Map<string, { text: string; lang: string }>,
  posByWordAnnId: Map<string, string>,
  morphsByWordAnnId: Map<string, MorphDraft[]>,
): void {
  const byParent = new Map<string, EafPickAnnotation[]>();
  for (const ann of wordTierAnns) {
    if (!filled(ann.annotationRef) || ann.text.trim().length === 0) continue;
    const list = byParent.get(ann.annotationRef) ?? [];
    list.push(ann);
    byParent.set(ann.annotationRef, list);
  }

  for (const unit of units) {
    if (!filled(unit.annotationId)) continue;
    const wordAnns = byParent.get(unit.annotationId);
    if (wordAnns === undefined || wordAnns.length === 0) continue;
    const nextTokens = orderByPreviousAnnotation(wordAnns).map((wordAnn) => {
      const glossText = filled(wordAnn.annotationId)
        ? glossByWordAnnId.get(wordAnn.annotationId)
        : undefined;
      const pos = filled(wordAnn.annotationId)
        ? posByWordAnnId.get(wordAnn.annotationId)
        : undefined;
      const morphs = filled(wordAnn.annotationId)
        ? morphsByWordAnnId.get(wordAnn.annotationId)
        : undefined;
      return {
        form: { default: wordAnn.text },
        ...(filled(wordAnn.lexemeId) ? { lexemeId: wordAnn.lexemeId } : {}),
        ...(glossText !== undefined ? { gloss: glossRecord(glossText.lang, glossText.text) } : {}),
        ...(filled(pos) ? { pos } : {}),
        ...(morphs !== undefined && morphs.length > 0
          ? {
              morphemes: morphs.map((morph) => ({
                form: { default: morph.form },
                ...(filled(morph.lexemeId) ? { lexemeId: morph.lexemeId } : {}),
                ...(filled(morph.gloss)
                  ? { gloss: glossRecord(morph.glossLang ?? 'und', morph.gloss) }
                  : {}),
                ...(filled(morph.pos) ? { pos: morph.pos } : {}),
              })),
            }
          : {}),
      };
    });
    unit.tokens = [...(unit.tokens ?? []), ...nextTokens];
  }
}

export function fillEmptyTranscriptionFromTokens(units: WordHost[]): void {
  for (const unit of units) {
    if (unit.transcription.trim().length > 0) continue;
    const parts = (unit.tokens ?? [])
      .map((token) => (token.form.default ?? '').trim())
      .filter((part) => part.length > 0);
    if (parts.length > 0) unit.transcription = parts.join(' ');
  }
}

export function attachEafWordTiers(input: {
  doc: Document;
  units: WordHost[];
  extraUnits: WordHost[][];
  wordTierEntries: Array<{ tierId: string; anns: EafPickAnnotation[] }>;
  childOfWordTier: Map<string, WordChild[]>;
  childAnnotationIdByParentId: ReadonlyMap<string, string>;
  tierLocales: ReadonlyMap<string, string>;
  readTier: (tier: Element) => { locale?: string; anns: EafPickAnnotation[] };
}): void {
  if (input.wordTierEntries.length === 0 || input.units.length === 0) return;
  const glossByWordAnnId = new Map<string, { text: string; lang: string }>();
  const posByWordAnnId = new Map<string, string>();
  const morphsByWordAnnId = new Map<string, MorphDraft[]>();
  const morphTierIds = new Set<string>();

  for (const wordTier of input.wordTierEntries) {
    for (const child of input.childOfWordTier.get(wordTier.tierId) ?? []) {
      if (isEafMorphTier(child)) morphTierIds.add(child.tierId);
    }
  }

  const glossByMorphAnnId = new Map<string, { text: string; lang: string }>();
  const posByMorphAnnId = new Map<string, string>();
  if (morphTierIds.size > 0) {
    input.doc.querySelectorAll('TIER').forEach((tier) => {
      const parentTierId = tier.getAttribute('PARENT_REF') ?? '';
      if (!morphTierIds.has(parentTierId)) return;
      const tierId = tier.getAttribute('TIER_ID') ?? '';
      const childKind = morphDescendantSlot(tierId);
      if (childKind === 'skip') return;
      const read = input.readTier(tier);
      const lang = glossLanguageKey(read.locale);
      for (const ann of read.anns) {
        if (!filled(ann.annotationRef) || ann.text.trim().length === 0) continue;
        if (childKind === 'pos') {
          if (!posByMorphAnnId.has(ann.annotationRef))
            posByMorphAnnId.set(ann.annotationRef, ann.text);
          continue;
        }
        if (!glossByMorphAnnId.has(ann.annotationRef)) {
          glossByMorphAnnId.set(ann.annotationRef, { text: ann.text, lang });
        }
      }
    });
  }

  for (const wordTier of input.wordTierEntries) {
    for (const child of input.childOfWordTier.get(wordTier.tierId) ?? []) {
      const isMorph = isEafMorphTier(child);
      for (const ann of child.anns) {
        const hostId = isMorph ? hostAnnotationId(ann, wordTier.anns) : ann.annotationRef;
        if (!filled(hostId) || ann.text.trim().length === 0) continue;
        if (child.field === 'pos') {
          if (!posByWordAnnId.has(hostId)) posByWordAnnId.set(hostId, ann.text);
          continue;
        }
        if (isMorph) {
          const morphs = morphsByWordAnnId.get(hostId) ?? [];
          const morphGloss = filled(ann.annotationId)
            ? glossByMorphAnnId.get(ann.annotationId)
            : undefined;
          const morphPos = filled(ann.annotationId)
            ? posByMorphAnnId.get(ann.annotationId)
            : undefined;
          morphs.push({
            form: ann.text,
            ...(filled(ann.lexemeId) ? { lexemeId: ann.lexemeId } : {}),
            ...(morphGloss !== undefined
              ? { gloss: morphGloss.text, glossLang: morphGloss.lang }
              : {}),
            ...(filled(morphPos) ? { pos: morphPos } : {}),
          });
          morphsByWordAnnId.set(hostId, morphs);
          continue;
        }
        if (child.field === 'gloss' || child.field === undefined) {
          if (!glossByWordAnnId.has(hostId)) {
            glossByWordAnnId.set(hostId, {
              text: ann.text,
              lang: glossLanguageKey(input.tierLocales.get(child.tierId)),
            });
          }
        }
      }
    }
    const wordAnns = linkAnnotationsToUnits(
      retargetAnnotationsToChildIds(wordTier.anns, input.childAnnotationIdByParentId),
      input.units,
    );
    applyWordTokens(input.units, wordAnns, glossByWordAnnId, posByWordAnnId, morphsByWordAnnId);
    for (const extra of input.extraUnits) {
      applyWordTokens(extra, wordAnns, glossByWordAnnId, posByWordAnnId, morphsByWordAnnId);
    }
  }
}
