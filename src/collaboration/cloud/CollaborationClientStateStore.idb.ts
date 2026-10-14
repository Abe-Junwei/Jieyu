import Dexie, { type Table } from 'dexie';

const DB_NAME = 'jieyu_collab_client_state';
const ROW_ID = 'singleton';

interface CollabClientStateBlobRow {
  id: string;
  json: string;
}

interface CollabOutboundOpRow {
  key: string;
  projectId: string;
  json: string;
}

interface CollabCursorRow {
  projectId: string;
  revision: number;
}

class CollaborationClientStateIdb extends Dexie {
  blobs!: Table<CollabClientStateBlobRow, string>;
  ops!: Table<CollabOutboundOpRow, string>;
  cursors!: Table<CollabCursorRow, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      blobs: 'id',
    });
    this.version(2).stores({
      blobs: 'id',
      ops: 'key, projectId',
      cursors: 'projectId',
    });
  }
}

let singleton: CollaborationClientStateIdb | null = null;

function getDb(): CollaborationClientStateIdb {
  singleton ??= new CollaborationClientStateIdb();
  return singleton;
}

export async function loadCollabClientStateBlobFromIdb(): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const row = await getDb().blobs.get(ROW_ID);
    return row?.json ?? null;
  } catch {
    return null;
  }
}

export async function saveCollabClientStateBlobToIdb(json: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await getDb().blobs.put({ id: ROW_ID, json });
}

export async function mirrorOutboundOpToIdb(
  key: string,
  projectId: string,
  json: string,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await getDb().ops.put({ key, projectId, json });
}

export async function deleteOutboundOpFromIdb(key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await getDb().ops.delete(key);
}

/** Cursor only moves forward inside one IDB transaction, including across tabs. */
export async function advanceOutboundCursorInIdb(
  projectId: string,
  revision: number,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const cursors = getDb().cursors;
  await getDb().transaction('rw', cursors, async () => {
    const row = await cursors.get(projectId);
    if (row === undefined || revision > row.revision) {
      await cursors.put({ projectId, revision });
    }
  });
}

export async function listAllOutboundOpsFromIdb(): Promise<Array<{ key: string; json: string }>> {
  if (typeof indexedDB === 'undefined') return [];
  const rows = await getDb().ops.toArray();
  return rows.map((row) => ({ key: row.key, json: row.json }));
}

export async function listOutboundCursorsFromIdb(): Promise<
  Array<{ projectId: string; revision: number }>
> {
  if (typeof indexedDB === 'undefined') return [];
  return getDb().cursors.toArray();
}

export async function deleteOutboundCursorFromIdb(projectId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await getDb().cursors.delete(projectId);
}

export async function deleteCollabClientStateBlobFromIdb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await getDb().blobs.delete(ROW_ID);
}

/** Test helper: clear IDB tables so Dexie state does not leak across cases. */
export async function resetCollaborationClientStateIdbForTests(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = getDb();
    await db.blobs.clear();
    await db.ops.clear();
    await db.cursors.clear();
  } catch {
    /* ignore */
  }
}
