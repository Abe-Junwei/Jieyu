import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { acceptAnalysisGraphCandidate, listPendingAnalysisGraphCandidates, rejectAnalysisGraphCandidate } from '../../annotation/analysisGraphConfirmation';
import {
  confirmAnnotationStructuralCandidate,
  previewAnnotationStructuralCandidate,
} from './annotationStructuralPreviewController';

describe('annotation structural preview controller', () => {
  beforeEach(async () => {
    await db.structural_rule_profiles.clear();
    await db.unit_relations.clear();
  });

  it('previews a candidate without writing annotation relations', async () => {
    const preview = await previewAnnotationStructuralCandidate({
      languageId: 'zho',
      glossText: 'dog-PL',
    });

    expect(preview.canConfirmWithoutReview).toBe(true);
    expect(preview.segments.map((segment) => segment.text)).toEqual(['dog', 'PL']);
    expect(preview.boundaries.map((boundary) => boundary.type)).toEqual(['morpheme']);
    expect(await db.unit_relations.count()).toBe(0);
  });

  it('confirms a clean candidate as a pending analysis graph relation', async () => {
    const preview = await previewAnnotationStructuralCandidate({
      glossText: 'dog-PL',
    });
    const relation = await confirmAnnotationStructuralCandidate({
      textId: 'text-1',
      unitId: 'unit-1',
      preview,
      actorId: 'user-1',
    });

    expect(relation.relationType).toBe('analysis_graph_candidate');
    expect(relation.analysisGraphStatus).toBe('pending');
    expect(relation.provenance?.reviewStatus).toBe('suggested');
    expect(relation.provenance?.actorId).toBe('user-1');
    expect(await db.unit_relations.count()).toBe(1);
    expect(await listPendingAnalysisGraphCandidates('unit-1')).toHaveLength(1);
  });

  it('accepts and rejects pending candidate lifecycle records', async () => {
    const preview = await previewAnnotationStructuralCandidate({
      glossText: 'dog-PL',
    });
    const first = await confirmAnnotationStructuralCandidate({
      textId: 'text-1',
      unitId: 'unit-1',
      preview,
    });
    const second = await confirmAnnotationStructuralCandidate({
      textId: 'text-1',
      unitId: 'unit-1',
      preview,
    });

    const accepted = await acceptAnalysisGraphCandidate(first.id, { type: 'human', id: 'reviewer-1' });
    const rejected = await rejectAnalysisGraphCandidate(second.id, { type: 'human', id: 'reviewer-1' });

    expect(accepted.analysisGraphStatus).toBe('accepted');
    expect(accepted.manualConfirmed).toBe(true);
    expect(accepted.provenance?.reviewStatus).toBe('confirmed');
    expect(rejected.analysisGraphStatus).toBe('rejected');
    expect(rejected.provenance?.reviewStatus).toBe('rejected');
    expect(await listPendingAnalysisGraphCandidates('unit-1')).toHaveLength(0);
  });

  it('rejects a second accept when the unit already has an accepted analysis graph candidate', async () => {
    const preview = await previewAnnotationStructuralCandidate({ glossText: 'dog-PL' });
    const first = await confirmAnnotationStructuralCandidate({
      textId: 'text-1',
      unitId: 'unit-1',
      preview,
    });
    const second = await confirmAnnotationStructuralCandidate({
      textId: 'text-1',
      unitId: 'unit-1',
      preview,
    });
    await acceptAnalysisGraphCandidate(first.id, { type: 'human', id: 'reviewer-1' });
    await expect(acceptAnalysisGraphCandidate(second.id, { type: 'human', id: 'reviewer-1' })).rejects.toThrow(
      'an accepted analysis graph candidate already exists',
    );
  });

  it('blocks needs-review candidates unless explicitly allowed', async () => {
    const preview = await previewAnnotationStructuralCandidate({
      glossText: 'dog<PL',
    });

    expect(preview.canConfirmWithoutReview).toBe(false);
    await expect(confirmAnnotationStructuralCandidate({
      textId: 'text-1',
      unitId: 'unit-1',
      preview,
    })).rejects.toThrow('needs review');
    expect(await db.unit_relations.count()).toBe(0);

    await confirmAnnotationStructuralCandidate({
      textId: 'text-1',
      unitId: 'unit-1',
      preview,
      allowNeedsReview: true,
    });
    expect(await db.unit_relations.count()).toBe(1);
  });
});
