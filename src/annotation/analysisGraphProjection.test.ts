import { describe, expect, it } from 'vitest';
import { projectStructuralParseToAnalysisGraph } from './analysisGraphProjection';
import { summarizeProjectionDiagnostics, validateAnnotationAnalysisGraphFixture } from './analysisGraph';
import { DEFAULT_LEIPZIG_STRUCTURAL_PROFILE, parseGlossStructure, type StructuralRuleProfile } from './structuralRuleProfile';

describe('structural parse to analysisGraph projection', () => {
  it('projects default Leipzig morpheme, feature, and clitic structure into candidate graph nodes', () => {
    const parseResult = parseGlossStructure('1SG=COP dog-PL');
    const graph = projectStructuralParseToAnalysisGraph(parseResult, {
      id: 'candidate-default-leipzig',
      text: '1SG=COP dog-PL',
    });

    expect(() => validateAnnotationAnalysisGraphFixture(graph)).not.toThrow();
    expect(graph.nodes.map((node) => [node.id, node.type, node.label])).toEqual([
      ['token-1', 'token', '1SG=COP dog-PL'],
      ['gloss-1', 'gloss', '1SG'],
      ['feature-1', 'featureBundle', '1SG'],
      ['gloss-2', 'gloss', 'COP'],
      ['feature-2', 'featureBundle', 'COP'],
      ['morph-3', 'morpheme', 'dog'],
      ['gloss-4', 'gloss', 'PL'],
      ['feature-4', 'featureBundle', 'PL'],
    ]);
    expect(graph.relations.map((relation) => relation.type)).toEqual([
      'realizesFeature',
      'realizesFeature',
      'contains',
      'realizesFeature',
      'glosses',
    ]);
    expect(graph.relations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'glosses', targetId: 'gloss-1' }),
      expect.objectContaining({ type: 'cliticizesTo' }),
    ]));
    expect(graph.projectionDiagnostics.some((diagnostic) => diagnostic.status === 'needsReview')).toBe(true);
    expect(graph.projectionDiagnostics.some((d) => d.message.includes('cliticizesTo skipped'))).toBe(true);
    const cliticDiag = graph.projectionDiagnostics.find((d) => d.message.includes('cliticizesTo skipped'));
    expect(cliticDiag?.subject).toEqual(expect.objectContaining({ kind: 'cliticBoundary' }));
  });

  it('projects infix and supplied zero as explicit candidate graph structure', () => {
    const parseResult = parseGlossStructure('touch<PRS> sheep-[ZERO]');
    const graph = projectStructuralParseToAnalysisGraph(parseResult);

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'morpheme', label: 'PRS', features: expect.objectContaining({ role: 'infix' }) }),
      expect.objectContaining({ type: 'zero', label: 'ZERO' }),
      expect.objectContaining({ type: 'featureBundle', label: 'ZERO' }),
    ]));
    expect(graph.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'contains', role: 'infix' }),
      expect.objectContaining({ type: 'realizesFeature', sourceId: 'zero-4' }),
    ]));
  });

  it('carries review diagnostics from parse warnings into candidate projection', () => {
    const parseResult = parseGlossStructure('touch<PRS');
    const graph = projectStructuralParseToAnalysisGraph(parseResult);
    const summary = summarizeProjectionDiagnostics(graph.projectionDiagnostics);

    expect(summary.blockingCount).toBe(2);
    expect(graph.projectionDiagnostics.every((diagnostic) => diagnostic.status === 'needsReview')).toBe(true);
  });

  it('respects custom language asset profiles during projection', () => {
    const customProfile: StructuralRuleProfile = {
      ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
      id: 'language.custom-structural.v1',
      label: 'Custom language structural profile',
      scope: 'language',
      symbols: {
        morphemeBoundary: '_',
        featureSeparator: ':',
        cliticBoundary: '+',
        infixStart: '{',
        infixEnd: '}',
        suppliedStart: '(',
        suppliedEnd: ')',
        alternationMarker: '~',
      },
      zeroMarkers: ['Ø'],
      reduplicationMarkers: ['DUP'],
      projectionTargets: ['latex'],
    };
    const parseResult = parseGlossStructure('root{PRS}_Ø+COP', customProfile);
    const graph = projectStructuralParseToAnalysisGraph(parseResult, {
      id: 'candidate-custom-profile',
      displayGloss: 'root{PRS}_Ø+COP',
    });

    expect(graph.id).toBe('candidate-custom-profile');
    expect(graph.projectionDiagnostics.some((diagnostic) => diagnostic.status === 'needsReview')).toBe(true);
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'morpheme', label: 'root' }),
      expect.objectContaining({ type: 'morpheme', label: 'PRS', features: expect.objectContaining({ role: 'infix' }) }),
      expect.objectContaining({ type: 'zero', label: 'Ø' }),
      expect.objectContaining({ type: 'gloss', label: 'COP' }),
    ]));
    expect(graph.relations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'cliticizesTo', targetId: expect.stringMatching(/^gloss-/) }),
    ]));
  });

  it('projects reduplication markers into reduplicates relations', () => {
    const parseResult = parseGlossStructure('REDUP-dog');
    const graph = projectStructuralParseToAnalysisGraph(parseResult);

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'morpheme', label: 'REDUP', features: expect.objectContaining({ role: 'reduplicant' }) }),
      expect.objectContaining({ type: 'morpheme', label: 'dog' }),
    ]));
    expect(graph.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'reduplicates' }),
    ]));
  });
});
