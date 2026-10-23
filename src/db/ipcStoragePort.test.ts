import { afterEach, describe, expect, it } from 'vitest';
import { installSqliteIpcPortIfEnabled } from './installSqliteIpcPort';
import { createIpcStoragePort } from './ipcStoragePort';
import { dexieStoragePort, installStoragePort, storagePort } from './storagePort';

afterEach(() => {
  installStoragePort(dexieStoragePort);
});

describe('ipc storage port', () => {
  it('sends one call per method, including nested turn methods', async () => {
    const seen: { method: string; args: readonly unknown[] }[] = [];
    const port = createIpcStoragePort(async (method, args) => {
      seen.push({ method, args });
      return { conversationId: 'c1', createdAt: 1, expiresAt: 70 };
    });
    await port.turns.putTurn({ conversationId: 'c1', createdAt: 1, expiresAt: 70 });
    await expect(port.turns.getTurn('c1')).resolves.toEqual({
      conversationId: 'c1',
      createdAt: 1,
      expiresAt: 70,
    });
    expect(seen).toEqual([
      { method: 'turns.putTurn', args: [{ conversationId: 'c1', createdAt: 1, expiresAt: 70 }] },
      { method: 'turns.getTurn', args: ['c1'] },
    ]);
  });

  it('does not install when the flag is off or the desktop bridge is missing', async () => {
    const before = storagePort();
    const invoke = async () => 'from-ipc';
    expect(installSqliteIpcPortIfEnabled({ enabled: false, invoke })).toBe(false);
    expect(storagePort()).toBe(before);
    expect(installSqliteIpcPortIfEnabled({ enabled: true, invoke: undefined })).toBe(false);
    expect(storagePort()).toBe(before);
    expect(installSqliteIpcPortIfEnabled({ enabled: true, invoke })).toBe(true);
    expect(storagePort()).not.toBe(before);
    await expect(storagePort().turns.getTurn('c1')).resolves.toBe('from-ipc');
  });
});
