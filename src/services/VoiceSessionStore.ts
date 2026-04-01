/**
 * VoiceSessionStore — IndexedDB persistence for voice sessions.
 *
 * Stores VoiceSession objects so that command history survives page reloads.
 *
 * @see 解语-语音智能体架构设计方案 §4.5
 */

import type { VoiceSession } from './IntentRouter';

const DB_NAME = 'jieyu-voice-sessions';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const MAX_STORED_SESSIONS = 20;

/** Open (or create) the IndexedDB database. */
function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('startedAt', 'startedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Persist a voice session. Old sessions beyond MAX_STORED_SESSIONS are pruned. */
export async function saveVoiceSession(session: VoiceSession): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Upsert
    store.put(session);

    // Prune oldest sessions if over limit
    const index = store.index('startedAt');
    const countReq = store.count();
    countReq.onsuccess = () => {
      const count = countReq.result;
      if (count > MAX_STORED_SESSIONS) {
        const toDelete = count - MAX_STORED_SESSIONS;
        const cursorReq = index.openCursor();
        let deleted = 0;
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor && deleted < toDelete) {
            cursor.delete();
            deleted++;
            cursor.continue();
          }
        };
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('VoiceSessionStore transaction aborted'));
    };
  });
}

/** Load the most recent N voice sessions, newest first. */
export async function loadRecentVoiceSessions(
  limit = 5,
): Promise<VoiceSession[]> {
  const db = await openDB();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('startedAt');
    const sessions: VoiceSession[] = [];

    const cursorReq = index.openCursor(null, 'prev');
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor && sessions.length < limit) {
        sessions.push(cursor.value as VoiceSession);
        cursor.continue();
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve(sessions);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('VoiceSessionStore transaction aborted'));
    };
  });
}

/** Delete a specific session by id. */
export async function deleteVoiceSession(id: string): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('VoiceSessionStore transaction aborted'));
    };
  });
}

/** Clear all stored sessions. */
export async function clearAllVoiceSessions(): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('VoiceSessionStore transaction aborted'));
    };
  });
}
