import Dexie, { type Table } from 'dexie';

const DB_NAME = 'jieyu_collab_client_state';
const ROW_ID = 'singleton';

interface CollabClientStateBlobRow {
  id: string;
  json: string;
}

class CollaborationClientStateIdb extends Dexie {
  blobs!: Table<CollabClientStateBlobRow, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      blobs: 'id',
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

/** Test helper: clear IDB table so Dexie state does not leak across cases. */
export async function resetCollaborationClientStateIdbForTests(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await getDb().blobs.clear();
  } catch {
    /* ignore */
  }
}
