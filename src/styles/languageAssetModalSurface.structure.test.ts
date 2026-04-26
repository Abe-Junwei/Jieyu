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
    const contract = readFile('src/styles/foundation/language-asset-section-contract.css');

    // 语言资产壳或 LM 等页面样式至少一处锚定 `--color-white`（与 tokens 一致）| At least one LA surface references --color-white
    expect(lm.includes('var(--color-white)') || contract.includes('var(--color-white)')).toBe(true);
  });

  it('enforces language asset layout contract wiring across three pages', () => {
    const contract = readFile('src/styles/foundation/language-asset-section-contract.css');
    const foundation = readFile('src/styles/app-foundation.css');
    const lmPage = readFile('src/pages/LanguageMetadataWorkspacePage.tsx');
    const lmDetail = readFile('src/pages/LanguageMetadataWorkspaceDetailColumn.tsx');
    const omPage = readFile('src/pages/OrthographyManagerPanel.tsx');
    const obPage = readFile('src/pages/OrthographyBridgeWorkspacePage.tsx');

    expect(contract.includes('.la-shell .dialog-body')).toBe(true);
    expect(contract.includes('.la-panel-stack')).toBe(true);
    expect(contract.includes('.la-list-scroll')).toBe(true);
    expect(foundation.includes("@import './foundation/language-asset-section-contract.css';")).toBe(true);

    expect(lmPage.includes('className="lm-shell lm-workspace la-shell"')).toBe(true);
    expect(lmPage.includes('bodyClassName="lm-layout la-panel-stack"')).toBe(true);
    expect(lmDetail.includes('className="lm-detail-column la-panel-stack"')).toBe(true);

    expect(omPage.includes('className="om-shell la-shell"')).toBe(true);
    expect(omPage.includes('la-list-section')).toBe(false);
    expect(omPage.includes('la-list-scroll')).toBe(true);

    expect(obPage.includes('className="ob-shell ob-workspace la-shell"')).toBe(true);
    expect(obPage.includes('la-list-section')).toBe(false);
    expect(obPage.includes('la-list-scroll')).toBe(true);
  });

  it('prevents LM detail container from regressing to display contents', () => {
    const lmCss = readFile('src/styles/pages/language-metadata-workspace.css');
    expect(lmCss.includes('.lm-detail-column { display: contents;')).toBe(false);
  });
});
