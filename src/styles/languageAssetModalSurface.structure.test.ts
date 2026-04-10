import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('Language asset modal surface style guards', () => {
  it('defines color-white token in both light and dark theme roots', () => {
    const code = readFile('src/styles/tokens.css');
    const matches = code.match(/--color-white\s*:\s*#ffffff\s*;/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps workspace shell gradients anchored to color-white token', () => {
    const lm = readFile('src/styles/pages/language-metadata-workspace.css');
    const om = readFile('src/styles/pages/orthography-manager-panel.css');
    const ob = readFile('src/styles/pages/orthography-bridge-workspace.css');

    expect(lm.includes('var(--color-white)')).toBe(true);
    expect(om.includes('var(--color-white)')).toBe(true);
    expect(ob.includes('var(--color-white)')).toBe(true);
  });
});
