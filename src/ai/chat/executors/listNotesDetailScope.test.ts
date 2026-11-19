// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetJieyuDatabaseSingletonForTests } from '../../../db';
import type { NoteCategory, NoteTargetType, UserNoteDocType } from '../../../db/types';
import type { AiPromptContext } from '../chatDomain.types';
import { listNotesDetail } from './noteExecutors';

const FOREIGN_COUNT = 800;
const FOREIGN_ORIGIN_MS = Date.UTC(2026, 0, 1);

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function note(input: {
  id: string;
  textId: string;
  targetType: NoteTargetType;
  targetId: string;
  updatedAtMs: number;
  category?: NoteCategory;
  parentTargetId?: string;
  content?: string;
}): UserNoteDocType {
  const updatedAt = iso(input.updatedAtMs);
  return {
    id: input.id,
    textId: input.textId,
    targetType: input.targetType,
    targetId: input.targetId,
    content: { und: input.content ?? input.id },
    ...(input.category ? { category: input.category } : {}),
    ...(input.parentTargetId ? { parentTargetId: input.parentTargetId } : {}),
    createdAt: updatedAt,
    updatedAt,
  };
}

function foreignNotes(count = FOREIGN_COUNT): UserNoteDocType[] {
  return Array.from({ length: count }, (_, index) =>
    note({
      id: `foreign-${index}`,
      textId: 'text-other',
      targetType: 'unit',
      targetId: 'unit-other',
      updatedAtMs: FOREIGN_ORIGIN_MS + index * 1000,
      category: 'comment',
      content: 'other scope',
    }),
  );
}

interface UnitSeed {
  id: string;
  mediaId: string;
  layerId: string;
  textId?: string;
}

function context(units: UnitSeed[], extra?: Record<string, unknown>): AiPromptContext {
  return {
    shortTerm: {
      workspaceTextId: 'text-current',
      currentMediaId: 'media-current',
      selectedLayerId: 'layer-current',
      localUnitIndex: units.map((unit) => ({
        id: unit.id,
        kind: 'unit' as const,
        mediaId: unit.mediaId,
        layerId: unit.layerId,
        ...(unit.textId !== undefined ? { textId: unit.textId } : {}),
        startTime: 0,
        endTime: 1,
        text: unit.id,
      })),
      ...extra,
    },
    longTerm: {},
  } as AiPromptContext;
}

const currentUnit: UnitSeed = {
  id: 'unit-current',
  mediaId: 'media-current',
  layerId: 'layer-current',
  textId: 'text-current',
};

async function seed(rows: UserNoteDocType[]): Promise<void> {
  await db.user_notes.bulkPut(rows);
}

