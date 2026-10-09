/**
 * JYT 新格式（rev5 第 3 批第一个切片）：T22、T28、T29、T31、T32、T35、T37 的 JYT 部分，RD-1。
 * New JYT format (rev5 batch 3, first slice): the JYT parts of T22, T28, T29, T31, T32, T35, T37; RD-1.
 */
import 'fake-indexeddb/auto';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { findSnapshotFormatError } from '../db/snapshotFormatError';
import { entryDoc } from '../utils/dmlexEntry';
import {
  exportProjectToJyt,
  JYT_MIMETYPE,
  LEGACY_JYT_MIMETYPE,
  previewJytRestore,
  restoreJytAsNewProject,
} from './JytService';
import { sha256Hex } from './projectArchiveContainer';

const NOW = '2026-10-09T01:00:00.000Z';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const AUDIO = 'field-audio-bytes';

async function seedProject(p: string): Promise<void> {
  const doc = `${p}-doc`;
  const layer = `${p}-layer`;
  const unit = `${p}-unit`;
  await db.texts.put({
    id: p,
    title: { default: `Project ${p}` },
    defaultDocumentId: doc,
    metadata: { projectSpeakerIds: [`${p}-spk`] },
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
  const audio = new Blob([AUDIO], { type: 'audio/wav' });
  await db.media_items.put({
    id: `${p}-media`,
    textId: p,
    filename: 'field.wav',
    duration: 2,
    details: { audioBlob: audio },
    isOfflineCached: true,
    timelineKind: 'acoustic',
    byteLocation: 'managed',
    availability: 'available',
    contentSize: audio.size,
    contentSha256: await sha256Hex(strToU8(AUDIO)),
    createdAt: NOW,
  });
  await db.layer_units.put({
    id: unit,
    textId: p,
    mediaId: `${p}-media`,
    layerId: layer,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    speakerId: `${p}-spk`,
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.layer_unit_contents.put({
    id: `${p}-content`,
    textId: p,
    unitId: unit,
    layerId: layer,
    contentRole: 'primary_text',
    modality: 'text',
    text: `nfd e\u0301 ${p}`,
    sourceType: 'human',
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.speakers.put({ id: `${p}-spk`, textId: p, name: 'Ada', createdAt: NOW, updatedAt: NOW });
  // T35：没有被任何单元引用的词条也要进包 | An unreferenced lexeme is still packaged
  await db.lexemes.put(
    entryDoc({
      id: `${p}-lex`,
      headword: 'dog',
      createdAt: NOW,
      updatedAt: NOW,
      textId: p,
    }) as never,
  );
  await db.user_notes.put({
    id: `${p}-note`,
    targetType: 'tier_annotation',
    targetId: `${unit}::${layer}`,
    content: { default: 'cell note' },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function rewriteArchive(
  archive: Uint8Array,
  edit: (files: Record<string, Uint8Array>, manifest: Record<string, unknown>) => void,
): Uint8Array {
  const files = unzipSync(archive);
  const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!)) as Record<
    string,
    unknown
  >;
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

describe('JYT export (D1, 7.2)', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
    await seedProject('pA');
    await seedProject('pB');
  });

  it('T29: carries no byte files, every media entity is omitted with its fingerprint', async () => {
    const files = unzipSync(await exportProjectToJyt('pA'));
    expect(strFromU8(files['mimetype']!)).toBe(JYT_MIMETYPE);
    expect(Object.keys(files).sort()).toEqual([
      'META-INF/manifest.json',
      'data/project.json',
      'mimetype',
    ]);
    const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!));
    expect(manifest).toMatchObject({
      package: 'jyt',
      formatVersion: 1,
      media: 'excluded',
      kind: 'project',
    });
    expect(manifest.entities).toEqual([
      expect.objectContaining({
        type: 'media',
        id: 'pA-media',
        bytes: 'omitted',
        timelineKind: 'acoustic',
        contentSize: AUDIO.length,
        contentSha256: await sha256Hex(strToU8(AUDIO)),
      }),
    ]);
    expect(manifest.files).toEqual([
      expect.objectContaining({ path: 'data/project.json', role: 'data' }),
    ]);
    const data = strFromU8(files['data/project.json']!);
    expect(data).not.toContain(AUDIO);
    // 只有项目 A；不含 clientId（T37）| Only project A; no clientId (T37)
    expect(data).not.toContain('pB');
    expect(data).not.toContain('clientId');
    const collections = JSON.parse(data).collections;
    expect(collections.lexemes.map((row: { id: string }) => row.id)).toEqual(['pA-lex']);
    expect(manifest.projects[0]).toMatchObject({
      id: 'pA',
      defaultDocumentId: 'pA-doc',
      documents: [{ documentId: 'pA-doc', isDefault: true, layerIds: ['pA-layer'], sourceIds: [] }],
    });
  });

  it('T22 / T28 / T29: restore as a new project remaps every id, documents and notes included', async () => {
    const archive = await exportProjectToJyt('pA');
    const preview = await previewJytRestore(archive);
    expect(preview.sourceProject.id).toBe('pA');
    expect(preview.mediaWithoutBytes).toBe(1);
    expect(await db.texts.count()).toBe(2);

    const restored = await restoreJytAsNewProject(archive);
    expect(restored.projectId).toMatch(UUID_RE);
    const text = await db.texts.get(restored.projectId);
    expect(text?.restoredFrom).toMatchObject({ projectId: 'pA', packageKind: 'jyt' });
    expect(text?.defaultDocumentId).toMatch(UUID_RE);
    expect(text?.metadata?.projectSpeakerIds?.[0]).toMatch(UUID_RE);

    const docs = await db.annotation_documents.toArray();
    expect(new Set(docs.map((d) => d.id)).size).toBe(3);
    const newDoc = docs.find((d) => d.textId === restored.projectId)!;
    expect(newDoc.id).toBe(text?.defaultDocumentId);
    expect(newDoc.isDefault).toBe(true);

    const layer = (
      await db.tier_definitions.where('textId').equals(restored.projectId).toArray()
    )[0]!;
    expect(layer.documentId).toBe(newDoc.id);
    const unit = (await db.layer_units.toArray()).find((u) => u.textId === restored.projectId)!;
    expect(unit.layerId).toBe(layer.id);
    const media = (await db.media_items.where('textId').equals(restored.projectId).toArray())[0]!;
    expect(unit.mediaId).toBe(media.id);
    // 缺音状态，指纹保留，供 Relink 校验 | Missing, fingerprint kept for relink
    expect(media).toMatchObject({
      byteLocation: 'none',
      availability: 'missing',
      contentSize: AUDIO.length,
    });
    expect((media.details as Record<string, unknown> | undefined)?.['audioBlob']).toBeUndefined();
    const content = (await db.layer_unit_contents.toArray()).find((c) => c.unitId === unit.id)!;
    expect(content.text).toBe('nfd e\u0301 pA');
    const note = (await db.user_notes.toArray()).find((n) => n.targetId.startsWith(unit.id))!;
    expect(note.targetId).toBe(`${unit.id}::${layer.id}`);
    expect(
      (await db.lexemes.toArray()).filter((l) => l.textId === restored.projectId),
    ).toHaveLength(1);

    // 原项目不变 | Source project untouched
    const sourceMedia = await db.media_items.get('pA-media');
    expect(sourceMedia?.byteLocation).toBe('managed');
    expect(await db.layer_units.get('pA-unit')).toBeDefined();
  });

  it('restoring the same package twice gives two independent projects', async () => {
    const archive = await exportProjectToJyt('pA');
    const first = await restoreJytAsNewProject(archive);
    const second = await restoreJytAsNewProject(archive);
    expect(first.projectId).not.toBe(second.projectId);
    expect(await db.texts.count()).toBe(4);
  });

  it('skips language rows another local project already owns and says so', async () => {
    await db.languages.put({
      id: 'user:demo',
      textId: 'pA',
      name: { eng: 'Demo' },
      languageCode: 'demo',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);
    const archive = await exportProjectToJyt('pA');
    const preview = await previewJytRestore(archive);
    expect(preview.skippedLanguageIds).toEqual(['user:demo']);
    const restored = await restoreJytAsNewProject(archive);
    expect(restored.skippedLanguageIds).toEqual(['user:demo']);
    expect((await db.languages.get('user:demo'))?.textId).toBe('pA');
  });

  it('encrypted JYT needs the password and lists the encrypted data file', async () => {
    const archive = await exportProjectToJyt('pA', { encryption: { password: 'pw' } });
    const files = unzipSync(archive);
    expect(Object.keys(files)).toContain('data/project.enc');
    await expect(previewJytRestore(archive)).rejects.toThrow(/password required/i);
    const restored = await restoreJytAsNewProject(archive, { password: 'pw' });
    expect(await db.texts.get(restored.projectId)).toBeDefined();
  });
});

describe('JYT inbound checks reject before any write (T31, T32, RD-1)', () => {
  let archive: Uint8Array;

  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
    await seedProject('pA');
    archive = await exportProjectToJyt('pA');
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  async function expectRejected(bad: Uint8Array, code: string, pattern?: RegExp) {
    const error = await formatErrorOf(() => restoreJytAsNewProject(bad));
    expect(error.code).toBe(code);
    if (pattern) expect([error.message, ...error.problems].join('\n')).toMatch(pattern);
    expect(await db.texts.count()).toBe(0);
    expect((await formatErrorOf(() => previewJytRestore(bad))).code).toBe(code);
  }

  it('sha256 mismatch of the data file', async () => {
    const bad = rewriteArchive(archive, (_files, manifest) => {
      (manifest.files as Array<Record<string, unknown>>)[0]!.sha256 = '0'.repeat(64);
    });
    await expectRejected(bad, 'invalid-package', /sha256 mismatch/);
  });

  it('orphan file, path traversal and a byte file in a JYT', async () => {
    const bad = rewriteArchive(archive, (files) => {
      files['media/extra.wav'] = strToU8('x');
      files['../evil.txt'] = strToU8('x');
    });
    await expectRejected(bad, 'invalid-package', /orphan file "media\/extra.wav"/);
    const error = await formatErrorOf(() => previewJytRestore(bad));
    expect(error.problems.join('\n')).toMatch(/unsafe path "..\/evil.txt"/);
  });

  it('missing bytes declaration, included without fileRef, omitted with fileRef', async () => {
    const noBytes = rewriteArchive(archive, (_files, manifest) => {
      delete (manifest.entities as Array<Record<string, unknown>>)[0]!.bytes;
    });
    await expectRejected(noBytes, 'invalid-package', /entities\.0\.bytes/);
    const included = rewriteArchive(archive, (_files, manifest) => {
      (manifest.entities as Array<Record<string, unknown>>)[0]!.bytes = 'included';
    });
    await expectRejected(included, 'invalid-package', /"included" without a byte file/);
    const omittedWithRef = rewriteArchive(archive, (_files, manifest) => {
      (manifest.entities as Array<Record<string, unknown>>)[0]!.fileRef = 'data/project.json';
    });
    await expectRejected(omittedWithRef, 'invalid-package', /"omitted" but references a file/);
  });

  it('entities must match the byte-bearing rows of the data', async () => {
    const bad = rewriteArchive(archive, (_files, manifest) => {
      manifest.entities = [];
    });
    await expectRejected(bad, 'invalid-package', /misses 1 byte-bearing row/);
  });

  it('RD-1: an invalid record fails in preview, not at import', async () => {
    const files = unzipSync(archive);
    const data = JSON.parse(strFromU8(files['data/project.json']!));
    delete data.collections.media_items[0].timelineKind;
    const dataBytes = strToU8(JSON.stringify(data));
    const sha = await sha256Hex(dataBytes);
    const bad = rewriteArchive(archive, (zipFiles, manifest) => {
      zipFiles['data/project.json'] = dataBytes;
      const entry = (manifest.files as Array<Record<string, unknown>>)[0]!;
      entry.sha256 = sha;
      entry.size = dataBytes.byteLength;
    });
    const error = await formatErrorOf(() => previewJytRestore(bad));
    expect(error.code).toBe('invalid-records');
    expect(error.invalidCollections).toEqual([
      expect.objectContaining({ collection: 'media_items', invalid: 1 }),
    ]);
  });

  it('T32: an old whole-database JYT is unsupported; an export of jieyudb_v2 says so', async () => {
    const legacy = (dbName: string, schemaVersion: number) =>
      zipSync({
        mimetype: strToU8(LEGACY_JYT_MIMETYPE),
        'META-INF/manifest.json': strToU8(
          JSON.stringify({ formatVersion: 1, kind: 'jyt', schemaVersion, dbName, exportedAt: NOW }),
        ),
        'data/snapshot.json': strToU8(JSON.stringify({ schemaVersion, dbName, collections: {} })),
      });
    expect((await formatErrorOf(() => previewJytRestore(legacy('jieyudb_v2', 4)))).code).toBe(
      'legacy-database',
    );
    expect((await formatErrorOf(() => previewJytRestore(legacy('jieyu', 5)))).code).toBe(
      'unsupported-package',
    );
    const newer = rewriteArchive(archive, (_files, manifest) => {
      manifest.formatVersion = 2;
    });
    expect((await formatErrorOf(() => previewJytRestore(newer))).code).toBe('unsupported-package');
  });
});
