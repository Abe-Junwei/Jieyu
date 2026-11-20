import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs guard script without type declarations
import { legacyHtmlCspMismatch } from './check-legacy-html-csp.mjs';

const repoRoot = process.cwd();

describe('legacy html csp', () => {
  it('compares the template and the startup script, not the module entry', () => {
    const desktop = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    const legacy = readFileSync(join(repoRoot, 'legacy/index.html'), 'utf8');
    expect(legacyHtmlCspMismatch(desktop, legacy)).toEqual([]);
    expect(legacyHtmlCspMismatch(desktop, desktop.replace('jieyu-csp', 'jieyu-csp-other'))).toEqual([
      'missing csp template',
    ]);
    const drifted = legacy.replace("script-src  'self' 'wasm-unsafe-eval'", "script-src  'self'");
    expect(legacyHtmlCspMismatch(desktop, drifted)).toContain('csp template differs');
    const startupDrift = legacy.replace('document.importNode', 'document.importNodeDrift');
    expect(legacyHtmlCspMismatch(desktop, startupDrift)).toContain('csp startup script differs');
  });
});
