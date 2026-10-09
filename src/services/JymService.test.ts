/**
 * JYM 新格式（rev5 第 3 批第二个切片）：默认带受管媒体与附件字节。
 * T28、T31、T32、T37 的 JYM 部分；D1 的 `media: included | excluded`；JYM 覆盖当前项目。
 * New JYM format (rev5 batch 3, second slice): managed media and attachment bytes by default.
 * The JYM parts of T28, T31, T32, T37; D1 `media: included | excluded`; JYM overwrite.
 */
import 'fake-indexeddb/auto';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { findSnapshotFormatError, ProjectOverwriteBlockedError } from '../db/snapshotFormatError';
import { collectArchiveSystemRefs } from './archiveProjectDocuments';
import {
  exportProjectToJym,
  overwriteProjectWithJym,
  previewJymRestore,
  ProjectPackageTooLargeError,
  restoreJymAsNewProject,
} from './JymService';
import { exportProjectToJyt } from './JytService';
import { sha256Hex } from './projectArchiveContainer';

const flags = vi.hoisted(() => ({ neverCollaborated: true }));
vi.mock('../collaboration/cloud/projectCollaborationHistory', () => ({
  isProjectNeverCollaborated: () => flags.neverCollaborated,
  listCollaboratedIds: (ids: readonly string[]) =>
    flags.neverCollaborated ? [] : [...new Set(ids)],
}));

const NOW = '2026-10-09T01:00:00.000Z';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const AUDIO = 'RIFF-field-audio-bytes-e\u0301';
const IMAGE = 'png-attachment-bytes';

async function blobText(blob: unknown): Promise<string> {
  expect(blob).toBeInstanceOf(Blob);
  return strFromU8(new Uint8Array(await (blob as Blob).arrayBuffer()));
}

async function putMedia(p: string, id: string, audio: string | null): Promise<void> {
  const blob = audio === null ? null : new Blob([audio], { type: 'audio/wav' });
  await db.media_items.put({
    id,
    textId: p,
    filename: `${id}.wav`,
    duration: 2,
    ...(blob ? { details: { audioBlob: blob } } : {}),
    isOfflineCached: blob !== null,
    timelineKind: 'acoustic',
    byteLocation: blob ? 'managed' : 'none',
    availability: blob ? 'available' : 'missing',
    ...(blob ? { contentSize: blob.size, contentSha256: await sha256Hex(strToU8(audio!)) } : {}),
    createdAt: NOW,
  });
}

