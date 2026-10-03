import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  loadCharacterVariantLines,
  readCharacterVariantLines,
  saveCharacterVariantLines,
} from './projectCharacterVariantStore';

describe('project character variants', () => {
  beforeEach(async () => {
    await db.texts.clear();
    await db.texts.add({
      id: 'text-1',
      title: { und: 'Project' },
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    });
  });

  it('keeps the variant lines on the project text', async () => {
    expect(readCharacterVariantLines(undefined)).toBe('');
    expect(await loadCharacterVariantLines('text-1')).toBe('');
    await saveCharacterVariantLines('text-1', "ʔ='");
    expect(await loadCharacterVariantLines('text-1')).toBe("ʔ='");
    const stored = await db.texts.get('text-1');
    expect(readCharacterVariantLines(stored?.metadata)).toBe("ʔ='");
  });
});
