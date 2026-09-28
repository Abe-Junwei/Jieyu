import type { EafRolePromptTier } from './eafTierRole';

/**
 * Default EAF tier choice when the file has no saved role table.
 * DoReCo names are tokenized from the tier id only.
 * FLEx names use the element and item-type slots in `[speaker_]element-itemType-lang`.
 * The linguistic type id is not a signal: ELAN reuses type names such as `txt` and `Note`.
 */

const TRANSCRIPTION_TOKENS = new Set(['tx', 'trs', 'transcription', '转写']);
const TRANSLATION_TOKENS = new Set(['ft', 'gls', 'translation', 'free', '翻译']);
const ANCHOR_TOKENS = new Set(['ref', 'segnum', 'note', 'notes', 'comment']);
const ANCHOR_PHRASES = new Set(['document_notes', 'page_no']);
const WORD_TOKENS = new Set(['wd', 'mb', 'morph', 'word', '单词', 'ps', 'gl']);
/** FlexConstants.DEFINED_TYPES, longest first, plus the manual's phrase-parent alternative `segnum`. */
const FLEX_ITEM_TYPES = [
  'title-abbreviation',
  'text-is-translation',
  'varianttypes',
  'description',
  'comment',
  'source',
  'note',
  'segnum',
  'title',
  'txt',
  'gls',
  'lit',
  'msa',
  'pos',
  'punct',
  'type',
  'cf',
  'hn',
] as const;
const HEADER_ITEM_TYPES = new Set([
  'title',
  'title-abbreviation',
  'source',
  'comment',
  'description',
]);
const OMIT_ITEM_TYPES = new Set([
  'cf',
  'hn',
  'varianttypes',
  'punct',
  'text-is-translation',
  'type',
]);
const PHRASE_ELEMENTS = new Set(['phrase', '句子', 'transcription', 'transcribe']);
const TRANSLATION_ELEMENTS = new Set(['translation', '翻译']);
const MORPH_ELEMENTS = new Set(['morph', '语素']);
const WORD_ONLY_ELEMENTS = new Set(['word', '单词']);

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
  /** interlinear-text headers. Not imported as transcription, translation, or notes. */
  headerTierIds: ReadonlySet<string>;
  promptTiers?: readonly EafRolePromptTier[];
};

export type EafPickAnnotation = {
  startTime: number;
  endTime: number;
  text: string;
  annotationId?: string;
  annotationRef?: string;
  previousAnnotationId?: string;
  lexemeId?: string;
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
  header: boolean;
  /** FLEx phrase line that belongs in the role dialog. */
  phrase: boolean;
};

type FlexTierName = {
  element: string;
  itemType: string;
  lang?: string;
};

export type FlexTierDisposition =
  | 'phrase-transcription'
  | 'phrase-translation'
  | 'phrase-note'
  | 'segnum'
  | 'word-form'
  | 'word-gloss'
  | 'word-pos'
  | 'morph-form'
  | 'morph-gloss'
  | 'morph-pos'
  | 'header-title'
  | 'header-source'
  | 'header-comment'
  | 'participant-note'
  | 'omit';

export function flexTierDisposition(tierId: string): FlexTierDisposition | undefined {
  const flex = parseFlexTierName(tierId);
  if (!flex) return undefined;
  const element = flex.element.toLowerCase();
  const itemType = flex.itemType;
  if (element === 'interlinear-text' || element === 'interlinear') {
    if (itemType === 'title') return 'header-title';
    if (itemType === 'source') return 'header-source';
    if (itemType === 'comment' || itemType === 'description' || itemType === 'title-abbreviation') {
      return 'header-comment';
    }
    return 'omit';
  }
  if (OMIT_ITEM_TYPES.has(itemType)) return 'omit';
  if (element === 'participant' && itemType === 'note') return 'participant-note';
  const phraseLike = PHRASE_ELEMENTS.has(element) || TRANSLATION_ELEMENTS.has(element);
  if (phraseLike && (itemType === 'gls' || itemType === 'lit')) return 'phrase-translation';
  if (PHRASE_ELEMENTS.has(element) && itemType === 'txt') return 'phrase-transcription';
  if (PHRASE_ELEMENTS.has(element) && (itemType === 'note' || itemType === 'comment')) {
    return 'phrase-note';
  }
  if (itemType === 'segnum') return 'segnum';
  if (MORPH_ELEMENTS.has(element) && itemType === 'txt') return 'morph-form';
  if (MORPH_ELEMENTS.has(element) && itemType === 'gls') return 'morph-gloss';
  if (MORPH_ELEMENTS.has(element) && (itemType === 'msa' || itemType === 'pos')) return 'morph-pos';
  if (WORD_ONLY_ELEMENTS.has(element) && itemType === 'txt') return 'word-form';
  if (WORD_ONLY_ELEMENTS.has(element) && itemType === 'gls') return 'word-gloss';
  if (WORD_ONLY_ELEMENTS.has(element) && itemType === 'pos') return 'word-pos';
  if (HEADER_ITEM_TYPES.has(itemType)) return 'header-comment';
  return 'omit';
}

