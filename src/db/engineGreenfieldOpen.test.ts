import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { JieyuDexie } from './engine';

describe('JieyuDexie greenfield open', () => {
  const createdNames: string[] = [];

  afterEach(async () => {
    await Promise.all(createdNames.map((name) => Dexie.delete(name)));
    createdNames.length = 0;
  });

  it('opens a fresh database and exposes core transcription tables', async () => {
    const name = `jieyu_greenfield_open_${Date.now()}`;
    createdNames.push(name);
    const db = new JieyuDexie(name);
    await db.open();
    expect(db.isOpen()).toBe(true);
    const names = new Set(db.tables.map((t) => t.name));
    expect(names.has('texts')).toBe(true);
    expect(names.has('layer_units')).toBe(true);
    expect(names.has('track_entities')).toBe(true);
    expect(names.has('media_items')).toBe(true);
    await db.close();
  });
});
