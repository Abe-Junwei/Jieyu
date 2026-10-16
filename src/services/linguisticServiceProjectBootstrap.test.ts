import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { createProject } from './linguisticServiceProjectBootstrap';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('createProject', () => {
  const input = {
    primaryTitle: 'Test',
    englishFallbackTitle: 'Test',
    primaryLanguageId: 'eng',
  };

  it('commits the project and its default document together', async () => {
    const { textId } = await createProject(input);
    const project = await db.texts.get(textId);
    expect(project?.defaultDocumentId).toBeTruthy();
    expect(await db.annotation_documents.get(project!.defaultDocumentId!)).toMatchObject({
      textId,
    });
  });

  it('rolls back the project if creating its default document fails', async () => {
    const add = vi
      .spyOn(db.annotation_documents, 'add')
      .mockRejectedValueOnce(new Error('disk full'));
    try {
      await expect(createProject(input)).rejects.toThrow('disk full');
      expect(await db.texts.count()).toBe(0);
      expect(await db.annotation_documents.count()).toBe(0);
    } finally {
      add.mockRestore();
    }
  });
});
