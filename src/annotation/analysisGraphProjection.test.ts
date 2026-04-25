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
      'glosses',
      'contains',
      'realizesFeature',
      'glosses',
      'cliticizesTo',
    ]);
    expect(graph.projectionDiagnostics.every((diagnostic) => diagnostic.status === 'complete')).toBe(true);
  });

  it('projects infix and supplied zero as explicit candidate graph structure', () => {
    const parseResult = parseGlossStructure('touch<PRS> sheep-[ZERO]');
    const graph = projectStructuralParseToAnalysisGraph(parseResult);

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'morpheme', label: 'PRS', features: { role: 'infix' } }),
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
    expect(graph.projectionDiagnostics).toHaveLength(1);
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'morpheme', label: 'root' }),
      expect.objectContaining({ type: 'morpheme', label: 'PRS', features: { role: 'infix' } }),
      expect.objectContaining({ type: 'zero', label: 'Ø' }),
      expect.objectContaining({ type: 'gloss', label: 'COP' }),
    ]));
    expect(graph.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'cliticizesTo' }),
    ]));
  });
});
