import { describe, expect, it } from 'vitest';
import { foldCharacterVariants, parseCharacterVariantLines } from './annotationCharacterVariants';

describe('annotationCharacterVariants', () => {
  it('treats registered characters as the same form and leaves others apart', () => {
    const groups = parseCharacterVariantLines("ʔ='");
    expect(foldCharacterVariants("k'a", groups)).toBe(foldCharacterVariants('kʔa', groups));
    expect(foldCharacterVariants('kʔa', [])).not.toBe(foldCharacterVariants("k'a", []));
  });
});
