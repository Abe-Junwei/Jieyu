// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, dmlexResourceIdForProject, isLexemeEntry } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { emptyEntryFields, emptySenseDraft } from '../../utils/dmlexEntry';
import {
  clearActiveProjectTextId,
  publishActiveProjectTextId,
} from '../../utils/transcriptionUrlDeepLink';
import * as workspaceEvents from '../../utils/workspaceEvents';
import { saveLexiconEntry } from './saveLexiconEntry';

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

describe('saveLexiconEntry', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    publishActiveProjectTextId(textId);
    await db.lexemes.clear();
  });

  afterEach(() => {
    clearActiveProjectTextId();
  });

  it('rejects an empty headword before writing', async () => {
    await expect(
      saveLexiconEntry({ existing: null, textId, fields: emptyEntryFields() }),
    ).rejects.toThrow(/empty headword/);
    expect(await db.lexemes.count()).toBe(0);
  });

  it('writes the entry and resource, then a later read matches the returned row', async () => {
    const announced = vi.spyOn(workspaceEvents, 'dispatchWorkspaceLexemeUpdated');
    const stored = await saveLexiconEntry({
      existing: null,
      textId,
      fields: {
        ...emptyEntryFields(),
        headword: 'pine',
        senses: [{ ...emptyEntryFields().senses[0]!, translation: 'a conifer' }],
      },
    });
    const updated = await saveLexiconEntry({
      existing: stored,
      textId,
      fields: { ...emptyEntryFields(), headword: 'oak' },
    });

    expect(stored.entry.headword).toBe('pine');
    expect(stored.entry.senses?.[0]?.headwordTranslations?.[0]?.text).toBe('a conifer');
    expect(stored.textId).toBe(textId);
    expect(updated.id).toBe(stored.id);
    expect(updated.entry.headword).toBe('oak');
    const again = await db.lexemes.get(stored.id);
    if (again === undefined || !isLexemeEntry(again)) throw new Error('entry missing');
    expect(again.entry.headword).toBe('oak');
    const resource = await LinguisticService.lexemes.getResource(textId);
    expect(resource?.id).toBe(dmlexResourceIdForProject(textId));
    expect(announced).toHaveBeenCalled();
  });

  it('reads the saved entry back by id without listing the whole project', async () => {
    const where = vi.spyOn(db.lexemes, 'where');
    const stored = await saveLexiconEntry({
      existing: null,
      textId,
      fields: { ...emptyEntryFields(), headword: 'birch' },
    });
    expect(stored.entry.headword).toBe('birch');
    expect(where).not.toHaveBeenCalledWith('textId');
    const again = await db.lexemes.get(stored.id);
    if (again === undefined || !isLexemeEntry(again)) throw new Error('entry missing');
    expect(again.entry.headword).toBe('birch');
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

  it('rolls back the new entry when the resource id belongs to another project and does not announce', async () => {
    const resourceId = dmlexResourceIdForProject(textId);
    const now = '2026-09-27T00:00:00.000Z';
    await db.lexemes.put({
      id: resourceId,
      kind: 'resource',
      textId: 'text-other',
      resource: { langCode: 'und', translationLanguages: ['zh'] },
      createdAt: now,
      updatedAt: now,
    });
    const announced = vi.spyOn(workspaceEvents, 'dispatchWorkspaceLexemeUpdated');

    await expect(
      saveLexiconEntry({
        existing: null,
        textId,
        fields: { ...emptyEntryFields(), headword: 'pine' },
      }),
    ).rejects.toThrow(/belongs to project/);

    expect(announced).not.toHaveBeenCalled();
    const rows = await db.lexemes.toArray();
    expect(rows.filter(isLexemeEntry)).toEqual([]);
    expect(rows.find((row) => row.id === resourceId)?.textId).toBe('text-other');
  });
});
