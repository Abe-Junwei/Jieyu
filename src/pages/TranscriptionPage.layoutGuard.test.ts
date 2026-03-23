import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Transcription layout guard', () => {
  it('keeps fixed viewport main layout styles for transcription route', () => {
    const appPath = path.resolve(process.cwd(), 'src/App.tsx');
    const appCode = fs.readFileSync(appPath, 'utf8');

    expect(appCode).toContain("position: 'fixed'");
    expect(appCode).toContain("top: `${headerHeight}px`");
    expect(appCode).toContain("bottom: 0");
    expect(appCode).toContain("overflow: 'hidden'");
  });

  it('keeps stylesheet fixed-anchor selector for transcription main area', () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    const selector = '.app-shell-transcription .app-main-transcription {';
    const start = cssCode.indexOf(selector);

    expect(start).toBeGreaterThanOrEqual(0);

    const end = cssCode.indexOf('}', start);
    expect(end).toBeGreaterThan(start);

    const block = cssCode.slice(start, end + 1);
    expect(block).toContain('position: fixed;');
    expect(block).toContain('top: var(--app-header-height, 0px);');
    expect(block).toContain('bottom: 0;');
    expect(block).toContain('left: 0;');
    expect(block).toContain('right: 0;');
  });
});
