import { describe, expect, it } from 'vitest';
import { buildUnifiedUnitBackfill } from './migrations/buildUnifiedUnitBackfill';
import { verifyUnifiedUnitBackfill } from './migrations/verifyUnifiedUnitBackfill';
import { mapUtteranceToLayerUnit } from './migrations/timelineUnitMapping';

describe('db unification migration replay', () => {
  it('builds deterministic canonical units from legacy utterance and segment fixtures', () => {
    const payload = buildUnifiedUnitBackfill({
      utterances: [{
        id: 'utt-1',
        textId: 'text-1',
        mediaId: 'media-1',
        transcription: { default: 'hello' },
        startTime: 0,
        endTime: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      segments: [{
        id: 'seg-1',
        textId: 'text-2',
        mediaId: 'media-1',
        layerId: 'layer-translation',
        utteranceId: 'utt-1',
        startTime: 0,
        endTime: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      segmentContents: [{
        id: 'content-1',
        textId: 'text-2',
        segmentId: 'seg-1',
        layerId: 'layer-translation',
        modality: 'text',
        text: 'hola',
        sourceType: 'human',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      defaultTranscriptionLayerId: 'layer-transcription',
    });

    expect(verifyUnifiedUnitBackfill(payload)).toEqual({ ok: true, errors: [] });
    expect(payload.units.map((unit) => unit.id)).toEqual(['utt-1', 'seg-1']);
    expect(payload.relations[0]?.targetUnitId).toBe('utt-1');
  });

  it('verifyUnifiedUnitBackfill flags duplicate unit ids and duplicate relation ids', () => {
    const { unit, content } = mapUtteranceToLayerUnit({
      id: 'dup',
      textId: 't-dup',
      mediaId: 'm1',
      transcription: { default: 'x' },
      startTime: 0,
      endTime: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }, 'layer-t');
    const bad = verifyUnifiedUnitBackfill({
      units: [unit, unit],
      contents: [content],
      relations: [
        {
          id: 'rel-1',
          textId: 't1',
          sourceUnitId: 'dup',
          targetUnitId: 'missing',
          relationType: 'derived_from',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'rel-1',
          textId: 't1',
          sourceUnitId: 'dup',
          targetUnitId: 'missing',
          relationType: 'derived_from',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.includes('duplicate unit id'))).toBe(true);
    expect(bad.errors.some((e) => e.includes('duplicate relation id'))).toBe(true);
    expect(bad.errors.some((e) => e.includes('missing target unit'))).toBe(true);
  });

  it('verifyUnifiedUnitBackfill flags content textId/layerId drift from owning unit', () => {
    const { unit, content } = mapUtteranceToLayerUnit({
      id: 'u1',
      textId: 'text-1',
      mediaId: 'm1',
      transcription: { default: 'x' },
      startTime: 0,
      endTime: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }, 'layer-t');
    const driftText = { ...content, textId: 'wrong-text' };
    expect(verifyUnifiedUnitBackfill({ units: [unit], contents: [driftText], relations: [] }).ok).toBe(false);
    const driftLayer = { ...content, layerId: 'other-layer' };
    expect(verifyUnifiedUnitBackfill({ units: [unit], contents: [driftLayer], relations: [] }).ok).toBe(false);
  });

  it('verifyUnifiedUnitBackfill flags self-loop relations and invalid relationType', () => {
    const { unit, content } = mapUtteranceToLayerUnit({
      id: 'u1',
      textId: 'text-1',
      mediaId: 'm1',
      transcription: { default: 'x' },
      startTime: 0,
      endTime: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }, 'layer-t');
    const selfLoop = {
      id: 'rel-bad',
      textId: 't1',
      sourceUnitId: 'u1',
      targetUnitId: 'u1',
      relationType: 'derived_from' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(verifyUnifiedUnitBackfill({ units: [unit], contents: [content], relations: [selfLoop] }).ok).toBe(false);

    const badType = {
      ...selfLoop,
      id: 'rel-type',
      targetUnitId: 'u2',
      relationType: 'not_a_relation' as unknown as 'derived_from',
    };
    const u2 = { ...unit, id: 'u2', textId: 'text-2' };
    expect(verifyUnifiedUnitBackfill({ units: [unit, u2], contents: [content], relations: [badType] }).ok).toBe(false);
  });
});
