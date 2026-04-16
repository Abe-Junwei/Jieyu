import { describe, expect, it } from 'vitest';
import type { LayerUnitDocType } from '../db';
import { buildSpeakerLayerLayout, buildSpeakerLayerLayoutWithOptions, buildStableSpeakerLaneMap } from './speakerLayerLayout';

const NOW = '2026-03-24T00:00:00.000Z';

function makeUnit(id: string, start: number, end: number, speakerId?: string): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    startTime: start,
    endTime: end,
    createdAt: NOW,
    updatedAt: NOW,
    ...(speakerId ? { speakerId } : {}),
  };
}

describe('buildSpeakerLayerLayout', () => {
  it('keeps non-overlapping units on a single subtrack', () => {
    const input: LayerUnitDocType[] = [
      makeUnit('u1', 0, 1, 'spk-a'),
      makeUnit('u2', 1, 2, 'spk-b'),
      makeUnit('u3', 2, 3, 'spk-a'),
    ];

    const result = buildSpeakerLayerLayout(input);
    expect(result.subTrackCount).toBe(1);
    expect(result.placements.get('u1')?.subTrackIndex).toBe(0);
    expect(result.placements.get('u2')?.subTrackIndex).toBe(0);
    expect(result.placements.get('u3')?.subTrackIndex).toBe(0);
  });

  it('splits overlapping units into multiple subtracks', () => {
    const input: LayerUnitDocType[] = [
      makeUnit('u1', 0, 4, 'spk-a'),
      makeUnit('u2', 1, 3, 'spk-b'),
      makeUnit('u3', 2, 5, 'spk-c'),
    ];

    const result = buildSpeakerLayerLayout(input);
    expect(result.subTrackCount).toBe(3);
    expect(result.placements.get('u1')?.subTrackIndex).toBe(0);
    expect(result.placements.get('u2')?.subTrackIndex).toBe(1);
    expect(result.placements.get('u3')?.subTrackIndex).toBe(2);
  });

  it('uses transitive overlap group ids for partial overlaps', () => {
    const input: LayerUnitDocType[] = [
      makeUnit('u1', 0, 3, 'spk-a'),
      makeUnit('u2', 2, 5, 'spk-b'),
      makeUnit('u3', 4, 7, 'spk-c'),
    ];

    const result = buildSpeakerLayerLayout(input);
    const g1 = result.placements.get('u1')?.overlapGroupId;
    const g2 = result.placements.get('u2')?.overlapGroupId;
    const g3 = result.placements.get('u3')?.overlapGroupId;

    expect(g1).toBeDefined();
    expect(g1).toBe(g2);
    expect(g2).toBe(g3);
  });

  it('reports max concurrent speaker count for overlap hint', () => {
    const input: LayerUnitDocType[] = [
      makeUnit('u1', 0, 5, 'spk-a'),
      makeUnit('u2', 1, 4, 'spk-b'),
      makeUnit('u3', 2, 3, 'spk-c'),
    ];

    const result = buildSpeakerLayerLayout(input);
    expect(result.maxConcurrentSpeakerCount).toBe(3);
  });

  it('prefers locked lane for selected speaker when lane is available', () => {
    const input: LayerUnitDocType[] = [
      makeUnit('u1', 0, 3, 'spk-a'),
      makeUnit('u2', 0.5, 2.5, 'spk-b'),
      makeUnit('u3', 3, 4, 'spk-b'),
    ];

    const result = buildSpeakerLayerLayoutWithOptions(input, {
      laneLockMap: { 'spk-b': 2 },
    });

    expect(result.placements.get('u3')?.subTrackIndex).toBe(2);
    expect(result.subTrackCount).toBe(3);
    expect(result.lockConflictCount).toBe(0);
  });

  it('reports lock conflicts when locked lane is occupied', () => {
    const input: LayerUnitDocType[] = [
      makeUnit('u1', 0, 4, 'spk-a'),
      makeUnit('u2', 1, 3, 'spk-b'),
    ];

    const result = buildSpeakerLayerLayoutWithOptions(input, {
      laneLockMap: { 'spk-b': 0 },
    });

    expect(result.lockConflictCount).toBe(1);
    expect(result.lockConflictSpeakerIds).toContain('spk-b');
    expect(result.placements.get('u2')?.subTrackIndex).toBe(1);
  });

  it('uses speaker sort key to keep deterministic lane assignment priority', () => {
    const input: LayerUnitDocType[] = [
      makeUnit('u1', 0, 4, 'spk-a'),
      makeUnit('u2', 0, 4, 'spk-b'),
    ];

    const result = buildSpeakerLayerLayoutWithOptions(input, {
      speakerSortKeyById: { 'spk-b': 0, 'spk-a': 1 },
    });

    expect(result.placements.get('u2')?.subTrackIndex).toBe(0);
    expect(result.placements.get('u1')?.subTrackIndex).toBe(1);
  });

  it('builds a stable contiguous speaker lane map for fixed speaker lanes', () => {
    const laneMap = buildStableSpeakerLaneMap(['spk-b', 'spk-a', 'spk-c'], { 'spk-c': 5, 'spk-a': 2 }, { 'spk-b': 0, 'spk-a': 1, 'spk-c': 2 });

    expect(laneMap).toEqual({ 'spk-a': 0, 'spk-c': 1, 'spk-b': 2 });
  });

  it('keeps one speaker on one fixed lane and marks self-overlap as conflict', () => {
    const input: LayerUnitDocType[] = [
      makeUnit('u1', 0, 4, 'spk-a'),
      makeUnit('u2', 1, 3, 'spk-a'),
      makeUnit('u3', 1, 3, 'spk-b'),
    ];

    const result = buildSpeakerLayerLayoutWithOptions(input, {
      trackMode: 'multi-speaker-fixed',
      laneLockMap: { 'spk-a': 3 },
    });

    expect(result.placements.get('u1')?.subTrackIndex).toBe(0);
    expect(result.placements.get('u2')?.subTrackIndex).toBe(0);
    expect(result.placements.get('u3')?.subTrackIndex).toBe(1);
    expect(result.lockConflictCount).toBe(1);
    expect(result.lockConflictSpeakerIds).toContain('spk-a');
  });

  it('places unassigned units in a separate overflow pool in fixed speaker mode', () => {
    const input: LayerUnitDocType[] = [
      makeUnit('u1', 0, 4, 'spk-a'),
      makeUnit('u2', 1, 3),
      makeUnit('u3', 1.5, 2.5),
    ];

    const result = buildSpeakerLayerLayoutWithOptions(input, {
      trackMode: 'multi-speaker-fixed',
    });

    expect(result.placements.get('u1')?.subTrackIndex).toBe(0);
    expect(result.placements.get('u2')?.subTrackIndex).toBe(1);
    expect(result.placements.get('u3')?.subTrackIndex).toBe(2);
  });
});
