import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTurn } from './aiRuntimeV2TurnStore';
import { db } from './engine';
import type { AuditLogDocType, LayerUnitDocType } from './types';
import {
  dexieStoragePort,
  installStoragePort,
  StorageReadbackError,
  type StoragePort,
} from './storagePort';
import { describeStoragePortContract } from './storagePortContract';

const NOW = '2026-10-15T00:00:00.000Z';

async function clearDb() {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
}

describeStoragePortContract('dexie', () => dexieStoragePort, clearDb);

describe('dexie storage port', () => {
  beforeEach(clearDb);
  afterEach(() => {
    vi.restoreAllMocks();
    installStoragePort(dexieStoragePort);
  });

  it('fingerprints a segment with its content rows', async () => {
    await db.layer_units.put({
      id: 'unit-1',
      textId: 'text-a',
      layerId: 'layer-a',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerUnitDocType);
    await db.layer_unit_contents.put({
      id: 'content-1',
      unitId: 'unit-1',
      text: 'hello',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(dexieStoragePort.fingerprintTarget('unit-1')).resolves.toBe(
      `layer_units:${NOW}|content-1@${NOW}`,
    );
  });

  it('keeps the written turn when read-back fails', async () => {
    vi.spyOn(db.ai_runtime_v2_turns, 'get').mockResolvedValueOnce(undefined);
    await expect(
      dexieStoragePort.turns.putTurn({ conversationId: 'c-miss', createdAt: 1, expiresAt: 50 }),
    ).rejects.toBeInstanceOf(StorageReadbackError);
    vi.restoreAllMocks();
    await expect(db.ai_runtime_v2_turns.get('c-miss')).resolves.toMatchObject({
      conversationId: 'c-miss',
    });
  });

  it('reports a missing audit row after insert as read-back failure', async () => {
    const row: AuditLogDocType = {
      id: 'audit-miss',
      collection: 'ai_messages',
      documentId: 'doc-1',
      action: 'update',
      source: 'ai',
      timestamp: NOW,
    };
    vi.spyOn(db.audit_logs, 'get').mockResolvedValueOnce(undefined);
    await expect(dexieStoragePort.audit.insertAuditLog(row)).rejects.toBeInstanceOf(
      StorageReadbackError,
    );
    vi.restoreAllMocks();
    await expect(db.audit_logs.get('audit-miss')).resolves.toMatchObject({ id: 'audit-miss' });
  });

  it('routes the turn store through the installed implementation', async () => {
    const fake: StoragePort = {
      ...dexieStoragePort,
      turns: { ...dexieStoragePort.turns, getTurn: async <T>() => ({ from: 'fake' }) as T },
    };
    installStoragePort(fake);
    await expect(getTurn('any')).resolves.toEqual({ from: 'fake' });
  });
});