describe('list_notes_detail scope scan', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
    await db.open();
    await db.user_notes.clear();
  });

  it('returns an older in-scope note crowded out by 800 newer notes in another text', async () => {
    await seed([
      ...foreignNotes(),
      note({
        id: 'in-scope-old',
        textId: 'text-current',
        targetType: 'unit',
        targetId: 'unit-current',
        updatedAtMs: Date.UTC(2020, 0, 1),
        category: 'todo',
        content: 'still in scope',
      }),
    ]);

    const result = await listNotesDetail(context([currentUnit]), {
      scope: 'project',
      limit: 10,
    });

    expect(result.ok).toBe(true);
    const body = result.result as {
      count: number;
      notes: Array<{ id: string; contentPreview: string }>;
    };
    expect(body.notes.map((row) => row.id)).toEqual(['in-scope-old']);
    expect(body.count).toBe(1);
    expect(body.notes[0]?.contentPreview).toBe('still in scope');
    expect(body.notes.some((row) => row.id.startsWith('foreign-'))).toBe(false);
  });

  it('keeps newest-first order and the requested limit inside the scope', async () => {
    const inScope = Array.from({ length: 60 }, (_, index) =>
      note({
        id: `scoped-${index}`,
        textId: 'text-current',
        targetType: 'unit',
        targetId: 'unit-current',
        updatedAtMs: Date.UTC(2024, 0, 1) + index * 1000,
        category: 'comment',
      }),
    );
    await seed([...foreignNotes(), ...inScope]);

    const limited = await listNotesDetail(context([currentUnit]), {
      scope: 'current_track',
      limit: 2,
    });
    const body = limited.result as { limit: number; notes: Array<{ id: string }> };
    expect(limited.ok).toBe(true);
    expect(body.limit).toBe(2);
    expect(body.notes.map((row) => row.id)).toEqual(['scoped-59', 'scoped-58']);

    const capped = await listNotesDetail(context([currentUnit]), {
      scope: 'project',
      limit: 999,
    });
    const cappedBody = capped.result as { limit: number; notes: Array<{ id: string }> };
    expect(cappedBody.limit).toBe(50);
    expect(cappedBody.notes).toHaveLength(50);
    expect(cappedBody.notes[0]?.id).toBe('scoped-59');
    expect(cappedBody.notes[49]?.id).toBe('scoped-10');
    expect(cappedBody.notes.some((row) => row.id.startsWith('foreign-'))).toBe(false);

    const fallback = await listNotesDetail(context([currentUnit]), { scope: 'project' });
    const fallbackBody = fallback.result as { limit: number; notes: Array<{ id: string }> };
    expect(fallbackBody.limit).toBe(20);
    expect(fallbackBody.notes).toHaveLength(20);
    expect(fallbackBody.notes[0]?.id).toBe('scoped-59');
    expect(fallbackBody.notes[19]?.id).toBe('scoped-40');
  });

  it('applies timeline scope, text ownership, and category before the limit', async () => {
    const otherMedia: UnitSeed = {
      id: 'unit-other-media',
      mediaId: 'media-other',
      layerId: 'layer-current',
      textId: 'text-current',
    };
    const otherLayer: UnitSeed = {
      id: 'unit-other-layer',
      mediaId: 'media-current',
      layerId: 'layer-other',
      textId: 'text-current',
    };
    const otherText: UnitSeed = {
      id: 'unit-other-text',
      mediaId: 'media-current',
      layerId: 'layer-current',
      textId: 'text-other',
    };
    const unscopedText: UnitSeed = {
      id: 'unit-blank-text',
      mediaId: 'media-current',
      layerId: 'layer-current',
    };
    await seed([
      ...foreignNotes(),
      note({
        id: 'track-old',
        textId: 'text-current',
        targetType: 'unit',
        targetId: 'unit-current',
        updatedAtMs: Date.UTC(2021, 0, 1),
        category: 'todo',
      }),
      note({
        id: 'other-media-newer',
        textId: 'text-current',
        targetType: 'unit',
        targetId: 'unit-other-media',
        updatedAtMs: Date.UTC(2025, 6, 1),
        category: 'todo',
      }),
      note({
        id: 'other-layer-newer',
        textId: 'text-current',
        targetType: 'unit',
        targetId: 'unit-other-layer',
        updatedAtMs: Date.UTC(2025, 5, 1),
        category: 'todo',
      }),
      note({
        id: 'other-text-newer',
        textId: 'text-other',
        targetType: 'unit',
        targetId: 'unit-other-text',
        updatedAtMs: Date.UTC(2025, 4, 1),
        category: 'todo',
      }),
      note({
        id: 'blank-text-unit',
        textId: 'text-current',
        targetType: 'unit',
        targetId: 'unit-blank-text',
        updatedAtMs: Date.UTC(2022, 0, 1),
        category: 'todo',
      }),
      note({
        id: 'text-note',
        textId: 'text-current',
        targetType: 'text',
        targetId: 'text-current',
        updatedAtMs: Date.UTC(2023, 0, 1),
        category: 'todo',
      }),
      note({
        id: 'foreign-text-note',
        textId: 'text-other',
        targetType: 'text',
        targetId: 'text-other',
        updatedAtMs: Date.UTC(2025, 8, 1),
        category: 'todo',
      }),
      note({
        id: 'token-via-parent',
        textId: 'text-current',
        targetType: 'token',
        targetId: 'token-1',
        parentTargetId: 'unit-current',
        updatedAtMs: Date.UTC(2024, 0, 1),
        category: 'comment',
      }),
      note({
        id: 'tier-cell',
        textId: 'text-current',
        targetType: 'tier_annotation',
        targetId: 'unit-current::layer-current',
        updatedAtMs: Date.UTC(2024, 2, 1),
        category: 'linguistic',
      }),
      note({
        id: 'newer-comment',
        textId: 'text-current',
        targetType: 'unit',
        targetId: 'unit-current',
        updatedAtMs: Date.UTC(2025, 1, 1),
        category: 'comment',
      }),
    ]);

    const units = [currentUnit, otherMedia, otherLayer, otherText, unscopedText];
    const track = await listNotesDetail(context(units), {
      scope: 'current_track',
      limit: 20,
      category: 'todo',
    });
    expect(track.ok).toBe(true);
    expect((track.result as { notes: Array<{ id: string }> }).notes.map((row) => row.id)).toEqual([
      'other-layer-newer',
      'text-note',
      'blank-text-unit',
      'track-old',
    ]);

    const project = await listNotesDetail(context(units), {
      scope: 'project',
      limit: 20,
      category: 'todo',
    });
    expect((project.result as { notes: Array<{ id: string }> }).notes.map((row) => row.id)).toEqual(
      ['other-media-newer', 'other-layer-newer', 'text-note', 'blank-text-unit', 'track-old'],
    );

    const layer = await listNotesDetail(context(units), {
      scope: 'current_scope',
      limit: 20,
      category: 'todo',
    });
    expect((layer.result as { notes: Array<{ id: string }> }).notes.map((row) => row.id)).toEqual([
      'text-note',
      'blank-text-unit',
      'track-old',
    ]);

    const invalidScope = await listNotesDetail(context(units), {
      scope: 'not-a-scope',
      limit: 20,
      category: 'todo',
    });
    expect((invalidScope.result as { scope: string; notes: Array<{ id: string }> }).scope).toBe(
      'current_track',
    );
    expect(
      (invalidScope.result as { notes: Array<{ id: string }> }).notes.map((row) => row.id),
    ).toEqual(['other-layer-newer', 'text-note', 'blank-text-unit', 'track-old']);

    const uncategorized = await listNotesDetail(context([currentUnit]), {
      scope: 'project',
      limit: 10,
    });
    expect(
      (uncategorized.result as { notes: Array<{ id: string }> }).notes.map((row) => row.id),
    ).toEqual(['newer-comment', 'tier-cell', 'token-via-parent', 'text-note', 'track-old']);
  });

  it('returns an empty in-scope page without borrowing newer notes from other texts', async () => {
    await seed(foreignNotes(FOREIGN_COUNT + 1));
    const result = await listNotesDetail(context([currentUnit]), { scope: 'project', limit: 5 });
    expect(result.ok).toBe(true);
    const body = result.result as { count: number; notes: unknown[] };
    expect(body.count).toBe(0);
    expect(body.notes).toEqual([]);
  });
});
