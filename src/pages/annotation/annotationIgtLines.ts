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

export function annotationLineAlignsToWords(id: AnnotationLineId): boolean {
  return WORD_ALIGNED.has(id);
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
    gloss: input.hasTokens && (input.hasGloss || input.editing || added.has('gloss')),
    pos: input.hasTokens && (input.hasPos || input.editing || added.has('pos')),
    lemma: input.hasTokens && (input.hasLemma || added.has('lemma')),
    literal: input.hasTokens && added.has('literal'),
    translation: input.hasTranslation,
  };
  return ANNOTATION_LINE_ORDER.filter((id) => show[id] && !hidden.has(id));
}
