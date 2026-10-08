/**
 * rev5 切片 2B-D：来源记录身份（T12、T13、T14、T15）。
 * rev5 slice 2B-D: source record identity (T12, T13, T14, T15).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import type { MediaItemDocType } from '../db';
import { JieyuWriteValidationError } from '../db/writeValidationMiddleware';
import { linkManuscriptsToAudio } from '../utils/projectSourceFiles';
import { listProjectFileViews, listProjectSourceFiles } from './projectFileOps';
import {
  SourceMediaLinkError,
  SourceProjectNotFoundError,
  extractEafDocumentUrn,
  linkSourceRecordToMedia,
  listSourceRecords,
  planSourceImport,
  previewSourceImport,
  previewSourceImportForFile,
  registerImportedSource,
  renameSourceRecord,
  uniqueSourceDisplayName,
} from './sourceRecordService';

const TEXT_A = 'text_2bd_a';
const TEXT_B = 'text_2bd_b';
const NOW = '2026-10-09T08:00:00.000Z';
const URN = 'urn:nl-mpi-tools-elan-eaf:2bd-story-0001';

function eafBlob(body: string): Blob {
  return new Blob([`<ANNOTATION_DOCUMENT>${body}</ANNOTATION_DOCUMENT>`], {
    type: 'application/xml',
  });
}

function media(id: string, textId: string, filename: string): MediaItemDocType {
  return {
    id,
    textId,
    filename,
    duration: 10,
    isOfflineCached: false,
    createdAt: NOW,
    timelineKind: 'acoustic',
    byteLocation: 'none',
    availability: 'missing',
  };
}

async function seedText(id: string): Promise<void> {
  await db.texts.put({
    id,
    title: { default: id },
    metadata: { timelineMode: 'media', logicalDurationSec: 10, timebaseLabel: 'logical-second' },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  await seedText(TEXT_A);
  await seedText(TEXT_B);
});

describe('T12: same name, different content', () => {
  it('Story.eaf then story.eaf → two records, two UUIDs, distinct display names', async () => {
    const first = await registerImportedSource({
      textId: TEXT_A,
      originalName: 'Story.eaf',
      format: 'eaf',
      bytes: eafBlob('first'),
    });
    const second = await registerImportedSource({
      textId: TEXT_A,
      originalName: 'story.eaf',
      format: 'eaf',
      bytes: eafBlob('second'),
    });
    expect(first.plan.kind).toBe('new');
    expect(second.plan.kind).toBe('new');
    expect(first.record.id).not.toBe(second.record.id);
    expect(first.record.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.record.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.record.displayName).toBe('Story.eaf');
    expect(second.record.displayName).toBe('story (2).eaf');
    expect(second.record.originalName).toBe('story.eaf');
    expect(first.record.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.record.sha256).not.toBe(second.record.sha256);
    const listed = await listSourceRecords(TEXT_A);
    expect(listed).toHaveLength(2);
    expect(await listSourceRecords(TEXT_B)).toEqual([]);
  });

  it('the same bytes again is "same content": no new row', async () => {
    const first = await registerImportedSource({
      textId: TEXT_A,
      originalName: 'a.eaf',
      format: 'eaf',
      bytes: eafBlob('x'),
    });
    const again = await registerImportedSource({
      textId: TEXT_A,
      originalName: 'copy-of-a.eaf',
      format: 'eaf',
      bytes: eafBlob('x'),
    });
    expect(again.plan.kind).toBe('same-content');
    expect(again.record.id).toBe(first.record.id);
    expect(await listSourceRecords(TEXT_A)).toHaveLength(1);
  });

  it('display names number case-insensitively', () => {
    expect(uniqueSourceDisplayName('Story.eaf', [])).toBe('Story.eaf');
    expect(uniqueSourceDisplayName('story.eaf', ['Story.eaf'])).toBe('story (2).eaf');
    expect(uniqueSourceDisplayName('story.eaf', ['Story.eaf', 'STORY (2).EAF'])).toBe(
      'story (3).eaf',
    );
    expect(uniqueSourceDisplayName('notes', ['notes'])).toBe('notes (2)');
  });
});

describe('T13: same URN under a new name updates the existing document', () => {
  it('previews update-existing, keeps the id and does not revert a renamed display name', async () => {
    const first = await registerImportedSource({
      textId: TEXT_A,
      originalName: 'story.eaf',
      format: 'eaf',
      externalDocId: URN,
      bytes: eafBlob('v1'),
    });
    await renameSourceRecord(TEXT_A, first.record.id, '讲故事（整理版）.eaf');

    const preview = await previewSourceImport({
      textId: TEXT_A,
      originalName: 'story-final.eaf',
      format: 'eaf',
      externalDocId: URN,
    });
    expect(preview.kind).toBe('update-existing');
    expect(preview.kind === 'update-existing' ? preview.record.id : '').toBe(first.record.id);
    // 预览不写库 | Preview writes nothing
    expect((await listSourceRecords(TEXT_A))[0]?.originalName).toBe('story.eaf');

    const updated = await registerImportedSource({
      textId: TEXT_A,
      originalName: 'story-final.eaf',
      format: 'eaf',
      externalDocId: URN,
      bytes: eafBlob('v2'),
    });
    expect(updated.plan.kind).toBe('update-existing');
    expect(updated.record.id).toBe(first.record.id);
    expect(updated.record.displayName).toBe('讲故事（整理版）.eaf');
    expect(updated.record.originalName).toBe('story-final.eaf');
    expect(updated.record.sha256).not.toBe(first.record.sha256);
    expect(await listSourceRecords(TEXT_A)).toHaveLength(1);
  });

  it('the import dialog preview reads the EAF URN from the file and writes nothing', async () => {
    const xml = `<ANNOTATION_DOCUMENT><HEADER><PROPERTY NAME="URN">${URN}</PROPERTY></HEADER></ANNOTATION_DOCUMENT>`;
    expect(extractEafDocumentUrn(xml)).toBe(URN);
    expect(
      extractEafDocumentUrn('<ANNOTATION_DOCUMENT><HEADER/></ANNOTATION_DOCUMENT>'),
    ).toBeUndefined();
    const first = await registerImportedSource({
      textId: TEXT_A,
      originalName: 'story.eaf',
      format: 'eaf',
      externalDocId: URN,
      bytes: eafBlob('v1'),
    });
    const file = Object.assign(new Blob([xml], { type: 'application/xml' }), {
      name: 'renamed.eaf',
    });
    const plan = await previewSourceImportForFile(TEXT_A, file);
    expect(plan).toMatchObject({ kind: 'update-existing', record: { id: first.record.id } });
    expect(await previewSourceImportForFile('', file)).toBeNull();
    expect(await listSourceRecords(TEXT_A)).toHaveLength(1);
  });

  it('URN wins over a matching hash of another record; URNs are per project', () => {
    const existing = [
      {
        id: 'r1',
        textId: TEXT_A,
        originalName: 'a.eaf',
        displayName: 'a.eaf',
        format: 'eaf',
        externalDocId: URN,
        importedAt: NOW,
        importBatchId: 'b',
        storedBytes: false,
        updatedAt: NOW,
      },
    ];
    expect(
      planSourceImport(
        { textId: TEXT_A, originalName: 'b.eaf', format: 'eaf', externalDocId: URN },
        existing,
      ).kind,
    ).toBe('update-existing');
    expect(
      planSourceImport(
        { textId: TEXT_A, originalName: 'a.eaf', format: 'eaf', externalDocId: 'urn:other' },
        existing,
      ),
    ).toEqual({ kind: 'new', displayName: 'a (2).eaf' });
  });
});

describe('T14: duplicate recording names never auto-link', () => {
  it('two same-name recordings + a filename-only manuscript → no link, no suggestion', async () => {
    await db.media_items.bulkPut([
      media('media_dup_1', TEXT_A, 'session.wav'),
      media('media_dup_2', TEXT_A, 'session.wav'),
    ]);
    await registerImportedSource({
      textId: TEXT_A,
      originalName: 'session.eaf',
      format: 'eaf',
      bytes: eafBlob('dup'),
      linkedMediaFilename: 'session.wav',
    });
    const views = await listProjectFileViews(TEXT_A);
    const doc = views.find((row) => row.kind === 'manuscript');
    expect(doc?.linkedAudioId).toBeUndefined();
    expect(doc?.suggestedAudioId).toBeUndefined();
  });

  it('a unique filename match is only a suggestion; a manual link survives a reload', async () => {
    await db.media_items.bulkPut([
      media('media_one', TEXT_A, 'field.wav'),
      media('media_two', TEXT_A, 'other.wav'),
    ]);
    const { record } = await registerImportedSource({
      textId: TEXT_A,
      originalName: 'field.eaf',
      format: 'eaf',
      bytes: eafBlob('field'),
      linkedMediaFilename: 'field.wav',
    });
    let doc = (await listProjectFileViews(TEXT_A)).find((row) => row.id === record.id);
    expect(doc?.linkedAudioId).toBeUndefined();
    expect(doc?.suggestedAudioId).toBe('media_one');

    // 用户手动选了另一条录音 | The user deliberately picks the other recording
    await linkSourceRecordToMedia(TEXT_A, record.id, 'media_two');
    // “重载”：只从数据库重读 | "Reload": read back from the database only
    doc = (await listProjectFileViews(TEXT_A)).find((row) => row.id === record.id);
    expect(doc?.linkedAudioId).toBe('media_two');
    expect(doc?.suggestedAudioId).toBeUndefined();
    expect((await listProjectSourceFiles(TEXT_A))[0]?.mediaId).toBe('media_two');

    await linkSourceRecordToMedia(TEXT_A, record.id, null);
    expect((await db.source_records.get(record.id))?.mediaId).toBeUndefined();
  });

  it('pure linking: duplicates give no suggestion, an explicit id links', () => {
    const audio = [
      { id: 'm1', name: 'a', filename: 'x.wav' },
      { id: 'm2', name: 'b', filename: 'X.WAV' },
    ];
    const views = linkManuscriptsToAudio(audio, [
      { id: 's1', name: 'x.eaf', format: 'eaf', linkedMediaFilename: 'x.wav' },
      { id: 's2', name: 'y.eaf', format: 'eaf', mediaId: 'm2', linkedMediaFilename: 'x.wav' },
      { id: 's3', name: 'z.eaf', format: 'eaf', mediaId: 'gone' },
    ]);
    const byId = new Map(views.map((row) => [row.id, row]));
    expect(byId.get('s1')).not.toHaveProperty('linkedAudioId');
    expect(byId.get('s1')).not.toHaveProperty('suggestedAudioId');
    expect(byId.get('s2')?.linkedAudioId).toBe('m2');
    expect(byId.get('s3')).not.toHaveProperty('linkedAudioId');
  });
});

describe('T15: media links must exist and belong to the project', () => {
  it('rejects a missing mediaId at import and at manual link', async () => {
    await expect(
      registerImportedSource({
        textId: TEXT_A,
        originalName: 'a.eaf',
        format: 'eaf',
        bytes: eafBlob('a'),
        mediaId: 'media_nowhere',
      }),
    ).rejects.toMatchObject({ name: 'SourceMediaLinkError', reason: 'media-missing' });
    expect(await listSourceRecords(TEXT_A)).toEqual([]);

    const { record } = await registerImportedSource({
      textId: TEXT_A,
      originalName: 'a.eaf',
      format: 'eaf',
      bytes: eafBlob('a'),
    });
    await expect(
      linkSourceRecordToMedia(TEXT_A, record.id, 'media_nowhere'),
    ).rejects.toBeInstanceOf(SourceMediaLinkError);
  });

  it('rejects a recording from another project', async () => {
    await db.media_items.put(media('media_b', TEXT_B, 'b.wav'));
    await expect(
      registerImportedSource({
        textId: TEXT_A,
        originalName: 'a.eaf',
        format: 'eaf',
        mediaId: 'media_b',
      }),
    ).rejects.toMatchObject({ reason: 'media-other-project', mediaId: 'media_b' });
    const { record } = await registerImportedSource({
      textId: TEXT_A,
      originalName: 'a.eaf',
      format: 'eaf',
    });
    await expect(linkSourceRecordToMedia(TEXT_A, record.id, 'media_b')).rejects.toMatchObject({
      reason: 'media-other-project',
    });
    expect((await db.source_records.get(record.id))?.mediaId).toBeUndefined();
  });

  it('rejects a source for a project that does not exist, and malformed rows at the write layer', async () => {
    await expect(
      registerImportedSource({ textId: 'text_missing', originalName: 'a.eaf', format: 'eaf' }),
    ).rejects.toBeInstanceOf(SourceProjectNotFoundError);
    await expect(
      db.source_records.put({
        id: 'bad',
        textId: TEXT_A,
        originalName: 'a.eaf',
        displayName: 'a.eaf',
        format: 'eaf',
        sha256: 'not-a-hash',
        importedAt: NOW,
        importBatchId: 'b',
        storedBytes: false,
        updatedAt: NOW,
      }),
    ).rejects.toBeInstanceOf(JieyuWriteValidationError);
  });

  it('deleting the project removes its source records', async () => {
    const { LinguisticService } = await import('./LinguisticService');
    await registerImportedSource({ textId: TEXT_A, originalName: 'a.eaf', format: 'eaf' });
    await registerImportedSource({ textId: TEXT_B, originalName: 'b.eaf', format: 'eaf' });
    await LinguisticService.cleanup.deleteProject(TEXT_A);
    expect(await db.source_records.where('textId').equals(TEXT_A).count()).toBe(0);
    expect(await db.source_records.where('textId').equals(TEXT_B).count()).toBe(1);
  });
});