export function countsAsEafSpeakerTier(tierId: string): boolean {
  const kind = flexTierDisposition(tierId);
  if (kind === undefined) return true;
  return (
    kind === 'phrase-transcription' ||
    kind === 'phrase-translation' ||
    kind === 'phrase-note' ||
    kind === 'segnum' ||
    kind === 'participant-note'
  );
}

function acceptFlexElement(element: string): boolean {
  return element.length > 0 && !element.includes('_') && !element.includes('@');
}

function parseFlexTierName(tierId: string): FlexTierName | undefined {
  const underscore = tierId.indexOf('_');
  const bodies = underscore > 0 ? [tierId.slice(underscore + 1), tierId] : [tierId];
  for (const body of bodies) {
    const lower = body.toLowerCase();
    for (const itemType of FLEX_ITEM_TYPES) {
      const mid = `-${itemType}-`;
      const at = lower.indexOf(mid);
      if (at > 0) {
        const element = body.slice(0, at);
        if (!acceptFlexElement(element)) continue;
        const lang = body.slice(at + mid.length);
        return { element, itemType, ...(lang.length > 0 ? { lang } : {}) };
      }
      const suffix = `-${itemType}`;
      if (lower.endsWith(suffix) && lower.length > suffix.length) {
        const element = body.slice(0, body.length - suffix.length);
        if (!acceptFlexElement(element)) continue;
        return { element, itemType };
      }
    }
  }
  return undefined;
}

/** LANG_REF, else the language slot in a FLEx tier name, else DEFAULT_LOCALE. */
export function flexTierLocale(
  tierId: string,
  langRef: string | undefined,
  defaultLocale: string | undefined,
): string | undefined {
  if (filled(langRef)) return langRef;
  const named = parseFlexTierName(tierId)?.lang;
  if (filled(named)) return named;
  if (filled(defaultLocale)) return defaultLocale;
  return undefined;
}

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

function signalsFromTokens(tierId: string): NameSignals {
  const tokens = tokenizeEafLabel(tierId);
  return {
    transcription: tokens.some((token) => TRANSCRIPTION_TOKENS.has(token) || token === 'txt'),
    translation: tokens.some((token) => TRANSLATION_TOKENS.has(token)),
    anchor:
      tokens.some((token) => ANCHOR_TOKENS.has(token)) || hasAnchorPhrase(normalizedPhrase(tierId)),
    word: tokens.some((token) => WORD_TOKENS.has(token)),
    header: false,
    phrase: false,
  };
}

