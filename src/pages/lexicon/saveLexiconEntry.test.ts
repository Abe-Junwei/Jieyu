import { describe, expect, it } from 'vitest';
import type { LexemeEntryDoc, LexemeResourceDoc } from '../../types/jieyuDbDocTypes';
import { emptyEntryFields } from '../../utils/dmlexEntry';
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
