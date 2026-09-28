import type { EafRolePromptTier } from './eafTierRole';

/**
 * Default EAF tier choice when the file has no saved role table.
 * Tokens are the tier id and linguistic type id split on non-letters.
 */

const TRANSCRIPTION_TOKENS = new Set(['tx', 'trs', 'transcription', '转写']);
const TRANSLATION_TOKENS = new Set(['ft', 'gls', 'translation', 'free', '翻译']);
const ANCHOR_TOKENS = new Set(['ref', 'segnum', 'note', 'notes', 'comment']);
const ANCHOR_PHRASES = new Set(['document_notes', 'page_no']);
const WORD_TOKENS = new Set(['wd', 'mb', 'morph', 'word', '单词', 'ps', 'gl']);

const TIME_SLOP_SEC = 0.05;

export type EafTierPickFact = {
  tierId: string;
  linguisticTypeId?: string;
  parentTierId?: string;
  timeAlignable: boolean;
  symbolicSubdivision: boolean;
  nonemptyTexts: readonly string[];
  maxChildrenPerParent: number;
};

export type EafTierPick = {
  transcriptionTierId?: string;
  firstIndependentTimeAlignedTierId?: string;
  anchorTierIds: ReadonlySet<string>;
  phraseSubdivisionTierIds: ReadonlySet<string>;
  wordTierIds: ReadonlySet<string>;
  promptTiers?: readonly EafRolePromptTier[];
};

export type EafPickAnnotation = {
  startTime: number;
  endTime: number;
  text: string;
  annotationId?: string;
  annotationRef?: string;
};

export type EafPickedUnit = {
  startTime: number;
  endTime: number;
  transcription: string;
  speakerId?: string;
  annotationId?: string;
};

type NameSignals = {
  transcription: boolean;
  translation: boolean;
  anchor: boolean;
  word: boolean;
};