function signalsFor(tierId: string): NameSignals {
  const kind = flexTierDisposition(tierId);
  if (kind === undefined) return signalsFromTokens(tierId);
  const word =
    kind === 'word-form' ||
    kind === 'word-gloss' ||
    kind === 'word-pos' ||
    kind === 'morph-form' ||
    kind === 'morph-gloss' ||
    kind === 'morph-pos';
  return {
    transcription: kind === 'phrase-transcription',
    translation: kind === 'phrase-translation',
    anchor: kind === 'segnum',
    word,
    header:
      kind === 'header-title' ||
      kind === 'header-source' ||
      kind === 'header-comment' ||
      kind === 'participant-note' ||
      kind === 'phrase-note' ||
      kind === 'omit',
    phrase: kind === 'phrase-transcription' || kind === 'phrase-translation' || kind === 'segnum',
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

function isRoleChoice(tier: EafTierPickFact, name: NameSignals): boolean {
  if (name.header) return false;
  if (name.phrase || name.transcription || name.translation) return true;
  return isIndependentTimeAligned(tier);
}

export function pickEafTiers(tiers: readonly EafTierPickFact[]): EafTierPick {
  const names = new Map<string, NameSignals>();
  for (const tier of tiers) names.set(tier.tierId, signalsFor(tier.tierId));

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

  const headerTierIds = new Set(
    tiers.filter((tier) => names.get(tier.tierId)!.header).map((tier) => tier.tierId),
  );

  const transcriptionCandidates = tiers.filter((tier) => {
    const name = names.get(tier.tierId)!;
    if (tier.nonemptyTexts.length === 0) return false;
    if (name.header) return false;
    if (isAnchorTier(tier, name)) return false;
    if (!name.transcription) return false;
    return !isSkipped(tier);
  });

  const firstIndependent = tiers.find(
    (tier) => isIndependentTimeAligned(tier) && !names.get(tier.tierId)!.header,
  );
  const nonemptyIndependent = tiers.find(
    (tier) =>
      isIndependentTimeAligned(tier) &&
      !names.get(tier.tierId)!.header &&
      tier.nonemptyTexts.length > 0 &&
      !isAnchorTier(tier, names.get(tier.tierId)!),
  );
  const lastResort =
    firstIndependent && !isAnchorTier(firstIndependent, names.get(firstIndependent.tierId)!)
      ? firstIndependent.tierId
      : undefined;
  const transcriptionTierId =
    transcriptionCandidates[0]?.tierId ?? nonemptyIndependent?.tierId ?? lastResort;

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
    return isRoleChoice(tier, names.get(tier.tierId)!);
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
    headerTierIds,
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

export function unitsFromAnchorAnnotations(
  anchors: readonly EafPickAnnotation[],
  speakerId?: string,
): EafPickedUnit[] {
  return anchors.map((anchor) => ({
    startTime: anchor.startTime,
    endTime: anchor.endTime,
    transcription: '',
    ...(filled(speakerId) ? { speakerId } : {}),
    ...(filled(anchor.annotationId) ? { annotationId: anchor.annotationId } : {}),
  }));
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

const WORD_CHILD_FIELDS = {
  'word-gloss': 'gloss',
  'word-pos': 'pos',
  'morph-form': 'morph-form',
} as const;

export function absorbEafFlexTier(input: {
  disposition: FlexTierDisposition;
  tierId: string;
  parentTierId?: string;
  locale?: string;
  participant?: string;
  eafConstraint?: string;
  annotations: readonly EafPickAnnotation[];
  translationTiers: Map<string, EafPickAnnotation[]>;
  anchorSources: EafPickAnnotation[];
  wordForms: Array<{ tierId: string; anns: EafPickAnnotation[] }>;
  wordChildren: Map<
    string,
    Array<{
      tierId: string;
      eafConstraint?: string;
      field?: 'gloss' | 'pos' | 'morph-form';
      anns: EafPickAnnotation[];
    }>
  >;
  notes: Array<{
    startTime: number;
    endTime: number;
    text: string;
    annotationRef?: string;
    targetType?: 'unit' | 'text';
    category?: 'comment' | 'fieldwork';
  }>;
  documentTitle: Record<string, string>;
  speakerNotes: Array<{ participant: string; text: string; lang?: string }>;
  unmappedTierIds: string[];
  baseline: { wordTierId?: string; speakerId?: string };
}): void {
  const nonempty = input.annotations.filter((row) => row.text.trim().length > 0);
  const speaker =
    filled(input.participant) && input.participant !== '***' ? input.participant : undefined;
  if (input.disposition === 'phrase-translation') {
    input.translationTiers.set(input.tierId, [...input.annotations]);
    return;
  }
  if (input.disposition === 'segnum') {
    input.anchorSources.push(...input.annotations);
    if (filled(speaker) && !filled(input.baseline.speakerId)) input.baseline.speakerId = speaker;
    return;
  }
  if (input.disposition === 'phrase-note') {
    for (const row of nonempty) {
      input.notes.push({
        startTime: row.startTime,
        endTime: row.endTime,
        text: row.text,
        ...(filled(row.annotationRef) ? { annotationRef: row.annotationRef } : {}),
        targetType: 'unit',
        category: 'comment',
      });
    }
    return;
  }
  if (input.disposition === 'header-title') {
    const text = nonempty[0]?.text.trim() ?? '';
    if (text.length > 0) {
      const lang = filled(input.locale) ? input.locale : 'default';
      if (!filled(input.documentTitle[lang])) input.documentTitle[lang] = text;
    }
    return;
  }
  if (input.disposition === 'header-source' || input.disposition === 'header-comment') {
    for (const row of nonempty) {
      input.notes.push({
        startTime: row.startTime,
        endTime: row.endTime,
        text: row.text,
        targetType: 'text',
        category: input.disposition === 'header-source' ? 'fieldwork' : 'comment',
      });
    }
    return;
  }
  if (input.disposition === 'participant-note') {
    if (filled(speaker)) {
      for (const row of nonempty) {
        input.speakerNotes.push({
          participant: speaker,
          text: row.text,
          ...(filled(input.locale) ? { lang: input.locale } : {}),
        });
      }
    }
    return;
  }
  if (input.disposition === 'word-form') {
    input.wordForms.push({ tierId: input.tierId, anns: [...input.annotations] });
    if (!filled(input.baseline.wordTierId)) input.baseline.wordTierId = input.tierId;
    return;
  }
  const childField = WORD_CHILD_FIELDS[input.disposition as keyof typeof WORD_CHILD_FIELDS];
  if (childField !== undefined && filled(input.parentTierId)) {
    const list = input.wordChildren.get(input.parentTierId) ?? [];
    list.push({
      tierId: input.tierId,
      ...(filled(input.eafConstraint) ? { eafConstraint: input.eafConstraint } : {}),
      field: childField,
      anns: [...input.annotations],
    });
    input.wordChildren.set(input.parentTierId, list);
    return;
  }
  if (input.disposition === 'morph-gloss' || input.disposition === 'morph-pos') return;
  if (nonempty.length > 0) input.unmappedTierIds.push(input.tierId);
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