async function seedProject(p: string): Promise<void> {
  const doc = `${p}-doc`;
  const layer = `${p}-layer`;
  await db.texts.put({
    id: p,
    title: { default: `Project ${p}` },
    defaultDocumentId: doc,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.annotation_documents.put({
    id: doc,
    textId: p,
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.tier_definitions.put({
    id: layer,
    textId: p,
    documentId: doc,
    key: `bridge_trc_${p}`,
    name: { default: 'Transcription' },
    tierType: 'time-aligned',
    contentType: 'transcription',
    languageId: 'user:demo',
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await putMedia(p, `${p}-media`, AUDIO);
  await db.layer_units.put({
    id: `${p}-unit`,
    textId: p,
    mediaId: `${p}-media`,
    layerId: layer,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.lexeme_assets.put({
    id: `${p}-asset`,
    textId: p,
    kind: 'image',
    mimeType: 'image/png',
    displayName: 'photo.png',
    byteSize: IMAGE.length,
    refCount: 1,
    blob: new Blob([IMAGE], { type: 'image/png' }),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function rewriteArchive(
  archive: Uint8Array,
  edit: (files: Record<string, Uint8Array>, manifest: Record<string, any>) => void,
): Uint8Array {
  const files = unzipSync(archive);
  const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!)) as Record<string, any>;
  edit(files, manifest);
  files['META-INF/manifest.json'] = strToU8(JSON.stringify(manifest));
  return zipSync(files as Zippable);
}

async function formatErrorOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    const formatError = findSnapshotFormatError(error);
    if (formatError) return formatError;
    throw error;
  }
  throw new Error('expected a format error');
}

async function clearAll(): Promise<void> {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
}

describe('JYM export carries managed bytes (D1, 7.2)', () => {
  beforeEach(async () => {
    flags.neverCollaborated = true;
    await clearAll();
    await seedProject('pA');
    await seedProject('pB');
  });

  it('includes media and attachment bytes with sha256 on entity and file entry', async () => {
    const files = unzipSync(await exportProjectToJym('pA'));
    expect(strFromU8(files['mimetype']!)).toBe('application/vnd.jieyu.jym');
    const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!));
    expect(manifest).toMatchObject({ package: 'jym', media: 'included', formatVersion: 1 });
    const audioSha = await sha256Hex(strToU8(AUDIO));
    const media = manifest.entities.find((e: { type: string }) => e.type === 'media');
    expect(media).toMatchObject({
      id: 'pA-media',
      bytes: 'included',
      fileRef: 'media/pA-media',
      contentSha256: audioSha,
      contentSize: strToU8(AUDIO).byteLength,
      mimeType: 'audio/wav',
      byteLocation: 'managed',
    });
    expect(manifest.files).toContainEqual({
      path: 'media/pA-media',
      sha256: audioSha,
      size: strToU8(AUDIO).byteLength,
      role: 'media',
    });
    expect(strFromU8(files['media/pA-media']!)).toBe(AUDIO);
    expect(strFromU8(files['attachments/pA-asset']!)).toBe(IMAGE);
    // 数据文件里没有字节，也没有别的项目 | No bytes and no other project in the data file
    const data = strFromU8(files['data/project.json']!);
    expect(data).not.toContain('field-audio');
    expect(data).not.toContain('pB');
    expect(manifest.excluded).toEqual([]);
  });

  it('T28: restore as a new project brings the bytes back with matching state', async () => {
    const archive = await exportProjectToJym('pA');
    const preview = await previewJymRestore(archive);
    expect(preview.includedBytes).toEqual({
      count: 2,
      totalBytes: strToU8(AUDIO).byteLength + IMAGE.length,
    });
    expect(preview.mediaWithoutBytes).toBe(0);

    const restored = await restoreJymAsNewProject(archive);
    expect(restored.projectId).toMatch(UUID_RE);
    expect((await db.texts.get(restored.projectId))?.restoredFrom).toMatchObject({
      projectId: 'pA',
      packageKind: 'jym',
    });
    const media = (await db.media_items.where('textId').equals(restored.projectId).toArray())[0]!;
    expect(media.id).toMatch(UUID_RE);
    expect(media).toMatchObject({
      byteLocation: 'managed',
      availability: 'available',
      contentSha256: await sha256Hex(strToU8(AUDIO)),
      contentSize: strToU8(AUDIO).byteLength,
    });
    expect(await blobText(media.details?.['audioBlob'])).toBe(AUDIO);
    expect((media.details?.['audioBlob'] as Blob).type).toBe('audio/wav');
    const unit = (await db.layer_units.toArray()).find((u) => u.textId === restored.projectId)!;
    expect(unit.mediaId).toBe(media.id);
    const asset = (await db.lexeme_assets.toArray()).find((a) => a.textId === restored.projectId)!;
    expect(await blobText(asset.blob)).toBe(IMAGE);
    expect(asset.blobExportOmitted).toBeUndefined();
    // 原项目不变 | Source untouched
    expect(await blobText((await db.media_items.get('pA-media'))?.details?.['audioBlob'])).toBe(
      AUDIO,
    );
  });

  it('D1: without media the package declares media "excluded" and restores as missing', async () => {
    const archive = await exportProjectToJym('pA', { includeMedia: false });
    const files = unzipSync(archive);
    const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!));
    expect(manifest.media).toBe('excluded');
    expect(manifest.entities.every((e: { bytes: string }) => e.bytes === 'omitted')).toBe(true);
    expect(Object.keys(files).some((name) => name.startsWith('media/'))).toBe(false);
    expect(manifest.excluded).toContainEqual({
      kind: 'media-bytes',
      count: 1,
      reason: 'media-excluded',
    });
    const restored = await restoreJymAsNewProject(archive);
    const media = (await db.media_items.where('textId').equals(restored.projectId).toArray())[0]!;
    expect(media).toMatchObject({ byteLocation: 'none', availability: 'missing' });
  });

  it('T37: two media with identical bytes stay two entities and two files', async () => {
    await putMedia('pA', 'pA-media-copy', AUDIO);
    const archive = await exportProjectToJym('pA');
    const manifest = JSON.parse(strFromU8(unzipSync(archive)['META-INF/manifest.json']!));
    const mediaFiles = manifest.files.filter((f: { role: string }) => f.role === 'media');
    expect(mediaFiles.map((f: { path: string }) => f.path).sort()).toEqual([
      'media/pA-media',
      'media/pA-media-copy',
    ]);
    const restored = await restoreJymAsNewProject(archive);
    const media = await db.media_items.where('textId').equals(restored.projectId).toArray();
    expect(media).toHaveLength(2);
    for (const row of media) expect(await blobText(row.details?.['audioBlob'])).toBe(AUDIO);
  });

  it('media without local bytes stay omitted inside an "included" JYM', async () => {
    await putMedia('pA', 'pA-missing', null);
    const manifest = JSON.parse(
      strFromU8(unzipSync(await exportProjectToJym('pA'))['META-INF/manifest.json']!),
    );
    expect(manifest.entities.find((e: { id: string }) => e.id === 'pA-missing')).toMatchObject({
      bytes: 'omitted',
      byteLocation: 'none',
    });
    expect(manifest.excluded).toContainEqual({
      kind: 'media-bytes',
      count: 1,
      reason: 'no-local-bytes',
    });
  });

  it('encrypted JYM encrypts the byte files too and restores them with the password', async () => {
    const archive = await exportProjectToJym('pA', { encryption: { password: 'pw' } });
    const files = unzipSync(archive);
    expect(Object.keys(files)).toContain('data/project.enc');
    expect(strFromU8(files['media/pA-media']!)).not.toContain('field-audio');
    await expect(previewJymRestore(archive)).rejects.toThrow(/password required/i);
    await expect(previewJymRestore(archive, { password: 'wrong' })).rejects.toThrow(/decrypt/i);
    const restored = await restoreJymAsNewProject(archive, { password: 'pw' });
    const media = (await db.media_items.where('textId').equals(restored.projectId).toArray())[0]!;
    expect(await blobText(media.details?.['audioBlob'])).toBe(AUDIO);
  });

  it('7.4-8: export refuses a package over the size limit, before reading the bytes', async () => {
    await expect(
      exportProjectToJym('pA', { policy: { maxExpandedBytes: 8, maxEntryBytes: 8 } }),
    ).rejects.toBeInstanceOf(ProjectPackageTooLargeError);
  });
});

describe('JYM inbound checks reject before any write (T31, T32)', () => {
  let archive: Uint8Array;

  beforeEach(async () => {
    flags.neverCollaborated = true;
    await clearAll();
    await seedProject('pA');
    archive = await exportProjectToJym('pA');
    await clearAll();
  });

  async function expectRejected(bad: Uint8Array, code: string, pattern?: RegExp) {
    const error = await formatErrorOf(() => restoreJymAsNewProject(bad));
    expect(error.code).toBe(code);
    if (pattern) expect([error.message, ...error.problems].join('\n')).toMatch(pattern);
    expect(await db.texts.count()).toBe(0);
    expect(await db.media_items.count()).toBe(0);
    expect((await formatErrorOf(() => previewJymRestore(bad))).code).toBe(code);
  }

  it('a tampered byte file fails its sha256', async () => {
    const bad = rewriteArchive(archive, (files) => {
      files['media/pA-media'] = strToU8(AUDIO.replace('field', 'FIELD'));
    });
    await expectRejected(bad, 'invalid-package', /sha256 mismatch for "media\/pA-media"/);
  });

  it('an entity whose contentSha256 differs from its file', async () => {
    const bad = rewriteArchive(archive, (_files, manifest) => {
      manifest.entities.find((e: { type: string }) => e.type === 'media').contentSha256 =
        'a'.repeat(64);
    });
    await expectRejected(bad, 'invalid-package', /does not match its byte file/);
  });

  it('one byte file referenced by two entities, and a byte file of the wrong role', async () => {
    const shared = rewriteArchive(archive, (_files, manifest) => {
      const attachment = manifest.entities.find((e: { type: string }) => e.type === 'attachment');
      attachment.fileRef = 'media/pA-media';
    });
    await expectRejected(shared, 'invalid-package', /referenced by 2 entities/);
    const error = await formatErrorOf(() => previewJymRestore(shared));
    expect(error.problems.join('\n')).toMatch(/references a media file/);
  });

  it('an orphan media file and an "included" media whose row is not managed', async () => {
    const orphan = rewriteArchive(archive, (files) => {
      files['media/extra'] = strToU8('x');
    });
    await expectRejected(orphan, 'invalid-package', /orphan file "media\/extra"/);

    const files = unzipSync(archive);
    const data = JSON.parse(strFromU8(files['data/project.json']!));
    Object.assign(data.collections.media_items[0], {
      byteLocation: 'none',
      availability: 'missing',
    });
    const dataBytes = strToU8(JSON.stringify(data));
    const sha = await sha256Hex(dataBytes);
    const notManaged = rewriteArchive(archive, (zipFiles, manifest) => {
      zipFiles['data/project.json'] = dataBytes;
      manifest.files[0].sha256 = sha;
      manifest.files[0].size = dataBytes.byteLength;
    });
    await expectRejected(notManaged, 'invalid-package', /"included" but its row is not managed/);
  });

  it('"excluded" media must not include bytes; a JYT is not accepted as a JYM', async () => {
    const bad = rewriteArchive(archive, (_files, manifest) => {
      manifest.media = 'excluded';
    });
    await expectRejected(bad, 'invalid-package', /media "excluded" must not include bytes/);
    await seedProject('pB');
    const jyt = await exportProjectToJyt('pB');
    expect((await formatErrorOf(() => previewJymRestore(jyt))).code).toBe('unsupported-package');
  });

  it('T32: an old whole-database JYM is unsupported; an export of jieyudb_v2 says so', async () => {
    const legacy = (dbName: string, schemaVersion: number) =>
      zipSync({
        mimetype: strToU8('application/x-jieyu-media'),
        'META-INF/manifest.json': strToU8(
          JSON.stringify({ formatVersion: 1, kind: 'jym', schemaVersion, dbName, exportedAt: NOW }),
        ),
        'data/snapshot.json': strToU8(JSON.stringify({ schemaVersion, dbName, collections: {} })),
      });
    expect((await formatErrorOf(() => previewJymRestore(legacy('jieyudb_v2', 4)))).code).toBe(
      'legacy-database',
    );
    expect((await formatErrorOf(() => restoreJymAsNewProject(legacy('jieyu', 5)))).code).toBe(
      'unsupported-package',
    );
    expect(await db.texts.count()).toBe(0);
  });
});

describe('JYM overwrite of the current project (D5, 4.2-7)', () => {
  beforeEach(async () => {
    flags.neverCollaborated = true;
    await clearAll();
    await seedProject('pA');
  });

  it('identical package bytes replace nothing: overwrite is allowed and bytes stay', async () => {
    const archive = await exportProjectToJym('pA');
    const preview = await previewJymRestore(archive, { overwriteTargetProjectId: 'pA' });
    expect(preview.overwrite).toMatchObject({ keepsIds: true, available: true, bytesAtRisk: [] });
    const result = await overwriteProjectWithJym(archive, { targetProjectId: 'pA' });
    expect(result.keptIds).toBe(true);
    expect(await blobText((await db.media_items.get('pA-media'))?.details?.['audioBlob'])).toBe(
      AUDIO,
    );
    expect(await blobText((await db.lexeme_assets.get('pA-asset'))?.blob)).toBe(IMAGE);
  });

  it('different package bytes for the same id would lose local bytes: aborted, nothing changed', async () => {
    const archive = await exportProjectToJym('pA');
    await putMedia('pA', 'pA-media', 'newer-local-recording');
    const preview = await previewJymRestore(archive, { overwriteTargetProjectId: 'pA' });
    expect(preview.overwrite).toMatchObject({
      available: false,
      bytesAtRisk: ['media_items:pA-media'],
    });
    let reason = '';
    try {
      await overwriteProjectWithJym(archive, { targetProjectId: 'pA' });
    } catch (error) {
      reason = error instanceof ProjectOverwriteBlockedError ? error.reason : String(error);
    }
    expect(reason).toBe('local-bytes-would-be-lost');
    expect(await blobText((await db.media_items.get('pA-media'))?.details?.['audioBlob'])).toBe(
      'newer-local-recording',
    );
  });
});

describe('T51 system template references in project packages', () => {
  const copyRow = {
    id: 'b1a5c0de-0000-4000-8000-000000000001',
    scope: 'project',
    projectId: 'text-a',
    derivedFromSystemId: 'system.leipzig-structural.v1',
  };

  it('collects only referenced system ids from project rows', () => {
    expect(
      collectArchiveSystemRefs({
        collections: {
          structural_rule_profiles: [
            copyRow,
            { ...copyRow, id: 'other' },
            { id: 'plain', scope: 'project' },
          ],
        },
      }),
    ).toEqual([{ id: 'system.leipzig-structural.v1' }]);
    expect(collectArchiveSystemRefs({ collections: {} })).toEqual([]);
  });

  it('lists system refs the running code cannot resolve in the preview', async () => {
    await clearAll();
    await seedProject('pA');
    const archive = rewriteArchive(await exportProjectToJym('pA'), (_files, manifest) => {
      manifest.systemRefs = [{ id: 'system.leipzig-structural.v1' }, { id: 'system.future.v9' }];
    });
    const preview = await previewJymRestore(archive);
    expect(preview.unresolvedSystemRefs).toEqual(['system.future.v9']);
  });
});
