import { describe, expect, it } from 'vitest';
import { nextLayerNameForAlias } from './layerAliasName';

describe('nextLayerNameForAlias (JY-18)', () => {
  it('returns null when the alias did not change', () => {
    expect(nextLayerNameForAlias({ zho: '我的层' }, '我的层', ' 我的层 ')).toBeNull();
    expect(nextLayerNameForAlias({ zho: '翻译 · 旧名' }, '', '')).toBeNull();
  });

  it('stores a new alias under und, drops the old alias and legacy auto names, keeps the rest', () => {
    expect(nextLayerNameForAlias({ zho: '翻译 · 旧名', eng: 'Gloss' }, '', '新名')).toEqual({
      eng: 'Gloss',
      und: '新名',
    });
    expect(nextLayerNameForAlias({ zho: '我的层', eng: 'Mine' }, '我的层', '新名')).toEqual({
      eng: 'Mine',
      und: '新名',
    });
  });

  it('clears the alias without writing a UI-language label', () => {
    expect(nextLayerNameForAlias({ und: '旧名', eng: 'Gloss' }, '旧名', '')).toEqual({
      eng: 'Gloss',
    });
  });
});
