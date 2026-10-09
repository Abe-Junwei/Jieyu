/**
 * JYB 整库备份（rev5 第 3 批第三个切片）：T30 逐项目导入、T34 灾难恢复、T53 分类表、入站检查。
 * JYB whole-database backup (rev5 batch 3, third slice): T30 per-project import, T34 disaster
 * restore, T53 classification, inbound checks.
 */
import 'fake-indexeddb/auto';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, exportDatabaseAsJson } from '../db';
import { findSnapshotFormatError, ProjectOverwriteBlockedError } from '../db/snapshotFormatError';
import { listProjectOverwriteSnapshots } from '../db/projectOverwriteSnapshotStore';
import { JIEYU_MAIN_TABLE_REGISTRY, type JieyuMainTableName } from '../db/tableRegistry';
import {
  JYB_MAIN_TABLES,
  LIBRARY_SNAPSHOT_KEY,
  disasterRestoreFromJyb,
  exportDatabaseToJyb,
  importJybProjectsAsNew,
  previewJybRestore,
} from './JybService';
import { exportProjectToJyt } from './JytService';
import { sha256Hex } from './projectArchiveContainer';

const flags = vi.hoisted(() => ({ collaborated: new Set<string>() }));
vi.mock('../collaboration/cloud/projectCollaborationHistory', () => ({
  isProjectNeverCollaborated: (id: string) => !flags.collaborated.has(id),
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

async function clearAll(): Promise<void> {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
}

/** 不进 JYB 的数据：凭据、AI、审计、派生 | Rows that must never reach a JYB */
async function seedNeverPackaged(p: string): Promise<void> {
  await db.external_mcp_trust.put({
    id: 'https://secret.example',
    origin: 'https://secret.example',
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.project_ai_memories.put({
    id: `${p}-mem`,
    projectId: p,
    fact: 'secret-ai-fact',
    confidence: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.audit_logs.put({
    id: `${p}-audit`,
    collection: 'texts',
    documentId: p,
    action: 'create',
    source: 'human',
    timestamp: NOW,
  } as never);
  await db.embeddings.put({
    id: `${p}-emb`,
    sourceType: 'unit',
    sourceId: `${p}-unit`,
    model: 'm',
    contentHash: 'h',
    vector: [0.1],
    createdAt: NOW,
  } as never);
}

function readArchive(archive: Uint8Array) {
  const files = unzipSync(archive);
  return {
    files,
    manifest: JSON.parse(strFromU8(files['META-INF/manifest.json']!)) as Record<string, any>,
    data: JSON.parse(strFromU8(files['data/library.json']!)) as {
      projects: Array<{ id: string; collections: Record<string, Array<Record<string, any>>> }>;
    },
  };
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

async function blockedErrorOf(run: () => Promise<unknown>): Promise<ProjectOverwriteBlockedError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ProjectOverwriteBlockedError) return error;
    throw error;
  }
  throw new Error('expected a blocked error');
}

beforeEach(async () => {
  flags.collaborated.clear();
  await clearAll();
});

describe('T53: JYB classification', () => {
  it('derives its tables from the registry; credentials, audit, derived never included; project AI is (7.5)', () => {
    const excludedClasses = new Set(['credential', 'audit_log', 'derived']);
    for (const name of Object.keys(JIEYU_MAIN_TABLE_REGISTRY) as JieyuMainTableName[]) {
      const dataClass = JIEYU_MAIN_TABLE_REGISTRY[name].dataClass;
      expect(JYB_MAIN_TABLES.includes(name), name).toBe(!excludedClasses.has(dataClass));
    }
    expect(JYB_MAIN_TABLES).toContain('texts');
    expect(JYB_MAIN_TABLES).toContain('lexemes');
    expect(JYB_MAIN_TABLES).toContain('ai_messages');
    expect(JYB_MAIN_TABLES).not.toContain('external_mcp_trust');
    expect(JYB_MAIN_TABLES).not.toContain('audit_logs');
  });

  it('the package carries project AI but no credential, audit or derived rows, and lists those as excluded', async () => {
    await seedProject('pA');
    await seedNeverPackaged('pA');
    const { files, manifest, data } = readArchive(
      await exportDatabaseToJyb({ includeMedia: false }),
    );
    expect(strFromU8(files['mimetype']!)).toBe('application/vnd.jieyu.jyb');
    expect(manifest).toMatchObject({ package: 'jyb', kind: 'library', media: 'excluded' });
    const text = strFromU8(files['data/library.json']!);
    for (const secret of ['secret.example', 'pA-audit', 'pA-emb']) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('secret-ai-fact');
    const names = new Set(data.projects.flatMap((p) => Object.keys(p.collections)));
    for (const name of ['external_mcp_trust', 'audit_logs', 'embeddings']) {
      expect(names.has(name), name).toBe(false);
    }
    expect(names.has('project_ai_memories')).toBe(true);
    expect(manifest.excluded).toEqual(
      expect.arrayContaining([
        { kind: 'data-class:credential', count: 1, reason: 'never-packaged' },
        { kind: 'data-class:audit_log', count: 1, reason: 'never-packaged' },
        { kind: 'data-class:derived', count: 1, reason: 'never-packaged' },
      ]),
    );
    expect(
      (manifest.excluded as Array<{ kind: string }>).some(
        (e) => e.kind === 'data-class:project_ai',
      ),
    ).toBe(false);
  });

  it('the whole-database JSON export no longer reads credential, AI or audit tables', async () => {
    await seedProject('pA');
    await seedNeverPackaged('pA');
    const full = await exportDatabaseAsJson();
    for (const name of [
      'external_mcp_trust',
      'project_ai_memories',
      'ai_messages',
      'ai_conversations',
      'audit_logs',
      'mcp_tool_call_audits',
    ]) {
      expect(full.collections[name], name).toBeUndefined();
    }
    expect(full.collections['texts']).toHaveLength(1);
  });
});

describe('T30: JYB per-project import (default)', () => {
  beforeEach(async () => {
    await seedProject('pA');
    await seedProject('pB');
  });

  for (const includeMedia of [true, false]) {
    it(`export ${includeMedia ? 'with' : 'without'} audio, empty DB, import every project as new`, async () => {
      const archive = await exportDatabaseToJyb({ includeMedia });
      const { manifest } = readArchive(archive);
      expect(manifest.media).toBe(includeMedia ? 'included' : 'excluded');
      expect(manifest.projects.map((p: { id: string }) => p.id).sort()).toEqual(['pA', 'pB']);

      await clearAll();
      const preview = await previewJybRestore(archive);
      expect(preview.projects.map((p) => p.id).sort()).toEqual(['pA', 'pB']);
      expect(preview.includedBytes.count).toBe(includeMedia ? 4 : 0);
      expect(preview.mediaWithoutBytes).toBe(includeMedia ? 0 : 2);
      expect(preview.disasterRestore).toMatchObject({ available: true, localProjectCount: 0 });

      const result = await importJybProjectsAsNew(archive);
      expect(result.projects).toHaveLength(2);
      const texts = await db.texts.toArray();
      expect(texts).toHaveLength(2);
      for (const imported of result.projects) {
        expect(imported.projectId).toMatch(UUID_RE);
        const text = await db.texts.get(imported.projectId);
        expect(text?.restoredFrom).toMatchObject({
          projectId: imported.sourceProjectId,
          packageKind: 'jyb',
        });
        // 项目之间不串数据 | No cross-project rows
        const media = await db.media_items.where('textId').equals(imported.projectId).toArray();
        expect(media).toHaveLength(1);
        expect(media[0]!.id).toMatch(UUID_RE);
        const units = await db.layer_units.where('textId').equals(imported.projectId).toArray();
        expect(units).toHaveLength(1);
        expect(units[0]!.mediaId).toBe(media[0]!.id);
        const assets = (await db.lexeme_assets.toArray()).filter(
          (row) => row.textId === imported.projectId,
        );
        expect(assets).toHaveLength(1);
        if (includeMedia) {
          expect(await blobText(media[0]!.details?.['audioBlob'])).toBe(AUDIO);
          expect(media[0]).toMatchObject({ byteLocation: 'managed', availability: 'available' });
          expect(await blobText(assets[0]!.blob)).toBe(IMAGE);
        } else {
          expect(media[0]!.details?.['audioBlob']).toBeUndefined();
          expect(media[0]).toMatchObject({ byteLocation: 'none', availability: 'missing' });
        }
      }
      const ids = new Set(texts.map((t) => t.id));
      expect(ids.has('pA') || ids.has('pB')).toBe(false);
    });
  }

  it('imports only the selected projects and leaves local data untouched', async () => {
    const archive = await exportDatabaseToJyb({ includeMedia: true });
    const result = await importJybProjectsAsNew(archive, { projectIds: ['pB'] });
    expect(result.projects.map((p) => p.sourceProjectId)).toEqual(['pB']);
    expect((await db.texts.toArray()).map((t) => t.id).sort()).toEqual(
      ['pA', 'pB', result.projects[0]!.projectId].sort(),
    );
    expect(await blobText((await db.media_items.get('pA-media'))?.details?.['audioBlob'])).toBe(
      AUDIO,
    );
  });
});

describe('T34: JYB disaster restore', () => {
  it('(a) empty local DB: allowed, original ids kept, bytes back, snapshot saved first', async () => {
    await seedProject('pA');
    await seedProject('pB');
    const archive = await exportDatabaseToJyb({ includeMedia: true });
    await clearAll();

    const result = await disasterRestoreFromJyb(archive);
    expect(result.projectIds.sort()).toEqual(['pA', 'pB']);
    expect((await db.texts.toArray()).map((t) => t.id).sort()).toEqual(['pA', 'pB']);
    expect((await db.texts.get('pA'))?.restoredFrom).toBeUndefined();
    expect(await blobText((await db.media_items.get('pA-media'))?.details?.['audioBlob'])).toBe(
      AUDIO,
    );
    expect(await blobText((await db.lexeme_assets.get('pB-asset'))?.blob)).toBe(IMAGE);
    const snapshots = await listProjectOverwriteSnapshots(LIBRARY_SNAPSHOT_KEY);
    expect(snapshots[0]).toMatchObject({ seq: result.snapshotSeq, packageKind: 'jyb' });
  });

  it('(b) every local project never collaborated: replaces the library; local-only AI rows kept', async () => {
    await seedProject('pA');
    const archive = await exportDatabaseToJyb({ includeMedia: true });
    // 导出后：pA 改了，又多了一个没有字节的本地项目 pC | After export: pA edited, byte-less pC added
    await db.texts.update('pA', { title: { default: 'edited after export' } });
    await db.texts.put({ id: 'pC', title: { default: 'C' }, createdAt: NOW, updatedAt: NOW });
    await seedNeverPackaged('pA');

    const preview = await previewJybRestore(archive);
    expect(preview.disasterRestore).toMatchObject({ available: true, localProjectCount: 2 });
    await disasterRestoreFromJyb(archive);
    expect((await db.texts.toArray()).map((t) => t.id)).toEqual(['pA']);
    expect((await db.texts.get('pA'))?.title).toEqual({ default: 'Project pA' });
    expect(await blobText((await db.media_items.get('pA-media'))?.details?.['audioBlob'])).toBe(
      AUDIO,
    );
    // 凭据、审计不在包里，本机的这些行保持不动 | Local credential / audit rows untouched
    expect(await db.external_mcp_trust.count()).toBe(1);
    expect(await db.audit_logs.count()).toBe(1);
    // 项目 AI 随整库还原回到备份时的状态（7.5）；旧行在整库快照里 | Project AI is restored too (7.5)
    expect(await db.project_ai_memories.count()).toBe(0);
    const [snapshot] = await listProjectOverwriteSnapshots(LIBRARY_SNAPSHOT_KEY);
    expect(snapshot!.snapshotJson).toContain('secret-ai-fact');
  });

  it('(b) aborts before any write when local bytes would be lost', async () => {
    await seedProject('pA');
    const archive = await exportDatabaseToJyb({ includeMedia: false });
    await seedProject('pD'); // 本机独有、带字节 | Local-only project with bytes
    const snapshotsBefore = (await listProjectOverwriteSnapshots(LIBRARY_SNAPSHOT_KEY)).length;

    const preview = await previewJybRestore(archive);
    expect(preview.disasterRestore).toMatchObject({
      available: false,
      reason: 'local-bytes-would-be-lost',
    });
    expect(preview.disasterRestore.bytesAtRisk).toEqual(
      expect.arrayContaining(['media_items:pD-media', 'lexeme_assets:pD-asset']),
    );
    const error = await blockedErrorOf(() => disasterRestoreFromJyb(archive));
    expect(error.reason).toBe('local-bytes-would-be-lost');
    expect((await db.texts.toArray()).map((t) => t.id).sort()).toEqual(['pA', 'pD']);
    expect(await listProjectOverwriteSnapshots(LIBRARY_SNAPSHOT_KEY)).toHaveLength(snapshotsBefore);
  });

  it('(c) a collaborated local project: not offered and refused by the service', async () => {
    await seedProject('pA');
    const archive = await exportDatabaseToJyb({ includeMedia: true });
    await db.texts.put({ id: 'pShared', title: { default: 'S' }, createdAt: NOW, updatedAt: NOW });
    flags.collaborated.add('pShared');

    const preview = await previewJybRestore(archive);
    expect(preview.disasterRestore).toMatchObject({ available: false, reason: 'collaborated' });
    const error = await blockedErrorOf(() => disasterRestoreFromJyb(archive));
    expect(error.reason).toBe('not-allowed');
    expect(await db.texts.get('pShared')).toBeDefined();
    // 逐项目导入仍然可以 | Per-project import still works
    const result = await importJybProjectsAsNew(archive);
    expect(result.projects).toHaveLength(1);
  });

  it('(c) a packaged project with collaboration history on this device is refused too', async () => {
    await seedProject('pA');
    const archive = await exportDatabaseToJyb({ includeMedia: true });
    await clearAll();
    flags.collaborated.add('pA');
    const preview = await previewJybRestore(archive);
    expect(preview.disasterRestore).toMatchObject({ available: false, reason: 'collaborated' });
  });

  it('REV5-N4: a project collaborated on the exporting device is refused on a fresh device', async () => {
    await seedProject('pA');
    await seedProject('pB');
    flags.collaborated.add('pA');
    const archive = await exportDatabaseToJyb({ includeMedia: true });
    expect(
      Object.fromEntries(
        readArchive(archive).manifest.projects.map((p: { id: string; collaborated: boolean }) => [
          p.id,
          p.collaborated,
        ]),
      ),
    ).toEqual({ pA: true, pB: false });
    // 新设备：本机没有任何协作记录 | Fresh device: no local collaboration history
    await clearAll();
    flags.collaborated.clear();
    const preview = await previewJybRestore(archive);
    expect(preview.disasterRestore).toMatchObject({ available: false, reason: 'collaborated' });
    const error = await blockedErrorOf(() => disasterRestoreFromJyb(archive));
    expect(error.reason).toBe('not-allowed');
    expect(await db.texts.count()).toBe(0);
  });

  it('REV5-N4: a JYB without the flag counts as collaborated', async () => {
    await seedProject('pA');
    const files = unzipSync(await exportDatabaseToJyb({ includeMedia: true }));
    const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!)) as Record<string, any>;
    for (const project of manifest.projects) delete project.collaborated;
    files['META-INF/manifest.json'] = strToU8(JSON.stringify(manifest));
    await clearAll();
    const preview = await previewJybRestore(zipSync(files as Zippable));
    expect(preview.disasterRestore).toMatchObject({ available: false, reason: 'collaborated' });
  });
});

describe('JYB inbound checks', () => {
  beforeEach(async () => {
    await seedProject('pA');
  });

  it('rejects a tampered byte file before any write', async () => {
    const files = unzipSync(await exportDatabaseToJyb({ includeMedia: true }));
    files['media/pA-media'] = strToU8('RIFF-tampered');
    await clearAll();
    const error = await formatErrorOf(() => importJybProjectsAsNew(zipSync(files as Zippable)));
    expect(error.code).toBe('invalid-package');
    expect(await db.texts.count()).toBe(0);
  });

  it('rejects rows of a never-packaged table planted in the data', async () => {
    const files = unzipSync(await exportDatabaseToJyb({ includeMedia: false }));
    const data = JSON.parse(strFromU8(files['data/library.json']!));
    data.projects[0].collections.external_mcp_trust = [
      { id: 'x', origin: 'https://evil.example', enabled: true, createdAt: NOW, updatedAt: NOW },
    ];
    const dataBytes = strToU8(JSON.stringify(data));
    const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!));
    manifest.files[0].sha256 = await sha256Hex(dataBytes);
    manifest.files[0].size = dataBytes.byteLength;
    files['data/library.json'] = dataBytes;
    files['META-INF/manifest.json'] = strToU8(JSON.stringify(manifest));
    await clearAll();
    const error = await formatErrorOf(() => previewJybRestore(zipSync(files as Zippable)));
    expect(error.code).toBe('invalid-package');
    expect(error.message).toContain('external_mcp_trust');
  });

  it('refuses a JYT given as a JYB', async () => {
    const error = await formatErrorOf(async () =>
      previewJybRestore(await exportProjectToJyt('pA')),
    );
    expect(error.code).toBe('unsupported-package');
  });

  it('encrypted JYB round-trips with the password and refuses without it', async () => {
    const archive = await exportDatabaseToJyb({
      includeMedia: true,
      encryption: { password: 'pw' },
    });
    const files = unzipSync(archive);
    expect(files['data/library.json']).toBeUndefined();
    expect(strFromU8(files['data/library.enc']!)).not.toContain('Project pA');
    await clearAll();
    await expect(previewJybRestore(archive)).rejects.toThrow();
    const result = await importJybProjectsAsNew(archive, { password: 'pw' });
    const media = await db.media_items
      .where('textId')
      .equals(result.projects[0]!.projectId)
      .first();
    expect(await blobText(media?.details?.['audioBlob'])).toBe(AUDIO);
  });

  it('refuses an export whose bytes exceed the limit before reading them', async () => {
    await expect(
      exportDatabaseToJyb({ includeMedia: true, policy: { maxArchiveBytes: 4 } }),
    ).rejects.toThrow(/too large/i);
  });
});
