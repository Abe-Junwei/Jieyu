/**
 * JY-06：备注归属解析表必须覆盖每一种目标类型。
 * JY-06: the note ownership table must cover every target type.
 */
import { describe, expect, it } from 'vitest';
import {
  NOTE_OWNER_RESOLVERS,
  NOTE_TARGET_TYPES,
  noteBelongsToProject,
  type ProjectOwnedIds,
} from './projectLocalPurge';
import type { NoteTargetType, UserNoteDocType } from './types';

// 编译期：列表与联合类型完全一致 | Compile time: the list equals the union
type MissingTargetType = Exclude<NoteTargetType, (typeof NOTE_TARGET_TYPES)[number]>;
const exhaustive: [MissingTargetType] extends [never] ? true : false = true;

const owned: ProjectOwnedIds = {
  projectId: 'text-1',
  unitIds: new Set(['u1']),
  tokenIds: new Set(['t1']),
  morphemeIds: new Set(['m1']),
  contentIds: new Set(['c1']),
  annotationIds: new Set(['a1']),
  lexemeIds: new Set(['lx1']),
  layerIds: new Set(['L1']),
};

type NoteInput = Pick<UserNoteDocType, 'targetType' | 'targetId' | 'parentTargetId'>;

/** 每种类型一条属于项目、一条不属于的样例 | One owned and one foreign sample per type */
const CASES: Record<NoteTargetType, { mine: NoteInput[]; foreign: NoteInput[] }> = {
  text: {
    mine: [{ targetType: 'text', targetId: 'text-1' }],
    foreign: [{ targetType: 'text', targetId: 'text-2' }],
  },
  unit: {
    mine: [{ targetType: 'unit', targetId: 'u1' }],
    foreign: [{ targetType: 'unit', targetId: 'u9' }],
  },
  token: {
    mine: [{ targetType: 'token', targetId: 't1' }],
    foreign: [{ targetType: 'token', targetId: 't9' }],
  },
  morpheme: {
    mine: [{ targetType: 'morpheme', targetId: 'm1' }],
    foreign: [{ targetType: 'morpheme', targetId: 'm9' }],
  },
  translation: {
    mine: [{ targetType: 'translation', targetId: 'c1' }],
    foreign: [{ targetType: 'translation', targetId: 'c9' }],
  },
  annotation: {
    mine: [{ targetType: 'annotation', targetId: 'a1' }],
    foreign: [{ targetType: 'annotation', targetId: 'a9' }],
  },
  lexeme: {
    mine: [{ targetType: 'lexeme', targetId: 'lx1' }],
    foreign: [{ targetType: 'lexeme', targetId: 'lx9' }],
  },
  sense: {
    mine: [{ targetType: 'sense', targetId: 's1', parentTargetId: 'lx1' }],
    foreign: [
      { targetType: 'sense', targetId: 's1', parentTargetId: 'lx9' },
      { targetType: 'sense', targetId: 's1' },
    ],
  },
  tier_annotation: {
    mine: [
      { targetType: 'tier_annotation', targetId: 'u1::L9' },
      { targetType: 'tier_annotation', targetId: 'u1::L1::@waveform' },
      { targetType: 'tier_annotation', targetId: 'u9::L1' },
      { targetType: 'tier_annotation', targetId: 'a1' },
    ],
    foreign: [{ targetType: 'tier_annotation', targetId: 'u9::L9' }],
  },
};

describe('note ownership table (JY-06)', () => {
  it('covers every target type', () => {
    expect(exhaustive).toBe(true);
    expect([...NOTE_TARGET_TYPES].sort()).toEqual(Object.keys(CASES).sort());
    for (const type of NOTE_TARGET_TYPES) {
      expect(typeof NOTE_OWNER_RESOLVERS[type]).toBe('function');
    }
  });

  it.each(Object.entries(CASES))('%s: owned vs foreign', (_type, { mine, foreign }) => {
    for (const note of mine) expect(noteBelongsToProject(note, owned)).toBe(true);
    for (const note of foreign) expect(noteBelongsToProject(note, owned)).toBe(false);
  });

  it('unknown or prototype-like target types are never owned', () => {
    for (const targetType of ['bogus', 'constructor', 'toString', '__proto__']) {
      expect(
        noteBelongsToProject(
          { targetType: targetType as NoteTargetType, targetId: 'text-1' },
          owned,
        ),
      ).toBe(false);
    }
  });
});
