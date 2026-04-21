import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('timeline comparison side badge style guards', () => {
  it('pins self-certainty to top-right and note icon to bottom-right in comparison overlays', () => {
    const css = readFile('src/styles/pages/timeline/timeline-paired-reading.css');
    const sharedBadgeRule = css.match(/\.timeline-paired-reading-surface-badges \.timeline-annotation-self-certainty,\s*\n\.timeline-paired-reading-surface-badges \.timeline-paired-reading-note-icon\s*\{[^}]*\}/s)?.[0] ?? '';
    const certaintyRules = [...css.matchAll(/\.timeline-paired-reading-surface-badges \.timeline-annotation-self-certainty\s*\{[^}]*\}/gs)].map((m) => m[0]);
    const noteRules = [...css.matchAll(/\.timeline-paired-reading-surface-badges \.timeline-paired-reading-note-icon\s*\{[^}]*\}/gs)].map((m) => m[0]);

    expect(sharedBadgeRule.length).toBeGreaterThan(0);
    expect(sharedBadgeRule.includes('position: absolute;')).toBe(true);
    expect(sharedBadgeRule.includes('right: 10px;') || sharedBadgeRule.includes('inset-inline-end: 10px;')).toBe(true);

    expect(certaintyRules.length).toBeGreaterThan(0);
    expect(certaintyRules.some((rule) => rule.includes('top: 8px;'))).toBe(true);

    expect(noteRules.length).toBeGreaterThan(0);
    expect(noteRules.some((rule) => rule.includes('top: auto;'))).toBe(true);
    expect(noteRules.some((rule) => rule.includes('bottom: 8px;'))).toBe(true);
    expect(noteRules.some((rule) => rule.includes('right: 10px;') || rule.includes('inset-inline-end: 10px;'))).toBe(true);
  });
});
