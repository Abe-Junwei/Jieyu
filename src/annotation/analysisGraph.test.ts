import { describe, expect, it } from 'vitest';
import {
  annotationAnalysisGraphFixtureIds,
  annotationAnalysisGraphFixtures,
} from './annotationAnalysisGraphFixtures';
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
      'fixture-cumulative-exponence',
      'fixture-multiple-exponence',
      'fixture-ambiguity-bank',
      'fixture-ablaut-sang',
      'fixture-truncation-exam',
      'fixture-tone-overwrite',
    ]);

    for (const fixture of annotationAnalysisGraphFixtures) {
      expect(() => validateAnnotationAnalysisGraphFixture(fixture)).not.toThrow();
    }
  });

  it('keeps representative relation types explicit', () => {
    const relationTypes = new Set(
      annotationAnalysisGraphFixtures.flatMap((fixture) =>
        fixture.relations.map((relation) => relation.type),
      ),
    );

    expect(relationTypes).toContain('cliticizesTo');
    expect(relationTypes).toContain('partOfMwe');
    expect(relationTypes).toContain('discontinuousPartOf');
    expect(relationTypes).toContain('reduplicates');
    expect(relationTypes).toContain('suppletes');
    expect(relationTypes).toContain('realizesFeature');
    expect(relationTypes).toContain('alternativeAnalysis');
    expect(relationTypes).toContain('substitutesSegment');
    expect(relationTypes).toContain('deletesSegment');
    expect(relationTypes).toContain('overwritesTone');
  });

  it('models root-pattern without inventing linear morpheme cuts', () => {
    const fixture = annotationAnalysisGraphFixtures.find(
      (item) => item.id === 'fixture-root-pattern',
    );
    expect(fixture).toBeDefined();
    const root = fixture!.nodes.find((node) => node.type === 'root');
    const pattern = fixture!.nodes.find((node) => node.type === 'pattern');
    expect(root?.surfaceParts).toHaveLength(3);
    expect(pattern).toBeDefined();
    expect(fixture!.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'discontinuousPartOf',
          sourceId: 'root-1',
          targetId: 'tok-1',
        }),
        expect.objectContaining({
          type: 'realizesFeature',
          sourceId: 'pattern-1',
          targetId: 'feature-1',
        }),
        expect.objectContaining({
          type: 'derivedByProcess',
          sourceId: 'tok-1',
          targetId: 'process-1',
        }),
      ]),
    );
  });

  it('models cumulative exponence as one exponent realizing many features', () => {
    const fixture = annotationAnalysisGraphFixtures.find(
      (item) => item.id === 'fixture-cumulative-exponence',
    );
    expect(fixture).toBeDefined();
    const realizes = fixture!.relations.filter((relation) => relation.type === 'realizesFeature');
    expect(realizes).toHaveLength(3);
    expect(new Set(realizes.map((relation) => relation.sourceId))).toEqual(new Set(['exponent-1']));
    expect(new Set(realizes.map((relation) => relation.targetId))).toEqual(
      new Set(['feature-case', 'feature-number', 'feature-gender']),
    );
  });

  it('models multiple exponence as many exponents realizing one feature', () => {
    const fixture = annotationAnalysisGraphFixtures.find(
      (item) => item.id === 'fixture-multiple-exponence',
    );
    expect(fixture).toBeDefined();
    const realizes = fixture!.relations.filter((relation) => relation.type === 'realizesFeature');
    expect(realizes).toHaveLength(2);
    expect(new Set(realizes.map((relation) => relation.targetId))).toEqual(
      new Set(['feature-ptcp']),
    );
    expect(new Set(realizes.map((relation) => relation.sourceId))).toEqual(
      new Set(['exponent-prefix', 'exponent-suffix']),
    );
    expect(
      fixture!.projectionDiagnostics.some((diagnostic) => diagnostic.status !== 'complete'),
    ).toBe(true);
  });

  it('models ablaut, truncation, and tone without a linear morpheme cut', () => {
    const cases = [
      ['fixture-ablaut-sang', 'substitutesSegment'],
      ['fixture-truncation-exam', 'deletesSegment'],
      ['fixture-tone-overwrite', 'overwritesTone'],
    ] as const;
    for (const [id, relationType] of cases) {
      const fixture = annotationAnalysisGraphFixtures.find((item) => item.id === id);
      expect(fixture).toBeDefined();
      expect(fixture!.nodes.some((node) => node.type === 'morpheme')).toBe(false);
      expect(fixture!.relations).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: relationType })]),
      );
    }
    const tone = annotationAnalysisGraphFixtures.find(
      (item) => item.id === 'fixture-tone-overwrite',
    );
    expect(tone!.nodes.some((node) => node.type === 'prosodicFeature')).toBe(true);
  });

  it('rejects relation endpoints that do not exist', () => {
    const fixture = cloneFixture(annotationAnalysisGraphFixtures[0]!);
    fixture.relations[0] = { ...fixture.relations[0]!, sourceId: 'missing-node' };

    expect(() => validateAnnotationAnalysisGraphFixture(fixture)).toThrow(
      'relation source does not exist: missing-node',
    );
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
    expect(() => validateAnnotationAnalysisGraphFixture(fixture)).toThrow(
      'startOffset and endOffset must be provided together',
    );

    const inverted = cloneFixture(annotationAnalysisGraphFixtures[3]!);
    inverted.nodes[1] = {
      ...inverted.nodes[1]!,
      surfaceParts: [{ tokenId: 'tok-1', startOffset: 3, endOffset: 2 }],
    };
    expect(() => validateAnnotationAnalysisGraphFixture(inverted)).toThrow(
      'endOffset must be greater than startOffset',
    );
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
