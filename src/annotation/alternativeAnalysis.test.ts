import { describe, expect, it } from 'vitest';
import { annotationAnalysisGraphFixtures } from './annotationAnalysisGraphFixtures';
import {
  listAlternativeAnalysisChoices,
  retainAlternativeAnalyses,
  selectAlternativeAnalysis,
} from './alternativeAnalysis';
import { projectUtteranceAnalysisGraph } from './projectUtteranceAnalysisGraph';
import { validateAnnotationAnalysisGraphFixture } from './analysisGraph';

describe('alternativeAnalysis selection', () => {
  it('lists ambiguity fixture choices as pending', () => {
    const fixture = annotationAnalysisGraphFixtures.find(
      (item) => item.id === 'fixture-ambiguity-bank',
    );
    expect(fixture).toBeDefined();
    const choices = listAlternativeAnalysisChoices(fixture!);
    expect(choices).toEqual([
      expect.objectContaining({
        relationId: 'rel-alt-noun',
        targetLabel: 'NOUN',
        role: 'pending',
      }),
      expect.objectContaining({
        relationId: 'rel-alt-verb',
        targetLabel: 'VERB',
        role: 'pending',
      }),
    ]);
  });

  it('accepts one alternative and rejects siblings, writing hasPos', () => {
    const fixture = annotationAnalysisGraphFixtures.find(
      (item) => item.id === 'fixture-ambiguity-bank',
    )!;
    const next = selectAlternativeAnalysis(fixture, 'rel-alt-noun');
    const choices = listAlternativeAnalysisChoices(next);
    expect(choices.find((choice) => choice.relationId === 'rel-alt-noun')?.role).toBe('accepted');
    expect(choices.find((choice) => choice.relationId === 'rel-alt-verb')?.role).toBe('rejected');
    expect(next.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'hasPos', sourceId: 'tok-1', targetId: 'pos-noun' }),
      ]),
    );
    expect(next.projectionDiagnostics.some((item) => item.message.startsWith('Ambiguous'))).toBe(
      false,
    );
    expect(() => validateAnnotationAnalysisGraphFixture(next)).not.toThrow();
  });

  it('retains alternativeAnalysis nodes across a fresh projection', () => {
    const previous = annotationAnalysisGraphFixtures.find(
      (item) => item.id === 'fixture-ambiguity-bank',
    )!;
    const fresh = projectUtteranceAnalysisGraph({
      id: 'bank-fresh',
      text: 'bank',
      tokens: [{ id: 'tok-1', form: 'bank', pos: 'NOUN' }],
    });
    const retained = retainAlternativeAnalyses(fresh, previous);
    const choices = listAlternativeAnalysisChoices(retained);
    expect(choices).toHaveLength(2);
    expect(retained.nodes.some((node) => node.id === 'pos-verb')).toBe(true);
  });

  it('refuses selection when fewer than two alternatives exist', () => {
    const fixture = annotationAnalysisGraphFixtures.find(
      (item) => item.id === 'fixture-ambiguity-bank',
    )!;
    const alone = validateAnnotationAnalysisGraphFixture({
      ...fixture,
      relations: fixture.relations.filter((relation) => relation.id === 'rel-alt-noun'),
    });
    expect(() => selectAlternativeAnalysis(alone, 'rel-alt-noun')).toThrow(/at least two/);
  });

  it('ignores retokenize edges that share the alternativeAnalysis type', () => {
    const fixture = annotationAnalysisGraphFixtures.find(
      (item) => item.id === 'fixture-ambiguity-bank',
    )!;
    const mixed = validateAnnotationAnalysisGraphFixture({
      ...fixture,
      nodes: [...fixture.nodes, { id: 'tok-snap', type: 'token', label: 'bank' }],
      relations: [
        ...fixture.relations,
        {
          id: 'rel-retok',
          type: 'alternativeAnalysis',
          sourceId: 'tok-1',
          targetId: 'tok-snap',
          role: 'retokenize',
        },
      ],
    });
    expect(listAlternativeAnalysisChoices(mixed).map((choice) => choice.relationId)).toEqual([
      'rel-alt-noun',
      'rel-alt-verb',
    ]);
    const next = selectAlternativeAnalysis(mixed, 'rel-alt-verb');
    expect(next.relations.find((relation) => relation.id === 'rel-retok')?.role).toBe('retokenize');
  });
});
