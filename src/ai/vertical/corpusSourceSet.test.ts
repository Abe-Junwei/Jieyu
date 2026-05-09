import { describe, expect, it } from 'vitest';
import {
  createSavedSourceSet,
  renameSavedSourceSet,
  bindSourceSetToSession,
  unbindSourceSetFromSession,
  switchActiveSourceSet,
  validateSourceSetMembers,
  invalidateSourceSet,
  pruneInvalidatedSourceSets,
  exportReferenceSummary,
  buildSourceSetFallbackReason,
  deleteSavedSourceSet,
  type SavedCorpusSourceSet,
} from './corpusSourceSet';

const fixedTimestamp = '2026-05-06T12:00:00.000Z';

function makeSourceSet(overrides: Partial<SavedCorpusSourceSet> = {}): SavedCorpusSourceSet {
  return {
    id: 'css_test_001',
    name: 'Test Source Set',
    scope: 'selection',
    members: [
      { id: 'seg-1', type: 'segment', label: 'Segment 1' },
      { id: 'seg-2', type: 'segment', label: 'Segment 2' },
    ],
    mediaId: 'media-1',
    layerId: 'layer-1',
    status: 'active',
    createdAt: fixedTimestamp,
    updatedAt: fixedTimestamp,
    ...overrides,
  };
}

describe('createSavedSourceSet', () => {
  it('creates a source set with defaults', () => {
    const result = createSavedSourceSet(
      { name: 'My Set', scope: 'current_segment' },
      { id: 'css_001', timestamp: fixedTimestamp },
    );
    expect(result.id).toBe('css_001');
    expect(result.name).toBe('My Set');
    expect(result.scope).toBe('current_segment');
    expect(result.members).toEqual([]);
    expect(result.status).toBe('active');
    expect(result.createdAt).toBe(fixedTimestamp);
  });

  it('trims name', () => {
    const result = createSavedSourceSet(
      { name: '  My Set  ', scope: 'project' },
      { timestamp: fixedTimestamp },
    );
    expect(result.name).toBe('My Set');
  });

  it('includes optional fields when provided', () => {
    const result = createSavedSourceSet(
      {
        name: 'Full Set',
        scope: 'selection',
        members: [{ id: 'n1', type: 'note' }],
        mediaId: 'm1',
        layerId: 'l1',
        projectId: 'p1',
        boundSessionId: 'sess-1',
      },
      { timestamp: fixedTimestamp },
    );
    expect(result.mediaId).toBe('m1');
    expect(result.layerId).toBe('l1');
    expect(result.projectId).toBe('p1');
    expect(result.boundSessionId).toBe('sess-1');
    expect(result.members).toHaveLength(1);
  });

  it('generates id when not provided', () => {
    const result = createSavedSourceSet({ name: 'Auto', scope: 'project' });
    expect(result.id).toMatch(/^css_\d+_/);
  });
});

describe('renameSavedSourceSet', () => {
  it('renames and updates timestamp', () => {
    const original = makeSourceSet();
    const renamed = renameSavedSourceSet(original, 'New Name', {
      timestamp: '2026-05-07T00:00:00.000Z',
    });
    expect(renamed.name).toBe('New Name');
    expect(renamed.updatedAt).toBe('2026-05-07T00:00:00.000Z');
    expect(renamed.id).toBe(original.id);
  });
});

describe('bindSourceSetToSession', () => {
  it('binds to session', () => {
    const original = makeSourceSet();
    const bound = bindSourceSetToSession(original, 'sess-42', {
      timestamp: '2026-05-07T00:00:00.000Z',
    });
    expect(bound.boundSessionId).toBe('sess-42');
    expect(bound.updatedAt).toBe('2026-05-07T00:00:00.000Z');
  });
});

describe('unbindSourceSetFromSession', () => {
  it('removes boundSessionId', () => {
    const original = makeSourceSet({ boundSessionId: 'sess-42' });
    const unbound = unbindSourceSetFromSession(original, { timestamp: '2026-05-07T00:00:00.000Z' });
    expect(unbound.boundSessionId).toBeUndefined();
    expect(unbound.updatedAt).toBe('2026-05-07T00:00:00.000Z');
  });
});

describe('switchActiveSourceSet', () => {
  it('activates target and deactivates others in same session', () => {
    const sets: SavedCorpusSourceSet[] = [
      makeSourceSet({ id: 'a', boundSessionId: 'sess-1', status: 'active' }),
      makeSourceSet({ id: 'b', boundSessionId: 'sess-1', status: 'inactive' }),
      makeSourceSet({ id: 'c', boundSessionId: 'sess-2', status: 'active' }),
    ];
    const result = switchActiveSourceSet(sets, 'b', { timestamp: '2026-05-07T00:00:00.000Z' });
    expect(result.find((s) => s.id === 'a')!.status).toBe('inactive');
    expect(result.find((s) => s.id === 'b')!.status).toBe('active');
    expect(result.find((s) => s.id === 'c')!.status).toBe('active');
  });

  it('returns unchanged when target not found', () => {
    const sets = [makeSourceSet({ id: 'a' })];
    const result = switchActiveSourceSet(sets, 'missing');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('a');
  });
});

