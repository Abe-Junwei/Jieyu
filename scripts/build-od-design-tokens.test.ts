import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs build script without type declarations
import { buildPixsoPayload } from './build-od-design-tokens.mjs';

describe('buildPixsoPayload', () => {
  it('turns alpha colors, shadows, lengths and font stacks into Pixso values', () => {
    const { variables, effectStyles, variableSets } = buildPixsoPayload([
      ['success-bg', '#f0fdf4', 'rgb(74 222 128 / 20%)'],
      ['space-2', '8px', '8px'],
      ['font-ipa', "'Noto Sans', sans-serif", "'Noto Sans', sans-serif"],
      ['font-display', "'Noto Serif SC', serif", "'Noto Serif SC', serif"],
      ['motion-fast', '160ms', '160ms'],
      ['ease-standard', 'ease-out', 'ease-out'],
      ['shadow-popover', '0 2px 8px rgb(17 17 17 / 8%)', '0 2px 8px rgb(0 0 0 / 50%)'],
      ['focus-ring', '0 0 0 3px rgb(17 17 17 / 14%)', '0 0 0 3px rgb(244 242 236 / 18%)'],
      ['elev-flat', 'none', 'none'],
    ]);
    expect(variableSets['颜色'].modes).toEqual(['亮色', '暗色']);
    expect(variables['--success-bg'].values).toEqual({ 亮色: '#F0FDF4', 暗色: '#4ADE8033' });
    expect(variables['--space-2']).toEqual({ type: 'number', variableSet: '尺寸', values: { 默认: 8 } });
    expect(variables['--font-ipa'].values).toEqual({ 默认: 'Noto Sans SemiCondensed' });
    expect(variables['--font-display'].values).toEqual({ 默认: 'Source Han Serif CN' });
    expect(variables['--motion-fast'].values).toEqual({ 默认: 160 });
    expect(variables['--ease-standard'].type).toBe('string');
    expect(variables['--elev-flat']).toBeUndefined();
    expect(effectStyles['阴影-暗色/菜单与提示 --shadow-popover'][0].color).toBe('#00000080');
    expect(effectStyles['阴影/菜单与提示 --shadow-popover']).toEqual([
      { type: 'DROP_SHADOW', offset: { x: 0, y: 2 }, radius: 8, spread: 0, color: '#11111114' },
    ]);
    expect(Object.keys(effectStyles).some((k) => k.includes('focus-ring'))).toBe(false);
    expect(variables['--focus-ring']).toBeUndefined();
  });
});
