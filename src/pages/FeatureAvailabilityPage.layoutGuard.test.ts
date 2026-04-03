import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE_FILES = [
  'src/pages/AnnotationPage.tsx',
  'src/pages/AnalysisPage.tsx',
  'src/pages/WritingPage.tsx',
  'src/pages/LexiconPage.tsx',
];

describe('Feature availability page layout guard', () => {
  it('keeps placeholder routes importing the dedicated feature availability page css', () => {
    for (const pageFile of PAGE_FILES) {
      const pagePath = path.resolve(process.cwd(), pageFile);
      const pageCode = fs.readFileSync(pagePath, 'utf8');

      expect(pageCode).toContain("import '../styles/pages/feature-availability.css';");
      expect(pageCode).toContain('<FeatureAvailabilityPanel');
    }
  });

  it('keeps placeholder page and side-pane styles in dedicated page css', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/pages/feature-availability.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    expect(cssCode).toContain('.app-side-pane-feature-stack {');
    expect(cssCode).toContain('.app-side-pane-feature-badge {');
    expect(cssCode).toContain('.feature-availability-panel {');
    expect(cssCode).toContain('.feature-availability-link {');
  });

  it('keeps global stylesheet free of placeholder page-specific styles', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles/global.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    expect(cssCode).not.toContain('.app-side-pane-feature-stack {');
    expect(cssCode).not.toContain('.feature-availability-panel {');
  });
});