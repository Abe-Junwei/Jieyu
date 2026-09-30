import { describe, expect, it } from 'vitest';
import {
  annotationTemplateKindFromSearch,
  annotationTemplateTargetMatches,
} from './annotationTemplateKind';

describe('annotationTemplateKind', () => {
  it('reads template and the gloss-cell section alias', () => {
    expect(annotationTemplateKindFromSearch('?template=pos')).toBe('pos');
    expect(annotationTemplateKindFromSearch('section=abbreviations&abbr=ZZZ')).toBe(
      'abbreviations',
    );
    expect(annotationTemplateKindFromSearch('?languageId=eng')).toBeNull();
  });

  it('treats a structural panel without a template as the structure panel', () => {
    expect(annotationTemplateTargetMatches('?template=structure', '?languageId=eng')).toBe(true);
    expect(annotationTemplateTargetMatches('?template=pos', '?template=abbreviations')).toBe(false);
    expect(
      annotationTemplateTargetMatches('?template=abbreviations', '?section=abbreviations&abbr=SG'),
    ).toBe(true);
  });
});
