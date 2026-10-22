import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recordingRemovalBlockReason, type StoragePort } from './storagePort';
import { openSqliteStoragePort } from './sqliteStoragePort';

const NOW = '2026-10-22T00:00:00.000Z';

function turn(conversationId: string, expiresAt: number) {
  return { conversationId, createdAt: 1, expiresAt, messages: [{ role: 'user', content: 'hi' }] };
}

describe('sqlite storage port userData slice', () => {
  const opened: { close: () => void }[] = [];

  afterEach(() => {
    for (const port of opened) port.close();
    opened.length = 0;
  });

  function open(): StoragePort {
    const file = join(mkdtempSync(join(tmpdir(), 'jieyu-sqlite-port-')), 'user-data.sqlite');
    const handle = openSqliteStoragePort(file);
    opened.push(handle);
    return handle.port;
  }

  it('reads a turn back after the file is closed and opened again', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'jieyu-sqlite-port-')), 'user-data.sqlite');
    const first = openSqliteStoragePort(file);
    await first.port.turns.putTurn(turn('c1', 70));
    first.close();
    const second = openSqliteStoragePort(file);
    opened.push(second);
    await expect(second.port.turns.getTurn('c1')).resolves.toEqual(turn('c1', 70));
  });

  it('lets the second turn write win, then deletes it', async () => {
    const port = open();
    await port.turns.putTurn(turn('c1', 50));
    await port.turns.putTurn(turn('c1', 70));
    await expect(port.turns.getTurn('c1')).resolves.toMatchObject({ expiresAt: 70 });
    await port.turns.deleteTurn('c1');
    await port.turns.deleteTurn('absent');
    await expect(port.turns.getTurn('c1')).resolves.toBeUndefined();
  });

  it('sweeps expired turns and keeps live ones', async () => {
    const port = open();
    await port.turns.putTurn(turn('old', 10));
    await port.turns.putTurn(turn('live', 80));
    await port.turns.sweepExpiredTurns(20);
    await expect(port.turns.getTurn('old')).resolves.toBeUndefined();
    await expect(port.turns.getTurn('live')).resolves.toMatchObject({ conversationId: 'live' });
  });

  it('reads an audit row back after inserting it', async () => {
    const port = open();
    await port.audit.insertAuditLog({
      id: 'audit-1',
      collection: 'ai_messages',
      documentId: 'doc-1',
      action: 'update',
      source: 'ai',
      timestamp: NOW,
      requestId: 'req-audit-1',
    });
    await expect(port.audit.getAuditLog('audit-1')).resolves.toMatchObject({
      id: 'audit-1',
      requestId: 'req-audit-1',
      timestamp: NOW,
    });
  });

  it('has no fingerprint until project rows are stored here', async () => {
    const port = open();
    await expect(port.fingerprintTarget('missing')).resolves.toBeUndefined();
  });

  it('refuses to remove a recording this slice does not store', async () => {
    const port = open();
    await expect(port.removeEmptyRecording('missing-media')).rejects.toSatisfy(
      (error: unknown) => recordingRemovalBlockReason(error) === 'missing',
    );
  });

  it('refuses a project-folder operation', async () => {
    const port = open();
    await expect(port.readProject('p-1')).rejects.toThrow(/has not implemented readProject/);
  });
});
