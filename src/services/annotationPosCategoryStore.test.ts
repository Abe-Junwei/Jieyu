import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  addAnnotationPosCategory,
  buildUdPosCategorySeed,
  listAnnotationPosCategories,
  renameAnnotationPosCategory,
} from './annotationPosCategoryStore';

const TEXT_ID = 'pos-project';

describe('annotation POS category store', () => {
  beforeEach(async () => {
    await db.texts.clear();
    await db.unit_tokens.clear();
    await db.texts.add({
      id: TEXT_ID,
      title: { und: 'Project' },
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    });
    await db.unit_tokens.add({
      id: 'tok-1',
      textId: TEXT_ID,
      unitId: 'unit-1',
      form: { und: 'ta' },
      pos: 'NOUN',
      tokenIndex: 0,
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    });
  });

  it('shows a new abbreviation and leaves existing token.pos unchanged', async () => {
    expect(buildUdPosCategorySeed().some((row) => row.abbreviation === 'NOUN')).toBe(true);
    expect(await addAnnotationPosCategory(TEXT_ID, 'CLF', 'classifier')).toBe('added');
    await renameAnnotationPosCategory(TEXT_ID, 'NOUN', 'noun');
    const rows = await listAnnotationPosCategories(TEXT_ID);
    expect(rows.some((row) => row.abbreviation === 'CLF' && row.name === 'classifier')).toBe(true);
    expect(rows.find((row) => row.abbreviation === 'NOUN')?.name).toBe('noun');
    expect((await db.unit_tokens.get('tok-1'))?.pos).toBe('NOUN');
  });
});
