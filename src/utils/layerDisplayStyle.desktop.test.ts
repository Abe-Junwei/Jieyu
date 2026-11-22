import { describe, expect, it } from 'vitest';
import {
  desktopAnnotationStyle,
  layerStyleMenuContext,
  storedFontSizeForLaneHeight,
  storedLaneHeightForFontSize,
} from './layerDisplayStyle';

describe('desktop layer style', () => {
  it('falls back without a language and keeps a real script', () => {
    expect(layerStyleMenuContext({ languageId: null, scriptTag: null })).toEqual({
      scriptTag: 'Latn',
      direction: 'ltr',
      skipExemplarCoverage: true,
    });
    expect(layerStyleMenuContext({ languageId: 'lang', scriptTag: 'Arab' })).toEqual({
      scriptTag: 'Arab',
      direction: 'rtl',
      skipExemplarCoverage: true,
    });
  });

  it('rounds the stored size and does not paint a color', () => {
    expect(storedFontSizeForLaneHeight(80)).toBe(19);
    expect(storedLaneHeightForFontSize(18)).toBe(75);
    const style = desktopAnnotationStyle({
      displayFont: 'Noto Sans SC',
      displayFontSize: 18,
      displayBold: true,
      displayItalic: false,
      languageId: 'lang',
      scriptTag: 'Arab',
    });
    expect(style.color).toBeUndefined();
    expect(style.fontFamily).toBe('"Noto Sans SC", sans-serif');
    expect(style.fontWeight).toBe('bold');
    expect(style.direction).toBe('rtl');
    expect(desktopAnnotationStyle({ displayFont: 'Charis SIL' }).fontFamily).toBe(
      '"Charis SIL", serif',
    );
    expect(
      desktopAnnotationStyle({ displayFont: '"Charis SIL", "Doulos SIL", serif' }).fontFamily,
    ).toBe('"Charis SIL", "Doulos SIL", serif');
  });
});
