/**
 * 项目行事务原语（rev5 4.2-5；T16 / T17）| Project-row transaction primitive (rev5 4.2-5; T16 / T17)
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type TextDocType } from '../db';
import { projectTextMetadataKey } from '../types/projectTextMetadata';
import {
  addAnnotationAbbreviation,
  listAnnotationAbbreviations,
} from './annotationAbbreviationStore';
import {
  addAnnotationPosCategory,
  listAnnotationPosCategories,
} from './annotationPosCategoryStore';
import { saveCharacterVariantLines } from './projectCharacterVariantStore';
import { expandTextLogicalDurationToAtLeast } from './linguisticServiceMediaImport';
import { updateTextTimeMapping } from './linguisticServiceTextTimelineOps';
import { attachSpeakerToProject, readProjectSpeakerIds } from './speakerProjectMembership';
import { rememberImportedSourceFile } from './projectFileOps';
import {
  ProjectNotFoundError,
  patchProjectMetadata,
  patchProjectText,
  requireProjectPatch,
} from './projectMetadataPatch';

const TEXT_ID = 'patch-project';
const NOW = '2026-10-09T00:00:00.000Z';

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  await db.texts.add({
    id: TEXT_ID,
    title: { und: 'Project' },
    metadata: { keep: 'me' },
    createdAt: NOW,
    updatedAt: NOW,
  });
});

describe('patchProjectMetadata', () => {
  it('returns an explicit not-found result, and requireProjectPatch throws a typed error', async () => {
    const result = await patchProjectMetadata('missing', (metadata) => ({ ...metadata, a: 1 }));
    expect(result).toEqual({ status: 'not-found' });
    expect(() => requireProjectPatch('missing', result)).toThrow(ProjectNotFoundError);
    expect(await db.texts.get('missing')).toBeUndefined();
  });

  it('keeps other metadata keys, stamps updatedAt, and skips the write for a null patch', async () => {
    const updated = await patchProjectMetadata(TEXT_ID, (metadata) => ({ ...metadata, a: 1 }));
    expect(updated.status).toBe('updated');
    const row = await db.texts.get(TEXT_ID);
    expect(row?.metadata).toEqual({ keep: 'me', a: 1 });
    expect(row?.updatedAt).not.toBe(NOW);
    const skipped = await patchProjectMetadata(TEXT_ID, () => null);
    expect(skipped.status).toBe('unchanged');
    expect((await db.texts.get(TEXT_ID))?.updatedAt).toBe(row?.updatedAt);
  });

  it('cannot change the primary key', async () => {
    await patchProjectText(TEXT_ID, (current) => ({ ...current, id: 'other' }));
    expect(await db.texts.get('other')).toBeUndefined();
    expect(await db.texts.get(TEXT_ID)).toBeDefined();
  });

  it('T17: a write-validation failure rolls back and the project row stays', async () => {
    const before = await db.texts.get(TEXT_ID);
    await expect(
      patchProjectText(TEXT_ID, (current) => ({
        ...current,
        title: 42 as unknown as TextDocType['title'],
      })),
    ).rejects.toThrow(/texts/);
    expect(await db.texts.get(TEXT_ID)).toEqual(before);
  });

  it('T17: an error thrown by the patch itself also leaves the row untouched', async () => {
    const before = await db.texts.get(TEXT_ID);
    await expect(updateTextTimeMapping({ textId: TEXT_ID, offsetSec: -1 })).rejects.toThrow();
    expect(await db.texts.get(TEXT_ID)).toEqual(before);
  });

  it('T16: concurrent source registration and metadata edits all persist', async () => {
    const speakerId = 'spk-1';
    await Promise.all([
      rememberImportedSourceFile({
        textId: TEXT_ID,
        name: 'one.eaf',
        format: 'eaf',
        sha256: 'a'.repeat(64),
        byteSize: 1,
      }),
      rememberImportedSourceFile({
        textId: TEXT_ID,
        name: 'two.eaf',
        format: 'eaf',
        sha256: 'b'.repeat(64),
        byteSize: 1,
      }),
      addAnnotationAbbreviation(TEXT_ID, 'AAA', 'first'),
      addAnnotationAbbreviation(TEXT_ID, 'BBB', 'second'),
      addAnnotationPosCategory(TEXT_ID, 'XA', 'x-a'),
      addAnnotationPosCategory(TEXT_ID, 'XB', 'x-b'),
      saveCharacterVariantLines(TEXT_ID, 'a=b'),
      attachSpeakerToProject(speakerId, TEXT_ID),
      updateTextTimeMapping({ textId: TEXT_ID, offsetSec: 2 }),
      expandTextLogicalDurationToAtLeast({ textId: TEXT_ID, minLogicalDurationSec: 99 }),
    ]);

    const sources = await db.source_records.where('textId').equals(TEXT_ID).toArray();
    expect(sources.map((row) => row.originalName).sort()).toEqual(['one.eaf', 'two.eaf']);
    const abbreviations = (await listAnnotationAbbreviations(TEXT_ID)).map(
      (row) => row.abbreviation,
    );
    expect(abbreviations).toEqual(expect.arrayContaining(['AAA', 'BBB']));
    const categories = (await listAnnotationPosCategories(TEXT_ID)).map((row) => row.abbreviation);
    expect(categories).toEqual(expect.arrayContaining(['XA', 'XB']));
    const metadata = (await db.texts.get(TEXT_ID))?.metadata as Record<string, unknown>;
    expect(metadata.keep).toBe('me');
    expect(metadata[projectTextMetadataKey.characterVariantLines]).toBe('a=b');
    expect(readProjectSpeakerIds(metadata)).toEqual([speakerId]);
    expect((metadata.timeMapping as { offsetSec: number }).offsetSec).toBe(2);
    expect(metadata.logicalDurationSec).toBe(99);
  });
});
