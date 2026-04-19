import { describe, expect, it, vi, beforeEach } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { exportToJieyuArchive, importFromJieyuArchive } from './JymService';
import { importDatabaseFromJson } from '../db';

vi.mock('../db', () => ({
  exportDatabaseAsJson: vi.fn(async () => ({
    schemaVersion: 4,
    exportedAt: '2026-04-01T00:00:00.000Z',
    dbName: 'jieyu-test',
    collections: {},
  })),
  importDatabaseFromJson: vi.fn(async () => ({
    written: 1,
    skipped: 0,
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
    schemaVersion: 4,
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
    await expect(importFromJieyuArchive(new Uint8Array([1, 2, 3, 4]), {
      policy: { maxArchiveBytes: 2 },
    })).rejects.toThrow('archive size exceeds limit');
  });

  it('rejects malformed archive payload', async () => {
    await expect(importFromJieyuArchive(new Uint8Array([1, 2, 3]), {
      policy: { maxArchiveBytes: 1024 },
    })).rejects.toThrow('failed to unzip archive payload');
  });

  it('rejects archive when entry count exceeds limit', async () => {
    const archive = createArchive({
      a: '{}',
      b: '{}',
      c: '{}',
    });

    await expect(importFromJieyuArchive(archive, {
      policy: { maxEntryCount: 2 },
    })).rejects.toThrow('entry count exceeds limit');
  });

  it('rejects archive when any single entry exceeds size limit', async () => {
    const snapshot = {
      schemaVersion: 4,
      exportedAt: '2026-04-01T00:00:00.000Z',
      dbName: 'jieyu-test',
      collections: {
        huge: [{ id: 'x', payload: 'x'.repeat(600) }],
      },
    };

    const archive = createValidArchive(snapshot);

    await expect(importFromJieyuArchive(archive, {
      policy: { maxEntryBytes: 256 },
    })).rejects.toThrow('entry "data/snapshot.json" exceeds size limit');
  });

  it('rejects archive when total expanded size exceeds limit before import', async () => {
    const snapshot = {
      schemaVersion: 4,
      exportedAt: '2026-04-01T00:00:00.000Z',
      dbName: 'jieyu-test',
      collections: {
        compressedButHuge: [{ id: 'x', payload: 'A'.repeat(4096) }],
      },
    };

    const archive = createValidArchive(snapshot);

    await expect(importFromJieyuArchive(archive, {
      policy: {
        maxEntryBytes: 10 * 1024,
        maxExpandedBytes: 512,
      },
    })).rejects.toThrow('total expanded size exceeds limit');
  });

  it('rejects archive when snapshot json depth exceeds limit', async () => {
    const snapshot = {
      schemaVersion: 4,
      exportedAt: '2026-04-01T00:00:00.000Z',
      dbName: 'jieyu-test',
      collections: {
        deep: createNestedObject(8),
      },
    };

    const archive = createValidArchive(snapshot);

    await expect(importFromJieyuArchive(archive, {
      policy: { maxJsonDepth: 6 },
    })).rejects.toThrow('snapshot JSON depth exceeds limit');
  });

  it('imports valid archive and forwards strategy to database importer', async () => {
    const snapshot = {
      schemaVersion: 4,
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
    expect(importDatabaseFromJson).toHaveBeenLastCalledWith(expect.objectContaining({
      schemaVersion: 4,
      dbName: 'jieyu-test',
    }), {
      strategy: 'upsert',
    });
  });
});
