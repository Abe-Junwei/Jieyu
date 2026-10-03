export type AnnotationTemplateKind = 'abbreviations' | 'pos' | 'structure';

export function annotationTemplateKindFromSearch(search: string): AnnotationTemplateKind | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const value = params.get('template') ?? params.get('section');
  if (value === 'abbreviations' || value === 'pos' || value === 'structure') return value;
  return null;
}

export function annotationTemplateTargetMatches(
  targetSearch: string,
  currentSearch: string,
): boolean {
  const wanted = annotationTemplateKindFromSearch(targetSearch);
  if (wanted === null) return true;
  const current = annotationTemplateKindFromSearch(currentSearch) ?? 'structure';
  return wanted === current;
}