export function maxEafChildrenPerParent(
  annotations: readonly { annotationId?: string; annotationRef?: string }[],
): number {
  if (annotations.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const annotation of annotations) {
    const key = annotation.annotationRef ?? annotation.annotationId ?? '';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let max = 0;
  for (const count of counts.values()) if (count > max) max = count;
  return max;
}

export function tokenizeEafLabel(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((token) => token.length > 0);
}

function filled(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function normalizedPhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function signalsFor(tierId: string, linguisticTypeId: string | undefined): NameSignals {
  const tokens = new Set<string>();
  const phrases = [normalizedPhrase(tierId)];
  if (filled(linguisticTypeId)) phrases.push(normalizedPhrase(linguisticTypeId));
  for (const source of [tierId, linguisticTypeId ?? '']) {
    if (source.length === 0) continue;
    for (const token of tokenizeEafLabel(source)) tokens.add(token);
  }
  const anchor =
    [...tokens].some((token) => ANCHOR_TOKENS.has(token)) || phrases.some(hasAnchorPhrase);
  return {
    transcription: [...tokens].some(
      (token) => TRANSCRIPTION_TOKENS.has(token) || token.includes('txt'),
    ),
    translation: [...tokens].some((token) => TRANSLATION_TOKENS.has(token)),
    anchor,
    word: [...tokens].some((token) => WORD_TOKENS.has(token)),
  };
}

function hasAnchorPhrase(phrase: string): boolean {
  if (phrase.length === 0) return false;
  if (ANCHOR_PHRASES.has(phrase)) return true;
  const parts = phrase.split('_').filter((part) => part.length > 0);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? '';
    if (ANCHOR_TOKENS.has(part)) return true;
    const pair = index + 1 < parts.length ? `${part}_${parts[index + 1]}` : '';
    if (pair.length > 0 && ANCHOR_PHRASES.has(pair)) return true;
  }
  return false;
}

function isAnchorText(value: string): boolean {
  const text = value.trim();
  if (/^<\s*p\s*:\s*>$/i.test(text)) return true;
  if (/^\d+$/.test(text)) return true;
  return /^\d+_[A-Za-z0-9_-]+$/.test(text);
}

export function isEafContentAnchor(texts: readonly string[]): boolean {
  const nonempty = texts.map((text) => text.trim()).filter((text) => text.length > 0);
  if (nonempty.length === 0) return false;
  const hits = nonempty.filter(isAnchorText).length;
  return hits * 5 >= nonempty.length * 4;
}

function isAnchorTier(tier: EafTierPickFact, name: NameSignals): boolean {
  if (isEafContentAnchor(tier.nonemptyTexts)) return true;
  return name.anchor && !name.transcription;
}

function isPhraseSubdivision(tier: EafTierPickFact, name: NameSignals): boolean {
  if (!tier.symbolicSubdivision) return false;
  if (tier.maxChildrenPerParent >= 2) return false;
  return name.transcription || name.translation;
}

function isIndependentTimeAligned(tier: EafTierPickFact): boolean {
  return tier.timeAlignable && (tier.parentTierId === undefined || tier.parentTierId.length === 0);
}

export function pickEafTiers(tiers: readonly EafTierPickFact[]): EafTierPick {
  const names = new Map<string, NameSignals>();
  for (const tier of tiers) names.set(tier.tierId, signalsFor(tier.tierId, tier.linguisticTypeId));

  const wordTierIds = new Set<string>();
  const phraseSubdivisionTierIds = new Set<string>();
  for (const tier of tiers) {
    const name = names.get(tier.tierId)!;
    if (tier.symbolicSubdivision) {
      if (isPhraseSubdivision(tier, name)) phraseSubdivisionTierIds.add(tier.tierId);
      else wordTierIds.add(tier.tierId);
      continue;
    }
    if (filled(tier.parentTierId) && name.word && !name.transcription && !name.translation) {
      wordTierIds.add(tier.tierId);
    }
  }

  const morphTierIds = new Set(
    tiers
      .filter((tier) => filled(tier.parentTierId) && wordTierIds.has(tier.parentTierId))
      .map((tier) => tier.tierId),
  );

  const isSkipped = (tier: EafTierPickFact) =>
    wordTierIds.has(tier.tierId) || morphTierIds.has(tier.tierId);

  const transcriptionCandidates = tiers.filter((tier) => {
    const name = names.get(tier.tierId)!;
    if (tier.nonemptyTexts.length === 0) return false;
    if (isAnchorTier(tier, name)) return false;
    if (!name.transcription) return false;
    return !isSkipped(tier);
  });

  const firstIndependent = tiers.find(isIndependentTimeAligned);
  const nonemptyIndependent = tiers.find(
    (tier) =>
      isIndependentTimeAligned(tier) &&
      tier.nonemptyTexts.length > 0 &&
      !isAnchorTier(tier, names.get(tier.tierId)!),
  );
  const transcriptionTierId =
    transcriptionCandidates[0]?.tierId ?? nonemptyIndependent?.tierId ?? firstIndependent?.tierId;

  const anchorTierIds = new Set(
    tiers
      .filter(
        (tier) =>
          tier.tierId !== transcriptionTierId && isAnchorTier(tier, names.get(tier.tierId)!),
      )
      .map((tier) => tier.tierId),
  );

  const phraseTiers = tiers.filter((tier) => {
    if (tier.nonemptyTexts.length === 0) return false;
    if (isSkipped(tier)) return false;
    if (anchorTierIds.has(tier.tierId)) return false;
    return true;
  });
  const independentPhraseCount = phraseTiers.filter(isIndependentTimeAligned).length;
  const shouldPrompt =
    transcriptionCandidates.length >= 2 ||
    (transcriptionCandidates.length === 0 && independentPhraseCount >= 2);

  return {
    ...(filled(transcriptionTierId) ? { transcriptionTierId } : {}),
    ...(firstIndependent ? { firstIndependentTimeAlignedTierId: firstIndependent.tierId } : {}),
    anchorTierIds,
    phraseSubdivisionTierIds,
    wordTierIds,
    ...(shouldPrompt
      ? {
          promptTiers: phraseTiers.map((tier) => ({
            tierId: tier.tierId,
            role: tier.tierId === transcriptionTierId ? 'transcription' : 'translation',
          })),
        }
      : {}),
  };
}

function enclosingParent(
  annotation: EafPickAnnotation,
  parents: readonly EafPickAnnotation[],
): EafPickAnnotation | undefined {
  if (filled(annotation.annotationRef)) {
    const byId = parents.find((parent) => parent.annotationId === annotation.annotationRef);
    if (byId) return byId;
  }
  return parents.find(
    (parent) =>
      annotation.startTime >= parent.startTime - TIME_SLOP_SEC &&
      annotation.endTime <= parent.endTime + TIME_SLOP_SEC,
  );
}

export function unitsFromPickedAnnotations(
  annotations: readonly EafPickAnnotation[],
  parentAnnotations: readonly EafPickAnnotation[],
  participant?: string,
): { units: EafPickedUnit[]; childAnnotationIdByParentId: Map<string, string> } {
  const childAnnotationIdByParentId = new Map<string, string>();
  const units = annotations.map((annotation) => {
    const parent =
      parentAnnotations.length > 0 ? enclosingParent(annotation, parentAnnotations) : undefined;
    const parentId = parent?.annotationId;
    if (filled(parentId) && filled(annotation.annotationId)) {
      childAnnotationIdByParentId.set(parentId, annotation.annotationId);
    }
    return {
      startTime: parent?.startTime ?? annotation.startTime,
      endTime: parent?.endTime ?? annotation.endTime,
      transcription: annotation.text,
      ...(filled(participant) ? { speakerId: participant } : {}),
      ...(filled(annotation.annotationId) ? { annotationId: annotation.annotationId } : {}),
    };
  });
  return { units, childAnnotationIdByParentId };
}

export function anchorNotesForUnits(
  anchors: readonly EafPickAnnotation[],
  units: readonly EafPickedUnit[],
  childAnnotationIdByParentId: ReadonlyMap<string, string>,
): Array<{ startTime: number; endTime: number; text: string; annotationRef?: string }> {
  const notes: Array<{ startTime: number; endTime: number; text: string; annotationRef?: string }> =
    [];
  for (const anchor of anchors) {
    if (anchor.text.trim().length === 0) continue;
    const childId = filled(anchor.annotationId)
      ? childAnnotationIdByParentId.get(anchor.annotationId)
      : undefined;
    const unit = filled(childId)
      ? units.find((row) => row.annotationId === childId)
      : units.find(
          (row) =>
            Math.abs(row.startTime - anchor.startTime) < TIME_SLOP_SEC &&
            Math.abs(row.endTime - anchor.endTime) < TIME_SLOP_SEC,
        );
    const annotationRef = unit?.annotationId;
    notes.push({
      startTime: unit?.startTime ?? anchor.startTime,
      endTime: unit?.endTime ?? anchor.endTime,
      text: anchor.text,
      ...(filled(annotationRef) ? { annotationRef } : {}),
    });
  }
  return notes;
}

export function linkAnnotationsToUnits<T extends EafPickAnnotation>(
  annotations: readonly T[],
  units: readonly EafPickedUnit[],
): T[] {
  return annotations.map((annotation) => {
    if (filled(annotation.annotationRef)) return annotation;
    const host = units.find(
      (unit) =>
        annotation.startTime >= unit.startTime - TIME_SLOP_SEC &&
        annotation.endTime <= unit.endTime + TIME_SLOP_SEC,
    );
    const hostId = host?.annotationId;
    if (!filled(hostId)) return annotation;
    return { ...annotation, annotationRef: hostId };
  });
}

export function retargetAnnotationsToChildIds<T extends EafPickAnnotation>(
  annotations: readonly T[],
  childAnnotationIdByParentId: ReadonlyMap<string, string>,
): T[] {
  return annotations.map((annotation) => {
    if (!filled(annotation.annotationRef)) return annotation;
    const childId = childAnnotationIdByParentId.get(annotation.annotationRef);
    if (!filled(childId)) return annotation;
    return { ...annotation, annotationRef: childId };
  });
}
