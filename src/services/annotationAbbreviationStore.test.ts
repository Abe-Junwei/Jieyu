import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { annotationGlossHasLeipzigIssue } from '../pages/annotation/annotationLeipzigGloss';
import {
  addAnnotationAbbreviation,
  buildLeipzigAbbreviationSeed,
  listAnnotationAbbreviations,
  readAnnotationAbbreviations,
  removeAnnotationAbbreviation,
} from './annotationAbbreviationStore';

const TEXT_ID = 'abbr-project';

describe('annotation abbreviation store', () => {
  beforeEach(async () => {
    await db.texts.clear();
    await db.texts.add({
      id: TEXT_ID,
      title: { und: 'Project' },
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    });
  });

  it('keeps Leipzig as the unread seed, then persists project edits on the text', async () => {
    const seeded = buildLeipzigAbbreviationSeed();
    expect(seeded.some((row) => row.abbreviation === 'SG' && row.leipzig)).toBe(true);
    expect(seeded.some((row) => row.abbreviation === 'ZERO')).toBe(true);
    expect(readAnnotationAbbreviations(undefined)).toBeNull();

    const first = await listAnnotationAbbreviations(TEXT_ID);
    expect(first.some((row) => row.abbreviation === 'SG')).toBe(true);
    const beforeWrite = await db.texts.get(TEXT_ID);
    expect(readAnnotationAbbreviations(beforeWrite?.metadata)).toBeNull();

    expect(await addAnnotationAbbreviation(TEXT_ID, 'MYA', 'Muya')).toBe('added');
    expect(await addAnnotationAbbreviation(TEXT_ID, 'MYA', 'again')).toBe('duplicate');
    await removeAnnotationAbbreviation(TEXT_ID, 'SG');

    const after = await listAnnotationAbbreviations(TEXT_ID);
    expect(after.some((row) => row.abbreviation === 'SG')).toBe(false);
    expect(after.some((row) => row.abbreviation === 'MYA')).toBe(true);
    const stored = await db.texts.get(TEXT_ID);
    expect(
      readAnnotationAbbreviations(stored?.metadata)?.some((row) => row.abbreviation === 'SG'),
    ).toBe(false);
    const allowed = new Set(after.map((row) => row.abbreviation));
    expect(annotationGlossHasLeipzigIssue('3.SG', allowed)).toBe(true);
    expect(annotationGlossHasLeipzigIssue('MYA', allowed)).toBe(false);
    expect(annotationGlossHasLeipzigIssue('dog', allowed)).toBe(false);
  });
});
