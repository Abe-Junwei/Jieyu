import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs guard script without type declarations
import { featureViolations, legacyRouteGaps, subFeatureViolations } from './check-old-path-exit.mjs';

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

  it('requires old files only while a feature is still open', () => {
    const closed = feature('ported', {
      paths: ['src/pages/HomePage.tsx'],
      oldTests: ['tests/e2e/home.spec.ts'],
      replacement: ['src/pages/Next.tsx'],
      desktopTests: ['src/pages/Next.test.tsx'],
      decision: 'whitelist',
    });
    const kept = (name: string) => name.startsWith('src/pages/Next');
    expect(featureViolations([closed], kept)).toEqual([]);
    expect(
      featureViolations(
        [feature('planned', { oldTests: ['tests/e2e/home.spec.ts'] })],
        kept,
      ),
    ).toEqual(['sample missing src/pages/HomePage.tsx', 'sample missing tests/e2e/home.spec.ts']);
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

  it('rejects legacy sub-features without an owner or a ref', () => {
    const withSubs = (subFeatures: unknown[]) => [{ id: 'home', subFeatures }];
    expect(subFeatureViolations([{ id: 'home' }], present)).toEqual(['home lists no sub-features']);
    expect(
      subFeatureViolations(
        withSubs([
          { id: 'a', name: 'A', ref: 'ADR-0134' },
          { id: 'b', name: 'B', owner: 'later', ref: 'ADR-0134' },
          { id: 'c', name: 'C', owner: '1c', ref: '' },
          { id: 'c', name: 'C', owner: '#285', ref: 'ADR-0134' },
        ]),
        present,
      ),
    ).toEqual(['home/a has no owner', 'home/b has no owner', 'home/c has no ref', 'home/c is listed twice']);
    expect(
      subFeatureViolations(withSubs([{ id: 'd', name: 'D', owner: 'ported', ref: 'src/pages/Gone.tsx' }]), () => false),
    ).toEqual(['home/d ported to missing src/pages/Gone.tsx']);
    expect(
      subFeatureViolations(withSubs([{ id: 'd2', name: 'D2', owner: 'ported', ref: 'docs/adr/0134.md' }]), present),
    ).toEqual(['home/d2 ported to missing docs/adr/0134.md']);
    expect(
      subFeatureViolations(
        withSubs([{ id: 'f', name: 'F', owner: '1b', ref: 'docs/execution/specs/gone/requirements.md' }]),
        () => false,
      ),
    ).toEqual(['home/f points to missing docs/execution/specs/gone/requirements.md']);
    expect(subFeatureViolations(withSubs([null]), present)).toEqual(['home/(unnamed) has no owner']);
    expect(subFeatureViolations(withSubs([{ id: 'e', name: 'E', owner: 'drop', ref: 'ADR-0134 §6' }]), present)).toEqual([]);
  });
});
