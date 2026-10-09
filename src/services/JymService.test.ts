import { describe, expect, it, vi, beforeEach } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  collectArchiveSystemRefs,
  exportToJieyuArchive,
  importFromJieyuArchive,
  previewJieyuArchiveImport,
} from './JymService';
import { exportDatabaseAsJson, importDatabaseFromJson } from '../db/io';

/** JymService loads db I/O via dynamic import('../db/io'); mock that module, not ../db. */
vi.mock('../db/io', () => ({
  exportDatabaseAsJson: vi.fn(async () => ({
    schemaVersion: 5,
    exportedAt: '2026-04-01T00:00:00.000Z',
    dbName: 'jieyu-test',
    collections: {},
  })),
  importDatabaseFromJson: vi.fn(async () => ({
    written: 1,
    skipped: 0,
  })),
  assertSupportedSnapshotVersion: vi.fn(),
  prepareSnapshotImport: vi.fn(async () => ({
    preparedCollections: [],
    ignoredCollections: [],
    droppedCollections: [],
  })),
}));

function createArchive(entries: Record<string, string | Uint8Array>): Uint8Array {
  const payload: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(entries)) {
    payload[name] = typeof value === 'string' ? strToU8(value) : value;
  }
  return zipSync(payload);
}

function createValidArchive(snapshot: unknown): Uint8Array {
  const manifest = {
    formatVersion: 1,
    kind: 'jym',
    schemaVersion: 5,
    exportedAt: '2026-04-01T00:00:00.000Z',
    dbName: 'jieyu-test',
  };
  return createArchive({
    mimetype: 'application/x-jieyu-media',
    'META-INF/manifest.json': JSON.stringify(manifest),
    'data/snapshot.json': JSON.stringify(snapshot),
  });
}

function createNestedObject(depth: number): unknown {
  let node: unknown = { value: 'leaf' };
  for (let i = 0; i < depth; i += 1) {
    node = { next: node };
  }
  return node;
}

describe('JymService import hard guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects archive when total size exceeds limit', async () => {
    await expect(
      importFromJieyuArchive(new Uint8Array([1, 2, 3, 4]), {
        policy: { maxArchiveBytes: 2 },
      }),
    ).rejects.toThrow('archive size exceeds limit');
  });

  it('rejects malformed archive payload', async () => {
    await expect(
      importFromJieyuArchive(new Uint8Array([1, 2, 3]), {
        policy: { maxArchiveBytes: 1024 },
      }),
    ).rejects.toThrow('failed to unzip archive payload');
  });

  it('rejects archive when entry count exceeds limit', async () => {
    const archive = createArchive({
      a: '{}',
      b: '{}',
      c: '{}',
    });

    await expect(
      importFromJieyuArchive(archive, {
        policy: { maxEntryCount: 2 },
      }),
    ).rejects.toThrow('entry count exceeds limit');
  });

  it('rejects archive when any single entry exceeds size limit', async () => {
    const snapshot = {
      schemaVersion: 5,
      exportedAt: '2026-04-01T00:00:00.000Z',
      dbName: 'jieyu-test',
      collections: {
        huge: [{ id: 'x', payload: 'x'.repeat(600) }],
      },
    };

    const archive = createValidArchive(snapshot);

    await expect(
      importFromJieyuArchive(archive, {
        policy: { maxEntryBytes: 256 },
      }),
    ).rejects.toThrow('entry "data/snapshot.json" exceeds size limit');
  });

  it('rejects archive when total expanded size exceeds limit before import', async () => {
    const snapshot = {
      schemaVersion: 5,
      exportedAt: '2026-04-01T00:00:00.000Z',
      dbName: 'jieyu-test',
      collections: {
        compressedButHuge: [{ id: 'x', payload: 'A'.repeat(4096) }],
      },
    };

    const archive = createValidArchive(snapshot);

    await expect(
      importFromJieyuArchive(archive, {
        policy: {
          maxEntryBytes: 10 * 1024,
          maxExpandedBytes: 512,
        },
      }),
    ).rejects.toThrow('total expanded size exceeds limit');
  });

  it('rejects archive when snapshot json depth exceeds limit', async () => {
    const snapshot = {
      schemaVersion: 5,
      exportedAt: '2026-04-01T00:00:00.000Z',
      dbName: 'jieyu-test',
      collections: {
        deep: createNestedObject(8),
      },
    };

    const archive = createValidArchive(snapshot);

    await expect(
      importFromJieyuArchive(archive, {
        policy: { maxJsonDepth: 6 },
      }),
    ).rejects.toThrow('snapshot JSON depth exceeds limit');
  });

  it('imports valid archive and forwards strategy to database importer', async () => {
    const snapshot = {
      schemaVersion: 5,
      exportedAt: '2026-04-01T00:00:00.000Z',
      dbName: 'jieyu-test',
      collections: {},
    };

    const archive = createValidArchive(snapshot);
    const result = await importFromJieyuArchive(archive, {
      strategy: 'replace-all',
    });

    expect(result.kind).toBe('jym');
    expect(importDatabaseFromJson).toHaveBeenCalledWith(snapshot, {
      strategy: 'replace-all',
    });
  });

  it('exports a standard archive that importFromJieyuArchive can ingest', async () => {
    const archive = await exportToJieyuArchive('jym');

    const result = await importFromJieyuArchive(archive, {
      strategy: 'upsert',
    });

    expect(result.kind).toBe('jym');
    expect(importDatabaseFromJson).toHaveBeenLastCalledWith(
      expect.objectContaining({
        schemaVersion: 5,
        dbName: 'jieyu-test',
      }),
      {
        strategy: 'upsert',
      },
    );
  });
});

describe('T51 archive system template references', () => {
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

  it('exports systemRefs in the manifest and never the template itself', async () => {
    vi.mocked(exportDatabaseAsJson).mockResolvedValueOnce({
      schemaVersion: 5,
      exportedAt: '2026-04-01T00:00:00.000Z',
      dbName: 'jieyu-test',
      collections: { structural_rule_profiles: [copyRow] },
    });
    const files = unzipSync(await exportToJieyuArchive('jym'));
    const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!)) as {
      systemRefs?: Array<{ id: string }>;
    };
    expect(manifest.systemRefs).toEqual([{ id: 'system.leipzig-structural.v1' }]);
    const snapshot = JSON.parse(strFromU8(files['data/snapshot.json']!)) as {
      collections: Record<string, Array<{ id: string }>>;
    };
    const storedIds = Object.values(snapshot.collections)
      .flat()
      .map((row) => row.id);
    expect(storedIds.some((id) => id.startsWith('system.'))).toBe(false);
  });

  it('lists system refs the running code cannot resolve in the import preview', async () => {
    const archive = createArchive({
      mimetype: 'application/x-jieyu-media',
      'META-INF/manifest.json': JSON.stringify({
        formatVersion: 1,
        kind: 'jym',
        schemaVersion: 5,
        exportedAt: '2026-04-01T00:00:00.000Z',
        systemRefs: [{ id: 'system.leipzig-structural.v1' }, { id: 'system.future-template.v9' }],
      }),
      'data/snapshot.json': JSON.stringify({ collections: {} }),
    });
    const preview = await previewJieyuArchiveImport(archive);
    expect(preview.unresolvedSystemRefs).toEqual(['system.future-template.v9']);
  });
});