describe('validateSourceSetMembers', () => {
  it('returns valid when all members exist', () => {
    const set = makeSourceSet();
    const result = validateSourceSetMembers(
      set,
      () => true,
      () => true,
      () => true,
    );
    expect(result.valid).toBe(true);
    expect(result.missingMemberIds).toEqual([]);
    expect(result.zeroSourceCount).toBe(false);
  });

  it('detects missing members', () => {
    const set = makeSourceSet();
    const result = validateSourceSetMembers(set, (id) => id !== 'seg-1');
    expect(result.valid).toBe(false);
    expect(result.missingMemberIds).toEqual(['seg-1']);
  });

  it('detects mismatched media', () => {
    const set = makeSourceSet();
    const result = validateSourceSetMembers(
      set,
      () => true,
      () => false,
    );
    expect(result.valid).toBe(false);
    expect(result.mismatchedMediaId).toBe('media-1');
  });

  it('detects mismatched layer', () => {
    const set = makeSourceSet();
    const result = validateSourceSetMembers(
      set,
      () => true,
      undefined,
      () => false,
    );
    expect(result.valid).toBe(false);
    expect(result.mismatchedLayerId).toBe('layer-1');
  });

  it('detects zero source count', () => {
    const set = makeSourceSet({ members: [{ id: 'seg-1', type: 'segment' }] });
    const result = validateSourceSetMembers(set, () => false);
    expect(result.valid).toBe(false);
    expect(result.zeroSourceCount).toBe(true);
  });

  it('passes when no media/layer and no checker provided', () => {
    const set = { ...makeSourceSet() };
    delete set.mediaId;
    delete set.layerId;
    const result = validateSourceSetMembers(set, () => true);
    expect(result.valid).toBe(true);
  });
});

describe('invalidateSourceSet', () => {
  it('marks as invalidated with reason', () => {
    const set = makeSourceSet();
    const invalidated = invalidateSourceSet(set, 'media removed', {
      timestamp: '2026-05-07T00:00:00.000Z',
    });
    expect(invalidated.status).toBe('invalidated');
    expect(invalidated.invalidationReason).toBe('media removed');
    expect(invalidated.updatedAt).toBe('2026-05-07T00:00:00.000Z');
  });
});

describe('pruneInvalidatedSourceSets', () => {
  it('invalidates sets with missing members', () => {
    const sets = [
      makeSourceSet({ id: 'a', members: [{ id: 'gone', type: 'segment' }] }),
      makeSourceSet({ id: 'b', members: [{ id: 'ok', type: 'segment' }] }),
    ];
    const { updated, invalidatedIds } = pruneInvalidatedSourceSets(sets, (id) => id === 'ok');
    expect(invalidatedIds).toEqual(['a']);
    expect(updated.find((s) => s.id === 'a')!.status).toBe('invalidated');
    expect(updated.find((s) => s.id === 'b')!.status).toBe('active');
  });

  it('does not re-invalidate already invalidated sets', () => {
    const sets = [makeSourceSet({ id: 'a', status: 'invalidated', invalidationReason: 'old' })];
    const { updated, invalidatedIds } = pruneInvalidatedSourceSets(sets, () => false);
    expect(invalidatedIds).toEqual([]);
    expect(updated[0]!.invalidationReason).toBe('old');
  });
});

describe('exportReferenceSummary', () => {
  it('produces summary with type breakdown', () => {
    const set = makeSourceSet({
      members: [
        { id: 's1', type: 'segment' },
        { id: 's2', type: 'segment' },
        { id: 'n1', type: 'note' },
      ],
    });
    const summary = exportReferenceSummary(set);
    expect(summary.id).toBe('css_test_001');
    expect(summary.name).toBe('Test Source Set');
    expect(summary.memberCount).toBe(3);
    expect(summary.memberTypes).toEqual({ segment: 2, note: 1 });
    expect(summary.mediaId).toBe('media-1');
    expect(summary.layerId).toBe('layer-1');
  });
});

describe('buildSourceSetFallbackReason', () => {
  it('returns null for non-invalidated set', () => {
    const set = makeSourceSet({ status: 'active' });
    expect(buildSourceSetFallbackReason(set)).toBeNull();
  });

  it('returns reason for invalidated set', () => {
    const set = makeSourceSet({
      status: 'invalidated',
      invalidationReason: 'media removed: media-1',
    });
    const reason = buildSourceSetFallbackReason(set);
    expect(reason).toContain('Test Source Set');
    expect(reason).toContain('media removed: media-1');
    expect(reason).toContain('Please re-scope');
  });
});

describe('deleteSavedSourceSet', () => {
  it('removes the target source set by id', () => {
    const setA = makeSourceSet({ id: 'a', name: 'Set A' });
    const setB = makeSourceSet({ id: 'b', name: 'Set B' });
    const sets = [setA, setB];
    const result = deleteSavedSourceSet(sets, 'a');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('b');
  });

  it('returns unchanged array when id not found', () => {
    const setA = makeSourceSet({ id: 'a', name: 'Set A' });
    const sets = [setA];
    const result = deleteSavedSourceSet(sets, 'x');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('a');
  });

  it('does not mutate the original array', () => {
    const setA = makeSourceSet({ id: 'a', name: 'Set A' });
    const sets = [setA];
    const result = deleteSavedSourceSet(sets, 'a');
    expect(sets).toHaveLength(1);
    expect(result).toHaveLength(0);
  });
});
