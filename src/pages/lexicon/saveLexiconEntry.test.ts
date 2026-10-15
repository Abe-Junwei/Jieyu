// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import { isLexemeResource } from '../../db/lexemeNestedIds';
import { LinguisticService } from '../../services/LinguisticService';
import type { LexemeEntryDoc, LexemeResourceDoc } from '../../types/jieyuDbDocTypes';
import { emptyEntryFields, emptySenseDraft } from '../../utils/dmlexEntry';
import {
  clearActiveProjectTextId,
  publishActiveProjectTextId,
} from '../../utils/transcriptionUrlDeepLink';
import * as workspaceEvents from '../../utils/workspaceEvents';
import { saveLexiconEntry } from './saveLexiconEntry';

const now = '2026-09-27T00:00:00.000Z';

describe('saveLexiconEntry', () => {
  it('writes the entry and resource, then returns the list readback', async () => {
    const rows = new Map<string, LexemeEntryDoc | LexemeResourceDoc>();
    const stored = await saveLexiconEntry(
      {
        existing: null,
        textId: 'text-1',
        fields: {
          ...emptyEntryFields(),
          headword: 'pine',
          senses: [{ ...emptyEntryFields().senses[0]!, translation: 'a conifer' }],
        },
      },
      {
        save: async (doc) => {
          rows.set(doc.id, doc as LexemeEntryDoc);
          return doc.id;
        },
        list: async () =>
          [...rows.values()].filter((row): row is LexemeEntryDoc => row.kind !== 'resource'),
        loadResource: async () => null,
        saveResource: async (doc) => {
          rows.set(doc.id, doc);
          return doc.id;
        },
      },
    );
    expect(stored.entry.headword).toBe('pine');
    expect(stored.entry.senses?.[0]?.headwordTranslations?.[0]?.text).toBe('a conifer');
    expect(stored.createdAt.length).toBeGreaterThan(0);
    expect(rows.size).toBe(2);
    expect(stored.textId).toBe('text-1');
    void now;
  });

  it('rejects an empty headword before writing', async () => {
    const save = async () => 'x';
    await expect(
      saveLexiconEntry(
        { existing: null, textId: 'text-1', fields: emptyEntryFields() },
        {
          save,
          list: async () => [],
          loadResource: async () => null,
          saveResource: save,
        },
      ),
    ).rejects.toThrow(/empty headword/);
  });
});

const textId = 'text-1';

function fieldsWithSense(headword: string, parentId: string, childId: string) {
  return {
    ...emptyEntryFields(),
    headword,
    senses: [
      { ...emptySenseDraft(), id: parentId, translation: `${headword}-parent` },
      { ...emptySenseDraft(), id: childId, parentId, translation: `${headword}-child` },
    ],
  };
}

describe('saveLexiconEntry commit', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    publishActiveProjectTextId(textId);
    await db.lexemes.clear();
  });

  afterEach(() => {
    clearActiveProjectTextId();
  });

  it('keeps both subsense relations when two saves commit', async () => {
    await Promise.all([
      saveLexiconEntry({
        existing: null,
        textId,
        fields: fieldsWithSense('oak', 'sense-oak', 'sense-oak-child'),
      }),
      saveLexiconEntry({
        existing: null,
        textId,
        fields: fieldsWithSense('pine', 'sense-pine', 'sense-pine-child'),
      }),
    ]);
    const resource = await LinguisticService.lexemes.getResource(textId);
    const pairs = (resource?.resource.relations ?? [])
      .filter((relation) => relation.type === 'subsense')
      .map((relation) => relation.members.map((member) => member.ref).join('>'))
      .sort();
    expect(pairs).toEqual(['sense-oak>sense-oak-child', 'sense-pine>sense-pine-child']);
  });

  it('rolls back the entry when the resource write fails and does not announce', async () => {
    const stored = await saveLexiconEntry({
      existing: null,
      textId,
      fields: { ...emptyEntryFields(), headword: 'pine' },
    });
    const before = await db.lexemes.toArray();
    const announced = vi.spyOn(workspaceEvents, 'dispatchWorkspaceLexemeUpdated');
    const realSave = LinguisticService.lexemes.save;
    vi.spyOn(LinguisticService.lexemes, 'save').mockImplementation(async (doc, options) => {
      if (isLexemeResource(doc)) throw new Error('resource failed');
      return realSave(doc, options);
    });

    await expect(
      saveLexiconEntry({
        existing: stored,
        textId,
        fields: { ...emptyEntryFields(), headword: 'oak' },
      }),
    ).rejects.toThrow(/resource failed/);

    expect(announced).not.toHaveBeenCalled();
    expect(await db.lexemes.toArray()).toEqual(before);
  });

  it('rolls back both writes when readback disagrees and does not announce', async () => {
    await saveLexiconEntry({
      existing: null,
      textId,
      fields: { ...emptyEntryFields(), headword: 'pine' },
    });
    const before = await db.lexemes.toArray();
    const announced = vi.spyOn(workspaceEvents, 'dispatchWorkspaceLexemeUpdated');
    const realList = LinguisticService.lexemes.list;
    vi.spyOn(LinguisticService.lexemes, 'list').mockImplementation(async (projectId) => {
      const rows = await realList(projectId);
      return rows.map((row) => ({ ...row, entry: { ...row.entry, headword: 'tampered' } }));
    });

    await expect(
      saveLexiconEntry({
        existing: null,
        textId,
        fields: { ...emptyEntryFields(), headword: 'oak' },
      }),
    ).rejects.toThrow(/headword readback mismatch/);

    expect(announced).not.toHaveBeenCalled();
    expect(await db.lexemes.toArray()).toEqual(before);
  });
});
