export const ANNOTATION_LINE_ORDER = [
  'source',
  'word',
  'morphForm',
  'gloss',
  'pos',
  'lemma',
  'literal',
  'translation',
] as const;

export type AnnotationLineId = (typeof ANNOTATION_LINE_ORDER)[number];

const WORD_ALIGNED = new Set<AnnotationLineId>([
  'word',
  'morphForm',
  'gloss',
  'pos',
  'lemma',
  'literal',
]);

export function annotationLineKind(key: string): AnnotationLineId {
  const kind = key.split(':')[0] ?? key;
  if ((ANNOTATION_LINE_ORDER as readonly string[]).includes(kind)) return kind as AnnotationLineId;
  return 'word';
}

export function annotationLineLanguage(key: string): string {
  const index = key.indexOf(':');
  return index < 0 ? '' : key.slice(index + 1);
}

export function annotationLanguageLineKey(kind: AnnotationLineId, languageId: string): string {
  return `${kind}:${languageId.trim()}`;
}

export function annotationLineAlignsToWords(id: string): boolean {
  return WORD_ALIGNED.has(annotationLineKind(id));
}

export function annotationLineLabelKey(
  id: AnnotationLineId,
):
  | 'workspace.annotation.surfaceLabel'
  | 'workspace.annotation.lineWord'
  | 'workspace.annotation.lineMorph'
  | 'workspace.annotation.lineGloss'
  | 'workspace.annotation.linePos'
  | 'workspace.annotation.lineLemma'
  | 'workspace.annotation.lineLiteral'
  | 'workspace.annotation.translationLabel' {
  switch (id) {
    case 'source':
      return 'workspace.annotation.surfaceLabel';
    case 'word':
      return 'workspace.annotation.lineWord';
    case 'morphForm':
      return 'workspace.annotation.lineMorph';
    case 'gloss':
      return 'workspace.annotation.lineGloss';
    case 'pos':
      return 'workspace.annotation.linePos';
    case 'lemma':
      return 'workspace.annotation.lineLemma';
    case 'literal':
      return 'workspace.annotation.lineLiteral';
    case 'translation':
      return 'workspace.annotation.translationLabel';
  }
}

export const ANNOTATION_ADDABLE_LINES = [
  'morphForm',
  'gloss',
  'pos',
  'lemma',
  'literal',
] as const satisfies readonly AnnotationLineId[];

const TOP_LINES = new Set<AnnotationLineId>(['source']);
const BOTTOM_LINES = new Set<AnnotationLineId>(['translation']);

export function annotationLineBand(id: string): 'top' | 'middle' | 'bottom' {
  const kind = annotationLineKind(id);
  if (TOP_LINES.has(kind)) return 'top';
  if (BOTTOM_LINES.has(kind)) return 'bottom';
  return 'middle';
}

export function arrangeAnnotationLines(
  visible: readonly AnnotationLineId[],
  order: readonly AnnotationLineId[],
): AnnotationLineId[] {
  const shown = new Set(visible);
  const ranked = order.filter((id) => shown.has(id));
  for (const id of visible) {
    if (!ranked.includes(id)) ranked.push(id);
  }
  return [
    ...ranked.filter((id) => annotationLineBand(id) === 'top'),
    ...ranked.filter((id) => annotationLineBand(id) === 'middle'),
    ...ranked.filter((id) => annotationLineBand(id) === 'bottom'),
  ];
}

export function moveAnnotationLine<T extends string>(order: readonly T[], from: T, to: T): T[] {
  if (from === to || annotationLineBand(from) !== annotationLineBand(to)) return [...order];
  const next = [...order];
  const fromIndex = next.indexOf(from);
  const toIndex = next.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return next;
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, from);
  return next;
}

export function placeAnnotationLine(lines: readonly string[], key: string): string[] {
  if (lines.includes(key)) return [...lines];
  const out = [...lines];
  const band = annotationLineBand(key);
  let insertAt = out.length;
  for (let index = out.length - 1; index >= 0; index -= 1) {
    if (annotationLineBand(out[index] ?? '') === band) {
      insertAt = index + 1;
      break;
    }
  }
  if (band === 'top' && !out.some((item) => annotationLineBand(item) === 'top')) insertAt = 0;
  if (band === 'middle') {
    const bottom = out.findIndex((item) => annotationLineBand(item) === 'bottom');
    if (bottom >= 0 && insertAt > bottom) insertAt = bottom;
  }
  out.splice(insertAt, 0, key);
  return out;
}

export function reconcileAnnotationLineOrder(
  preferred: readonly string[] | null,
  derived: readonly string[],
): string[] {
  if (preferred === null || preferred.length === 0) return [...derived];
  const have = new Set(derived);
  let next = preferred.filter((key) => have.has(key));
  for (const key of derived) {
    if (!next.includes(key)) next = placeAnnotationLine(next, key);
  }
  return next;
}

export function annotationLineMoveTarget(
  lines: readonly string[],
  id: string,
  direction: 'up' | 'down',
): string | null {
  const band = annotationLineBand(id);
  const group = lines.filter((line) => annotationLineBand(line) === band);
  const index = group.indexOf(id);
  if (index < 0) return null;
  const next = direction === 'up' ? group[index - 1] : group[index + 1];
  return next ?? null;
}

export function annotationExtraLayerLines(input: {
  unitId: string;
  kind: 'source' | 'translation';
  layers: readonly { id: string; languageId: string }[];
  primaryLayerId: string;
  textByLayer: Readonly<Record<string, Readonly<Record<string, string>>>>;
}): { key: string; languageId: string; text: string }[] {
  return input.layers
    .filter((layer) => layer.id !== input.primaryLayerId)
    .map((layer) => ({
      key: annotationLanguageLineKey(input.kind, layer.id),
      languageId: layer.languageId.trim(),
      text: input.textByLayer[layer.id]?.[input.unitId] ?? '',
    }));
}

export function annotationLinesToAdd(visible: readonly AnnotationLineId[]): AnnotationLineId[] {
  const shown = new Set(visible);
  return ANNOTATION_ADDABLE_LINES.filter((id) => !shown.has(id));
}

export function annotationGlossCell(tokenGloss: string, morphGlosses: readonly string[]): string {
  const parts = morphGlosses.map((gloss) => gloss.trim()).filter((gloss) => gloss.length > 0);
  if (parts.length > 0) return parts.join('-');
  return tokenGloss.trim();
}

export function visibleAnnotationLines(input: {
  hasSurface: boolean;
  hasTokens: boolean;
  hasMorphForms: boolean;
  hasGloss: boolean;
  hasPos: boolean;
  hasLemma: boolean;
  hasTranslation: boolean;
  editing: boolean;
  added: readonly AnnotationLineId[];
  hidden: readonly AnnotationLineId[];
}): AnnotationLineId[] {
  const added = new Set(input.added);
  const hidden = new Set(input.hidden);
  const show: Record<AnnotationLineId, boolean> = {
    source: input.hasSurface,
    word: input.hasTokens,
    morphForm: input.hasTokens && (input.hasMorphForms || added.has('morphForm')),
    gloss: input.hasTokens,
    pos: input.hasTokens,
    lemma: input.hasTokens && (input.hasLemma || added.has('lemma')),
    literal: input.hasTokens && added.has('literal'),
    translation: input.hasTranslation,
  };
  return ANNOTATION_LINE_ORDER.filter((id) => show[id] && !hidden.has(id));
}
