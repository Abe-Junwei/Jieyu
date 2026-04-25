import { describe, expect, it } from 'vitest';
import { annotationAnalysisGraphFixtureIds, annotationAnalysisGraphFixtures } from './annotationAnalysisGraphFixtures';
import {
  summarizeProjectionDiagnostics,
  validateAnnotationAnalysisGraphFixture,
  type AnnotationAnalysisGraphFixture,
} from './analysisGraph';

function cloneFixture(fixture: AnnotationAnalysisGraphFixture): AnnotationAnalysisGraphFixture {
  return JSON.parse(JSON.stringify(fixture)) as AnnotationAnalysisGraphFixture;
}

describe('annotation analysisGraph schema', () => {
  it('accepts the fixture-first baseline graphs', () => {
    expect(annotationAnalysisGraphFixtureIds).toEqual([
      'fixture-clitic-im',
      'fixture-mwe-take-a-walk',
      'fixture-zero-plural',
      'fixture-infix',
      'fixture-circumfix',
      'fixture-reduplication',
      'fixture-root-pattern',
      'fixture-suppletion-portmanteau',
    ]);

    for (const fixture of annotationAnalysisGraphFixtures) {
      expect(() => validateAnnotationAnalysisGraphFixture(fixture)).not.toThrow();
    }
  });

  it('keeps representative relation types explicit', () => {
    const relationTypes = new Set(annotationAnalysisGraphFixtures.flatMap((fixture) => fixture.relations.map((relation) => relation.type)));

    expect(relationTypes).toContain('cliticizesTo');
    expect(relationTypes).toContain('partOfMwe');
    expect(relationTypes).toContain('discontinuousPartOf');
    expect(relationTypes).toContain('reduplicates');
    expect(relationTypes).toContain('suppletes');
    expect(relationTypes).toContain('realizesFeature');
  });

  it('rejects relation endpoints that do not exist', () => {
    const fixture = cloneFixture(annotationAnalysisGraphFixtures[0]!);
    fixture.relations[0] = { ...fixture.relations[0]!, sourceId: 'missing-node' };

    expect(() => validateAnnotationAnalysisGraphFixture(fixture)).toThrow('relation source does not exist: missing-node');
  });

  it('rejects duplicate node ids', () => {
    const fixture = cloneFixture(annotationAnalysisGraphFixtures[1]!);
    fixture.nodes[1] = { ...fixture.nodes[1]!, id: fixture.nodes[0]!.id };

    expect(() => validateAnnotationAnalysisGraphFixture(fixture)).toThrow('duplicate node id');
  });

  it('rejects incomplete or inverted surface offsets', () => {
    const fixture = cloneFixture(annotationAnalysisGraphFixtures[3]!);
    fixture.nodes[1] = {
      ...fixture.nodes[1]!,
      surfaceParts: [{ tokenId: 'tok-1', startOffset: 2 }],
    };
    expect(() => validateAnnotationAnalysisGraphFixture(fixture)).toThrow('startOffset and endOffset must be provided together');

    const inverted = cloneFixture(annotationAnalysisGraphFixtures[3]!);
    inverted.nodes[1] = {
      ...inverted.nodes[1]!,
      surfaceParts: [{ tokenId: 'tok-1', startOffset: 3, endOffset: 2 }],
    };
    expect(() => validateAnnotationAnalysisGraphFixture(inverted)).toThrow('endOffset must be greater than startOffset');
  });
});

describe('projection diagnostic summary', () => {
  it('summarizes diagnostic statuses for future UI and export gates', () => {
    const summary = summarizeProjectionDiagnostics([
      { target: 'latex', status: 'complete', message: 'ready' },
      { target: 'conllu', status: 'degraded', message: 'stored in MISC' },
      { target: 'flex', status: 'needsReview', message: 'choose custom field' },
      { target: 'elan', status: 'unsupported', message: 'cannot represent graph edge' },
    ]);

    expect(summary).toEqual({
      total: 4,
      byStatus: {
        complete: 1,
        degraded: 1,
        unsupported: 1,
        needsReview: 1,
      },
      blockingCount: 2,
    });
  });
});
