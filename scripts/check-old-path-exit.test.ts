import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs guard script without type declarations
import { featureViolations, legacyRouteGaps } from './check-old-path-exit.mjs';

const present = () => true;

function feature(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'sample',
    status,
    paths: ['src/pages/HomePage.tsx'],
    oldTests: [],
    replacement: [],
    desktopTests: [],
    decision: '',
    ...extra,
  };
}

describe('old path feature ledger', () => {
  it('requires a replacement, desktop tests, and a decision before ported', () => {
    expect(featureViolations([feature('ported', { replacement: ['src/pages/Next.tsx'] })], present)).toEqual([
      'sample ported without desktop tests',
      'sample ported without decision',
    ]);
    expect(
      featureViolations(
        [
          feature('ported', {
            replacement: ['src/pages/Next.tsx'],
            desktopTests: ['src/pages/Next.test.tsx'],
            decision: 'whitelist',
          }),
        ],
        present,
      ),
    ).toEqual([]);
  });

  it('requires a decision and no port paths before dropped', () => {
    expect(featureViolations([feature('dropped')], present)).toEqual(['sample dropped without decision']);
    expect(
      featureViolations(
        [feature('dropped', { decision: '328', replacement: ['src/pages/Next.tsx'] })],
        present,
      ),
    ).toEqual(['sample dropped with a port']);
    expect(featureViolations([feature('dropped', { decision: '328' })], present)).toEqual([]);
  });

  it('keeps the ten old routes on desktop-routes and features, and rejects a surfaces field', () => {
    const page = 'src/pages/HomePage.tsx';
    const record = {
      surfaces: ['production'],
      entries: [{ id: 'desktop-routes', paths: [page] }],
      features: [{ paths: [page] }],
    };
    expect(legacyRouteGaps(record)).toContain('old-path record has surfaces');
    expect(legacyRouteGaps(record)).toContain('desktop-routes missing src/pages/TranscriptionPage.tsx');
    expect(legacyRouteGaps(record)).toContain('feature missing src/pages/TranscriptionPage.tsx');
  });
});
