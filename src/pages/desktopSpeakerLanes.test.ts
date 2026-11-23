import { describe, expect, it } from 'vitest';
import {
  laneLockRow,
  layoutSpeakerLane,
  readLaneModes,
  speakerMenuOrder,
  type SpeakerLaneUnit,
} from './desktopSpeakerLanes';

const units: SpeakerLaneUnit[] = [
  { id: 'a1', startTime: 0, endTime: 2, speakerId: 'a' },
  { id: 'b1', startTime: 1, endTime: 3, speakerId: 'b' },
  { id: 'a2', startTime: 4, endTime: 5, speakerId: 'a' },
];

describe('speaker lanes', () => {
  it('keeps a single row and cycles the overlap without using locks', () => {
    const first = layoutSpeakerLane(units, 'single', { b: 1 }, 0);
    expect(first.rowCount).toBe(1);
    expect(first.overlapCount).toBe(1);
    expect(first.cards.get('a1')).toMatchObject({
      row: 0,
      front: true,
      cycle: { index: 1, total: 2 },
    });
    expect(first.cards.get('b1')?.front).toBe(false);
    const next = layoutSpeakerLane(units, 'single', { b: 1 }, 1);
    expect(next.cards.get('b1')?.front).toBe(true);
    expect(next.cards.get('b1')?.cycle).toEqual({ index: 2, total: 2 });
    expect(next.conflictSpeakerIds).toEqual([]);
  });

  it('cycles a chain so two overlapping cards are never both in front', () => {
    const chain: SpeakerLaneUnit[] = [
      { id: 'a', startTime: 0, endTime: 2, speakerId: 'a' },
      { id: 'b', startTime: 1, endTime: 3, speakerId: 'b' },
      { id: 'c', startTime: 2, endTime: 4, speakerId: 'c' },
    ];
    const fronts = [0, 1, 2].map((step) => {
      const cards = layoutSpeakerLane(chain, 'single', {}, step).cards;
      return [...cards.entries()].filter(([, card]) => card.front).map(([id]) => id);
    });
    expect(fronts).toEqual([['a'], ['b'], ['c']]);
  });

  it('locks only a segment painted on this layer', () => {
    const units = [
      { id: 'here', speakerId: 'a' },
      { id: 'blank', speakerId: null },
    ];
    const cards = new Map([['here', { row: 2 }]]);
    expect(laneLockRow(units, 'here', cards)).toEqual({ speakerId: 'a', row: 2 });
    expect(laneLockRow(units, 'other-layer', cards)).toBeNull();
    expect(laneLockRow(units, 'blank', cards)).toBeNull();
    expect(laneLockRow(units, null, cards)).toBeNull();
    expect(laneLockRow(units, 'here', new Map())).toBeNull();
  });

  it('splits only the overlap in auto and reserves a row per speaker otherwise', () => {
    const auto = layoutSpeakerLane(units, 'auto', {});
    expect(auto.cards.get('a1')?.row).not.toBe(auto.cards.get('b1')?.row);
    expect(auto.cards.get('a2')?.row).toBe(auto.cards.get('a1')?.row);
    const fixed = layoutSpeakerLane(
      [
        { id: 'a1', startTime: 0, endTime: 1, speakerId: 'a' },
        { id: 'b1', startTime: 2, endTime: 3, speakerId: 'b' },
      ],
      'one-per-speaker',
      {},
    );
    expect(fixed.rowCount).toBe(2);
    expect(fixed.cards.get('a1')?.row).not.toBe(fixed.cards.get('b1')?.row);
  });

  it('reports the speaker whose locked row is already taken', () => {
    const laid = layoutSpeakerLane(units, 'auto', { b: 0 });
    expect(laid.conflictSpeakerIds).toContain('b');
  });

  it('lists the three latest speakers, then the rest by name', () => {
    const speakers = [
      { id: 'a', name: '阿达' },
      { id: 'b', name: '白玛' },
      { id: 'c', name: '才让' },
      { id: 'd', name: '达瓦' },
    ];
    const ordered = speakerMenuOrder(speakers, [
      { speakerId: 'c', updatedAt: '2026-01-01T00:00:00.000Z' },
      { speakerId: 'a', updatedAt: '2026-01-03T00:00:00.000Z' },
      { speakerId: 'b', updatedAt: '2026-01-02T00:00:00.000Z' },
      { speakerId: 'a', updatedAt: '2026-01-04T00:00:00.000Z' },
    ]);
    expect(ordered.recent.map((speaker) => speaker.id)).toEqual(['a', 'b', 'c']);
    expect(ordered.rest.map((speaker) => speaker.name)).toEqual(['达瓦']);
  });

  it('ignores a stored mode that is not one of the three', () => {
    expect(readLaneModes('{"tx":"auto","other":"multi-locked"}')).toEqual({ tx: 'auto' });
  });
});
